CREATE TABLE IF NOT EXISTS ollama_logs.llm_usage
(
    `model` String,
    `prompt_tokens` UInt32,
    `completion_tokens` UInt32,
    `total_tokens` UInt32,
    `prompt_chars` UInt32,
    `response_chars` UInt32,
    `http_response_ms` UInt32,
    `ollama_total_ms` UInt32,
    `eval_duration_ms` UInt32,
    `created_at` DateTime DEFAULT now()
)
ENGINE = MergeTree()
ORDER BY (created_at);
