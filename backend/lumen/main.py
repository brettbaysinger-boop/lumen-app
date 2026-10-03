from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .ollama import OllamaProvider
from .runtime import CognitionRuntime
from .schemas import HealthResponse, RespondRequest, RespondResponse

settings = get_settings()
runtime = CognitionRuntime(settings)

app = FastAPI(title="Lumen Cognition API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health():
    ollama_ok = await runtime.provider.health_check()
    database_ok = True
    try:
        await runtime.db.get_companion("00000000-0000-0000-0000-000000000000")
    except Exception:
        database_ok = False

    return HealthResponse(
        status="ok" if ollama_ok and database_ok else "degraded",
        ollama="ok" if ollama_ok else "unavailable",
        database="ok" if database_ok else "unavailable",
    )


@app.post("/v0.1/respond", response_model=RespondResponse)
async def respond(request: RespondRequest):
    try:
        return await runtime.respond(
            request.companion_id,
            request.conversation_id,
            request.message,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
