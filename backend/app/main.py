import httpx
from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Connection
from app.schemas import ConnectionCreate, ConnectionResponse, GenerateRequest, OllamaTagsResponse
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

    connection = Connection(label=data.label, base_url=url_str)
    db.add(connection)
    await db.commit()
    await db.refresh(connection)
    return connection


@app.get("/connections", response_model=list[ConnectionResponse])
async def get_connections(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Connection))
    return result.scalars().all()


@app.get("/connections/{connection_id}/models", response_model=OllamaTagsResponse)
async def get_connection_models(connection_id: int, db: AsyncSession = Depends(get_db)):
    connection = await db.get(Connection, connection_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    url = f"{connection.base_url.rstrip('/')}/api/tags"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()
    except httpx.RequestError as err:
        raise HTTPException(status_code=502, detail=f"Cannot reach Ollama at {connection.base_url}") from err


@app.post("/generate")
async def generate(request: GenerateRequest, db: AsyncSession = Depends(get_db)):
    connection = await db.get(Connection, request.connection_id)
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    task = generate_ollama_response.delay(
        ollama_url=connection.base_url,
        model=request.model,
        prompt=request.prompt,
        temperature=request.temperature,
        top_k=request.top_k,
        top_p=request.top_p,
    )

    return {"task_id": task.id}
