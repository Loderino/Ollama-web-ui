import json
import time

import httpx
import redis
from sqlalchemy import select

from app.celery_app import celery_app
from app.clickhouse_client import log_metrics
from app.config import settings
from app.database import SyncSessionLocal
from app.models import Chat, Connection, Message


def _prepare_ollama_request(chat_id: int, prompt: str):
    with SyncSessionLocal() as db:
        chat = db.get(Chat, chat_id)
        if not chat or not chat.model_name:
            raise ValueError(f"Chat {chat_id} not configured")
        connection = db.get(Connection, chat.connection_id)
        if not connection:
            raise ValueError(f"Connection for chat {chat_id} not found")

        user_msg = Message(chat_id=chat_id, role="user", content=prompt)
        db.add(user_msg)
        db.commit()

        history_query = select(Message).where(Message.chat_id == chat_id).order_by(Message.id.desc()).limit(20)
        history = db.execute(history_query).scalars().all()
        history = list(reversed(history))
        ollama_messages = [{"role": m.role, "content": m.content} for m in history]

        return {
            "url": f"{connection.base_url.rstrip('/')}/api/chat",
            "headers": {"Authorization": f"Bearer {connection.api_key}"} if connection.api_key else {},
            "model": chat.model_name,
            "options": {
                k: v
                for k, v in {
                    "temperature": chat.temperature,
                    "top_k": chat.top_k,
                    "top_p": chat.top_p,
                }.items()
                if v is not None
            },
            "messages": ollama_messages,
        }


@celery_app.task(
    autoretry_for=(httpx.RequestError,),
    max_retries=3,
    retry_backoff=True,
    retry_jitter=True,
)
def generate_ollama_response(chat_id: int, prompt: str, think: bool | None = None) -> str:
    ctx = _prepare_ollama_request(chat_id, prompt)

    payload = {
        "model": ctx["model"],
        "messages": ctx["messages"],
        "stream": False,
        "options": ctx["options"],
    }
    if think is not None:
        payload["think"] = think

    r = redis.from_url(settings.redis_url)
    channel = f"chat_{chat_id}"
    full_answer = ""
    full_thinking = ""
    error_occurred = False

    start_time = time.perf_counter()

    try:
        with httpx.Client(timeout=300.0) as client:
            response = client.post(ctx["url"], json=payload, headers=ctx["headers"])
            response.raise_for_status()
            data = response.json()
            full_answer = data.get("message", {}).get("content", "")
            full_thinking = data.get("message", {}).get("thinking", "")

            http_response_ms = int((time.perf_counter() - start_time) * 1000)

            log_metrics(
                model=ctx["model"],
                prompt_tokens=data.get("prompt_eval_count", 0),
                completion_tokens=data.get("eval_count", 0),
                prompt_chars=len(prompt),
                response_chars=len(full_answer),
                http_response_ms=http_response_ms,
                ollama_total_ms=int(data.get("total_duration", 0) / 1_000_000),
                eval_duration_ms=int(data.get("eval_duration", 0) / 1_000_000),
            )

    except httpx.HTTPStatusError as e:
        error_occurred = True
        full_answer = f"Ошибка сервера: HTTP {e.response.status_code}"
    except httpx.RequestError:
        error_occurred = True
        full_answer = "Не удалось подключиться к серверу Ollama."

    if not error_occurred:
        with SyncSessionLocal() as db:
            assistant_msg = Message(
                chat_id=chat_id, role="assistant", content=full_answer, thinking=full_thinking or None
            )
            db.add(assistant_msg)
            db.commit()
            msg_id = assistant_msg.id

        event = {
            "type": "message.done",
            "message": {
                "id": msg_id,
                "chat_id": chat_id,
                "role": "assistant",
                "content": full_answer,
                "thinking": full_thinking,
            },
        }
    else:
        event = {
            "type": "message.done",
            "message": {"id": int(time.time() * 1000), "chat_id": chat_id, "role": "system", "content": full_answer},
        }

    r.publish(channel, json.dumps(event))
    return full_answer


