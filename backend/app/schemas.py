from datetime import datetime

from pydantic import BaseModel, ConfigDict, HttpUrl


class ConnectionCreate(BaseModel):
    label: str
    base_url: HttpUrl


class ConnectionResponse(BaseModel):
    id: int
    label: str
    base_url: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GenerateRequest(BaseModel):
    connection_id: int
    model: str
    prompt: str
    temperature: float | None = None
    top_k: int | None = None
    top_p: float | None = None


class OllamaModelDetails(BaseModel):
    parent_model: str | None = None
    format: str | None = None
    family: str | None = None
    families: list[str] | None = None
    parameter_size: str | None = None
    quantization_level: str | None = None
    context_length: int | None = None
    embedding_length: int | None = None
    runner: str | None = None


class OllamaModel(BaseModel):
    name: str
    model: str
    modified_at: str
    size: int
    digest: str
    details: OllamaModelDetails
    capabilities: list[str] | None = None


class OllamaTagsResponse(BaseModel):
    models: list[OllamaModel]
