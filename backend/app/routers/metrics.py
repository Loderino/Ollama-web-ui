from app.clickhouse_client import get_clickhouse_client
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("")
def get_metrics(model: str | None = None, days: int = Query(default=7, ge=1, le=90)):
    try:
        client = get_clickhouse_client()

        conditions = ["created_at >= now() - INTERVAL {days:UInt32} DAY"]
        params = {"days": days}

        if model:
            conditions.append("model = {model:String}")
            params["model"] = model

        where_clause = " AND ".join(conditions)

        totals = client.query(
            f"""
            SELECT
                count() as total_requests,
                sum(prompt_tokens) as total_prompt_tokens,
                sum(completion_tokens) as total_completion_tokens,
                avg(http_response_ms) as avg_response_ms
            FROM llm_usage
            WHERE {where_clause}
        """,
            parameters=params,
        ).result_rows[0]

        models_data = client.query(
            f"""
            SELECT
                model,
                count() as requests,
                sum(total_tokens) as tokens,
                avg(http_response_ms) as avg_ms
            FROM llm_usage
            WHERE {where_clause}
            GROUP BY model
            ORDER BY requests DESC
        """,
            parameters=params,
        ).result_rows

        all_models = [row[0] for row in client.query("SELECT DISTINCT model FROM llm_usage").result_rows]

        client.close()

        return {
            "totals": {
                "requests": totals[0],
                "prompt_tokens": totals[1],
                "completion_tokens": totals[2],
                "avg_response_ms": round(totals[3], 2) if totals[3] else 0,
            },
            "models": [
                {"model": row[0], "requests": row[1], "tokens": row[2], "avg_ms": round(row[3], 2)}
                for row in models_data
            ],
            "available_models": all_models,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
