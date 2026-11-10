import json

import httpx
import redis
from sqlalchemy import select

from app.celery_app import celery_app
from app.config import settings
from app.database import SyncSessionLocal
from app.models import Chat, Connection, Message


@celery_app.task(
    autoretry_for=(httpx.RequestError,),
    max_retries=3,
    retry_backoff=True,
    retry_jitter=True,
)
def generate_ollama_response(chat_id: int, prompt: str) -> str:
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

        history_query = select(Message).where(Message.chat_id == chat_id).order_by(Message.id.desc())
        history = db.execute(history_query).scalars().all()
        history = list(reversed(history))
        ollama_messages = [{"role": m.role, "content": m.content} for m in history]

        ollama_url = connection.base_url
        model = chat.model_name
        temperature = chat.temperature
        top_k = chat.top_k
        top_p = chat.top_p

    url = f"{ollama_url.rstrip('/')}/api/chat"
    options = {}
    if temperature is not None:
        options["temperature"] = temperature
    if top_k is not None:
        options["top_k"] = top_k
    if top_p is not None:
        options["top_p"] = top_p

    payload = {"model": model, "messages": ollama_messages, "stream": False, "options": options}

    with httpx.Client(timeout=300.0) as client:
        response = client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()

    answer = data.get("message", {}).get("content", "")

    with SyncSessionLocal() as db:
        assistant_msg = Message(chat_id=chat_id, role="assistant", content=answer)
        db.add(assistant_msg)
        db.commit()

        msg_id = assistant_msg.id

    r = redis.from_url(settings.redis_url)
    event = {
        "type": "message.new",
        "message": {"id": msg_id, "chat_id": chat_id, "role": "assistant", "content": answer},
    }
    r.publish(f"chat_{chat_id}", json.dumps(event))

    return answer
