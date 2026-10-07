from functools import lru_cache

from pydantic import Field
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
    chat_context_length: int = Field(default=8192, ge=1024, le=32768)
    chat_max_reply_tokens: int = Field(default=8192, ge=256, le=32768)
    ollama_keep_alive: str = "15m"
    memory_observations_enabled: bool = True
    memory_observation_model: str = ""
    embedding_model: str = "nomic-embed-text"
    speech_url: str = ""
    transcription_model: str = "Systran/faster-distil-whisper-small.en"
    speech_model: str = "speaches-ai/Kokoro-82M-v1.0-ONNX"
    speech_voice: str = "af_heart"
    support_admin_user_ids: str = ""
    support_recovery_redirect_url: str = ""

    # Image generation provider. Keep the endpoint configurable so image
    # generation is a capability, not a hard-coded physical machine.
    image_provider: str = "comfyui"
    comfyui_url: str = ""
    comfyui_workflow: str = ""
    image_generation_timeout: int = Field(default=300, ge=30, le=1800)

    lumen_cors_origins: str = "http://localhost:8081,http://localhost:19006"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.lumen_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
