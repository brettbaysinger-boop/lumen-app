from functools import lru_cache
from typing import Literal

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
    # Semantic memory remains disabled until a dedicated local embedding endpoint is configured.
    semantic_memory_enabled: bool = False
    # Controlled indexing hook; this does not enable semantic retrieval.
    semantic_index_after_chat: bool = False
    semantic_embedding_url: str = ""
    semantic_embedding_batch: int = Field(default=16, ge=1, le=64)
    semantic_embedding_timeout: int = Field(default=30, ge=1, le=120)
    push_enabled: bool = False
    firebase_service_account_file: str = ""
    speech_url: str = ""
    transcription_model: str = "Systran/faster-distil-whisper-small.en"
    speech_model: str = "speaches-ai/Kokoro-82M-v1.0-ONNX"
    speech_voice: str = "af_heart"
    support_admin_user_ids: str = ""
    support_recovery_redirect_url: str = ""
    web_search_url: str = ""

    # Image generation provider. Keep the endpoint configurable so image
    # generation is a capability, not a hard-coded physical machine.
    image_provider: str = "comfyui"
    comfyui_url: str = ""
    comfyui_workflow: str = ""
    image_generation_timeout: int = Field(default=300, ge=30, le=1800)

    # Memory backend selector. "supabase" (default) keeps the existing Lumen
    # memory tables as the only store. "rmc" routes chat memory reads and
    # explicit saves to the installed Raialume Memory Core through its
    # application gateway and disables every Supabase memory write path.
    # There is no automatic fallback between the two.
    lumen_memory_backend: Literal["supabase", "rmc"] = "supabase"
    # RMC application gateway (only read when lumen_memory_backend == "rmc").
    # The gateway socket is an owner-only Unix domain socket created by the
    # RMC installation; no TCP port is used. The host key is read from a
    # 0600 file and is never stored in the environment or the repository.
    rmc_installation_id: str = ""
    rmc_gateway_socket: str = ""
    rmc_host_key_file: str = ""
    rmc_timeout_seconds: float = Field(default=10.0, ge=1.0, le=60.0)

    # Optional Animated Companion mode. Empty avatar_url (the default) keeps
    # the mode off and every /v0.1/avatar route reports it as unavailable.
    # avatar_url is the Lumen avatar bridge in front of OpenAvatarChat on the
    # GPU host; the secret is shared with that bridge and never sent to a client.
    avatar_url: str = ""
    avatar_shared_secret: str = ""
    avatar_tls_verify: bool = True

    lumen_cors_origins: str = "http://localhost:8081,http://localhost:19006"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.lumen_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
