from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from .observations import observe
from .db import SupabaseRepository
from fastapi.middleware.cors import CORSMiddleware

from .auth import AuthUser, require_user
from .config import get_settings
from .ollama import OllamaProvider
from .runtime import CognitionRuntime
from .schemas import HealthResponse, RespondRequest, RespondResponse
from .voice import router as voice_router

settings = get_settings()
runtime = CognitionRuntime(settings)

app = FastAPI(title="Lumen Cognition API", version="0.1.0")
app.include_router(voice_router)
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
async def respond(request: RespondRequest, background_tasks: BackgroundTasks, user: AuthUser = Depends(require_user)):
    try:
        response = await CognitionRuntime(settings, user.token, user.id).respond(
            request.companion_id,
            request.conversation_id,
            request.message,
        )
        if response.observation_message_id:
            background_tasks.add_task(observe, settings, user.token, response.observation_message_id)
        return response
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Lumen could not complete this request. Check the API logs.") from exc


@app.post("/v0.2/memory-observations/retry")
async def retry_observations(background_tasks: BackgroundTasks, user: AuthUser = Depends(require_user)):
    if not settings.memory_observations_enabled:
        return {"queued": 0}
    rows = await SupabaseRepository(settings, user.token)._request("GET", "memory_observations",
        params={"status": "neq.done", "order": "updated_at.asc", "limit": "5"})
    for row in rows:
        background_tasks.add_task(observe, settings, user.token, row["source_message_id"])
    return {"queued": len(rows)}
