import json
import time

import httpx
import redis
from sqlalchemy import select

from app.celery_app import celery_app
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
def generate_ollama_response(chat_id: int, prompt: str) -> str:
    ctx = _prepare_ollama_request(chat_id, prompt)

    payload = {"model": ctx["model"], "messages": ctx["messages"], "stream": False, "options": ctx["options"]}

    r = redis.from_url(settings.redis_url)
    channel = f"chat_{chat_id}"
    full_answer = ""
    error_occurred = False

    try:
        with httpx.Client(timeout=300.0) as client:
            response = client.post(ctx["url"], json=payload, headers=ctx["headers"])
            response.raise_for_status()
            data = response.json()
            full_answer = data.get("message", {}).get("content", "")
    except httpx.HTTPStatusError as e:
        error_occurred = True
        full_answer = f"Ошибка сервера: HTTP {e.response.status_code}"
    except httpx.RequestError:
        error_occurred = True
        full_answer = "Не удалось подключиться к серверу Ollama."

    with SyncSessionLocal() as db:
        assistant_msg = Message(
            chat_id=chat_id, role="assistant" if not error_occurred else "system", content=full_answer
        )
        db.add(assistant_msg)
        db.commit()
        msg_id = assistant_msg.id

    event = {
        "type": "message.done",
        "message": {
            "id": msg_id,
            "chat_id": chat_id,
            "role": "assistant" if not error_occurred else "system",
            "content": full_answer,
        },
    }
    r.publish(channel, json.dumps(event))

    return full_answer


@celery_app.task(
    autoretry_for=(httpx.RequestError,),
    max_retries=3,
    retry_backoff=True,
    retry_jitter=True,
)
def generate_ollama_response_stream(chat_id: int, prompt: str) -> str:
    ctx = _prepare_ollama_request(chat_id, prompt)

    payload = {"model": ctx["model"], "messages": ctx["messages"], "stream": True, "options": ctx["options"]}

    r = redis.from_url(settings.redis_url)
    channel = f"chat_{chat_id}"

    full_answer = ""
    buffer = ""
    last_sent_time = time.monotonic()
    error_occurred = False

    try:
        with httpx.Client(timeout=300.0) as client:
            with client.stream("POST", ctx["url"], json=payload, headers=ctx["headers"]) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    chunk_content = data.get("message", {}).get("content", "")

                    if chunk_content:
                        full_answer += chunk_content
                        buffer += chunk_content

                        now = time.monotonic()
                        if now - last_sent_time >= 0.1:
                            event = {"type": "message.chunk", "chat_id": chat_id, "content": buffer}
                            r.publish(channel, json.dumps(event))
                            buffer = ""
                            last_sent_time = now

                    if data.get("done"):
                        break

    except httpx.HTTPStatusError as e:
        error_occurred = True
        full_answer = f"Ошибка сервера: HTTP {e.response.status_code}"
    except httpx.RequestError:
        error_occurred = True
        full_answer = "Не удалось подключиться к серверу Ollama."

    finally:
        if buffer:
            event = {"type": "message.chunk", "chat_id": chat_id, "content": buffer}
            r.publish(channel, json.dumps(event))

        with SyncSessionLocal() as db:
            final_content = full_answer if full_answer else "Генерация была прервана."

            assistant_msg = Message(
                chat_id=chat_id, role="assistant" if not error_occurred else "system", content=final_content
            )
            db.add(assistant_msg)
            db.commit()
            msg_id = assistant_msg.id

        event = {
            "type": "message.done",
            "message": {
                "id": msg_id,
                "chat_id": chat_id,
                "role": "assistant" if not error_occurred else "system",
                "content": final_content,
            },
        }
        r.publish(channel, json.dumps(event))

    return full_answer