@celery_app.task(
    autoretry_for=(httpx.RequestError,),
    max_retries=3,
    retry_backoff=True,
    retry_jitter=True,
)
def generate_ollama_response_stream(chat_id: int, prompt: str, think: bool | None = None) -> str:
    ctx = _prepare_ollama_request(chat_id, prompt)

    payload = {
        "model": ctx["model"],
        "messages": ctx["messages"],
        "stream": True,
        "options": ctx["options"],
    }
    if think is not None:
        payload["think"] = think

    r = redis.from_url(settings.redis_url)
    channel = f"chat_{chat_id}"

    full_answer = ""
    full_thinking = ""
    buffer = ""
    thinking_buffer = ""
    last_sent_time = time.monotonic()
    error_occurred = False

    start_time = time.perf_counter()
    final_data = {}

    try:
        with httpx.Client(timeout=300.0) as client:
            with client.stream("POST", ctx["url"], json=payload, headers=ctx["headers"]) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line:
                        continue
                    data = json.loads(line)

                    chunk_content = data.get("message", {}).get("content", "")
                    chunk_thinking = data.get("message", {}).get("thinking", "")

                    if chunk_content:
                        full_answer += chunk_content
                        buffer += chunk_content

                    if chunk_thinking:
                        full_thinking += chunk_thinking
                        thinking_buffer += chunk_thinking

                    now = time.monotonic()
                    if now - last_sent_time >= 0.1 and (buffer or thinking_buffer):
                        event = {
                            "type": "message.chunk",
                            "chat_id": chat_id,
                            "content": buffer,
                            "thinking": thinking_buffer,
                        }
                        r.publish(channel, json.dumps(event))
                        buffer = ""
                        thinking_buffer = ""
                        last_sent_time = now

                    if data.get("done"):
                        final_data = data
                        break

    except httpx.HTTPStatusError as e:
        error_occurred = True
        full_answer = f"Ошибка сервера: HTTP {e.response.status_code}"
    except httpx.RequestError:
        error_occurred = True
        full_answer = "Не удалось подключиться к серверу Ollama."

    finally:
        if buffer or thinking_buffer:
            event = {"type": "message.chunk", "chat_id": chat_id, "content": buffer, "thinking": thinking_buffer}
            r.publish(channel, json.dumps(event))

        if not error_occurred:
            http_response_ms = int((time.perf_counter() - start_time) * 1000)

            if final_data:
                log_metrics(
                    model=ctx["model"],
                    prompt_tokens=final_data.get("prompt_eval_count", 0),
                    completion_tokens=final_data.get("eval_count", 0),
                    prompt_chars=len(prompt),
                    response_chars=len(full_answer),
                    http_response_ms=http_response_ms,
                    ollama_total_ms=int(final_data.get("total_duration", 0) / 1_000_000),
                    eval_duration_ms=int(final_data.get("eval_duration", 0) / 1_000_000),
                )

            with SyncSessionLocal() as db:
                final_content = full_answer if full_answer else "Генерация была прервана."

                assistant_msg = Message(
                    chat_id=chat_id, role="assistant", content=final_content, thinking=full_thinking or None
                )
                db.add(assistant_msg)
                db.commit()
                msg_id = assistant_msg.id

            event = {
                "type": "message.done",
                "message": {
                    "id": msg_id,
                    "chat_id": chat_id,
                    "role": "assistant",
                    "content": final_content,
                    "thinking": full_thinking,
                },
            }
        else:
            event = {
                "type": "message.done",
                "message": {
                    "id": int(time.time() * 1000),
                    "chat_id": chat_id,
                    "role": "system",
                    "content": full_answer,
                },
            }

        r.publish(channel, json.dumps(event))

    return full_answer
