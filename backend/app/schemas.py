from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ConnectionCreate(BaseModel):
    label: str
    base_url: str
    api_key: str | None = None


class ConnectionResponse(BaseModel):
    id: int
    label: str
    base_url: str
    api_key: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GenerateRequest(BaseModel):
    chat_id: int
    prompt: str


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


class ChatCreate(BaseModel):
    title: str
    connection_id: int


class ChatUpdate(BaseModel):
    title: str | None = None
    model_name: str | None = None
    temperature: float | None = None
    top_k: int | None = None
    top_p: float | None = None


class ChatResponse(BaseModel):
    id: int
    title: str
    connection_id: int | None
    model_name: str | None
    temperature: float | None
    top_k: int | None
    top_p: float | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MessageCreate(BaseModel):
    content: str


class MessageResponse(BaseModel):
    id: int
    chat_id: int
    role: str
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MessageListResponse(BaseModel):
    messages: list[MessageResponse]
    next_cursor: int | None
