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
