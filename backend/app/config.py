from pydantic import computed_field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    rabbitmq_user: str
    rabbitmq_password: str
    rabbitmq_host: str = "rabbitmq"
    rabbitmq_port: int = 5672
    celery_result_backend: str = "rpc://"
    redis_url: str = "redis://redis:6379/0"

    @computed_field
    @property
    def celery_broker_url(self) -> str:
        return f"amqp://{self.rabbitmq_user}:{self.rabbitmq_password}@{self.rabbitmq_host}:{self.rabbitmq_port}//"


settings = Settings()
