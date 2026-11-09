import httpx

from app.celery_app import celery_app


@celery_app.task(
    autoretry_for=(httpx.RequestError,),
    max_retries=3,
    retry_backoff=True,
    retry_jitter=True,
)
def generate_ollama_response(
    ollama_url: str,
    model: str,
    prompt: str,
    temperature: float | None = None,
    top_k: int | None = None,
    top_p: float | None = None,
) -> str:
    url = f"{ollama_url.rstrip('/')}/api/generate"

    options = {}
    if temperature is not None:
        options["temperature"] = temperature
    if top_k is not None:
        options["top_k"] = top_k
    if top_p is not None:
        options["top_p"] = top_p

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": options,
    }

    with httpx.Client(timeout=300.0) as client:
        response = client.post(url, json=payload)
        response.raise_for_status()
        data = response.json()

    return data.get("response", "")
