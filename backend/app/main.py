import httpx
import redis.asyncio as aioredis
from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Chat, Connection, Message
from app.schemas import (
    ChatCreate,
    ChatResponse,
    ChatUpdate,
    ConnectionCreate,
    ConnectionResponse,
    GenerateRequest,
    MessageListResponse,
    OllamaTagsResponse,
)
from app.tasks import generate_ollama_response

app = FastAPI(title="Ollama Web UI")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/connections", response_model=ConnectionResponse, status_code=201)
async def create_connection(data: ConnectionCreate, db: AsyncSession = Depends(get_db)):
    url_str = str(data.base_url)
    if "localhost" in url_str or "127.0.0.1" in url_str:
        url_str = url_str.replace("localhost", "host.docker.internal").replace("127.0.0.1", "host.docker.internal")

    connection = Connection(label=data.label, base_url=url_str, api_key=data.api_key)
    db.add(connection)
    await db.commit()
    await db.refresh(connection)
    return connection


@app.get("/connections", response_model=list[ConnectionResponse])
async def get_connections(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Connection))
    return result.scalars().all()


@app.delete("/connections/{connection_id}", status_code=204)
async def delete_connection(connection_id: int, db: AsyncSession = Depends(get_db)):
    connection = await db.get(Connection, connection_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")
    await db.execute(
        update(Chat).where(Chat.connection_id == connection_id).values(connection_id=None, model_name=None)
    )
    await db.delete(connection)
    await db.commit()


@app.get("/connections/{connection_id}/models", response_model=OllamaTagsResponse)
async def get_connection_models(connection_id: int, db: AsyncSession = Depends(get_db)):
    connection = await db.get(Connection, connection_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    url = f"{connection.base_url.rstrip('/')}/api/tags"

    headers = {}
    if connection.api_key:
        headers["Authorization"] = f"Bearer {connection.api_key}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
    except httpx.RequestError as err:
        raise HTTPException(status_code=502, detail=f"Cannot reach Ollama at {connection.base_url}") from err


@app.post("/chats", response_model=ChatResponse, status_code=201)
async def create_chat(data: ChatCreate, db: AsyncSession = Depends(get_db)):
    connection = await db.get(Connection, data.connection_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    chat = Chat(title=data.title, connection_id=data.connection_id)
    db.add(chat)
    await db.commit()
    await db.refresh(chat)
    return chat


@app.get("/chats", response_model=list[ChatResponse])
async def list_chats(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Chat).order_by(Chat.created_at.desc()))
    return result.scalars().all()


@app.get("/chats/{chat_id}", response_model=ChatResponse)
async def get_chat(chat_id: int, db: AsyncSession = Depends(get_db)):
    chat = await db.get(Chat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@app.patch("/chats/{chat_id}", response_model=ChatResponse)
async def update_chat(chat_id: int, data: ChatUpdate, db: AsyncSession = Depends(get_db)):
    chat = await db.get(Chat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(chat, field, value)

    await db.commit()
    await db.refresh(chat)
    return chat


@app.delete("/chats/{chat_id}", status_code=204)
async def delete_chat(chat_id: int, db: AsyncSession = Depends(get_db)):
    chat = await db.get(Chat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    await db.delete(chat)
    await db.commit()


@app.post("/generate")
async def generate(request: GenerateRequest, db: AsyncSession = Depends(get_db)):
    chat = await db.get(Chat, request.chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    task = generate_ollama_response.delay(
        chat_id=request.chat_id,
        prompt=request.prompt,
    )
    return {"task_id": task.id}


@app.get("/chats/{chat_id}/messages", response_model=MessageListResponse)
async def get_messages(
    chat_id: int,
    before_id: int | None = None,
    limit: int = Query(default=50, le=100),
    db: AsyncSession = Depends(get_db),
):
    chat = await db.get(Chat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    query = select(Message).where(Message.chat_id == chat_id)

    if before_id:
        query = query.where(Message.id < before_id)

    query = query.order_by(Message.id.desc()).limit(limit)

    result = await db.execute(query)
    messages = result.scalars().all()

    messages = list(reversed(messages))
    next_cursor = messages[0].id if len(messages) == limit else None

    return {"messages": messages, "next_cursor": next_cursor}


@app.websocket("/ws/chat/{chat_id}")
async def websocket_endpoint(websocket: WebSocket, chat_id: int):
    await websocket.accept()

    r = aioredis.from_url(settings.redis_url)
    pubsub = r.pubsub()
    channel_name = f"chat_{chat_id}"
    await pubsub.subscribe(channel_name)

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                await websocket.send_text(message["data"].decode())
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(channel_name)
        await pubsub.close()
        await r.close()
