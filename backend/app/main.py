from fastapi import Depends, FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Connection
from app.schemas import ConnectionCreate, ConnectionResponse

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
