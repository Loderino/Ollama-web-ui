from celery.result import AsyncResult
from fastapi import FastAPI

from app.celery_app import celery_app
from app.tasks import ping

app = FastAPI(title="Ollama Web UI")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/test-task")
def test_task(seconds: int = 3) -> dict[str, str]:
    task = ping.delay(seconds)
    return {"task_id": task.id}


@app.get("/test-task/{task_id}")
def test_task_status(task_id: str) -> dict:
    result = AsyncResult(task_id, app=celery_app)
    return {
        "task_id": task_id,
        "status": result.status,
        "result": result.result if result.ready() else None,
    }
