from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")

    lumen_env: str = "development"
    lumen_log_level: str = "INFO"
    lumen_api_host: str = "0.0.0.0"
    lumen_api_port: int = 8000

    supabase_url: str
    supabase_service_role_key: str

    ollama_url: str = "http://host.docker.internal:11434"
    conversation_model: str = "llama3.1:8b"
    reflection_model: str = "llama3.1:8b"
    memory_model: str = "llama3.1:8b"
    embedding_model: str = "nomic-embed-text"

    lumen_cors_origins: str = "http://localhost:8081,http://localhost:19006"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.lumen_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
