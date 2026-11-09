import httpx

from app.celery_app import celery_app
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

        ollama_url = connection.base_url
        model = chat.model_name
        temperature = chat.temperature
        top_k = chat.top_k
        top_p = chat.top_p

    url = f"{ollama_url.rstrip('/')}/api/generate"
    options = {}
    if temperature is not None:
        options["temperature"] = temperature
    if top_k is not None:
        options["top_k"] = top_k
    if top_p is not None:
        options["top_p"] = top_p

    payload = {"model": model, "prompt": prompt, "stream": False, "options": options}

    with httpx.Client(timeout=300.0) as client:
        response = client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()

    answer = data.get("response", "")

    with SyncSessionLocal() as db:
        assistant_msg = Message(chat_id=chat_id, role="assistant", content=answer)
        db.add(assistant_msg)
        db.commit()

    return answer
