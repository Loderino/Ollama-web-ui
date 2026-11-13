import clickhouse_connect

from app.config import settings


def get_clickhouse_client():
    return clickhouse_connect.get_client(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        username=settings.clickhouse_user,
        password=settings.clickhouse_password,
        database=settings.clickhouse_db,
    )


def log_metrics(
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    prompt_chars: int,
    response_chars: int,
    http_response_ms: int,
    ollama_total_ms: int,
    eval_duration_ms: int,
):
    try:
        client = get_clickhouse_client()
        client.insert(
            "llm_usage",
            [
                [
                    model,
                    prompt_tokens,
                    completion_tokens,
                    prompt_tokens + completion_tokens,
                    prompt_chars,
                    response_chars,
                    http_response_ms,
                    ollama_total_ms,
                    eval_duration_ms,
                ]
            ],
            column_names=[
                "model",
                "prompt_tokens",
                "completion_tokens",
                "total_tokens",
                "prompt_chars",
                "response_chars",
                "http_response_ms",
                "ollama_total_ms",
                "eval_duration_ms",
            ],
        )
        client.close()
    except Exception as e:
        print(f"Failed to log metrics to ClickHouse: {e}")
