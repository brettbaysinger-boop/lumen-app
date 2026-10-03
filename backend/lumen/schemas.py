from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class RespondRequest(BaseModel):
    companion_id: str
    conversation_id: str | None = None
    message: str = Field(min_length=1, max_length=16000)


class RespondResponse(BaseModel):
    conversation_id: str
    message_id: str
    content: str
    model: str
    provider: str
    latency_ms: int
    memory_count: int


class HealthResponse(BaseModel):
    status: str
    ollama: str
    database: str


class Companion(BaseModel):
    id: str
    name: str
    description: str | None = None
    persona: str
    system_prompt: str | None = None
    voice_enabled: bool = False
    vision_enabled: bool = False


class CompanionState(BaseModel):
    attention: float
    energy: float
    curiosity: float
    confidence: float
    uncertainty: float
    social_engagement: float
    task_focus: float
    novelty: float
    current_goal: str | None = None
    current_context: str | None = None


class Memory(BaseModel):
    id: str
    type: str
    content: str
    importance: float
    confidence: float
    source: str | None = None
    tags: list[str] = []
    metadata: dict[str, Any] = {}
