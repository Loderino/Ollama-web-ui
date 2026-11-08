import time

from app.celery_app import celery_app


@celery_app.task
def ping(seconds: int = 3) -> str:
    time.sleep(seconds)
    return f"pong after {seconds}s"
