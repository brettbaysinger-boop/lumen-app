import asyncio
import json
from fastapi.responses import StreamingResponse
from .ollama import model_lock, prioritize_chat

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from .observations import observe
from .db import SupabaseRepository
from fastapi.middleware.cors import CORSMiddleware

from .auth import AuthUser, require_user
from .config import get_settings
from .ollama import OllamaProvider
from .runtime import CognitionRuntime
from .schemas import HealthResponse, RespondRequest, RespondResponse, ModelSelection
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
        await prioritize_chat()
        async with model_lock:
            response = await CognitionRuntime(settings, user.token, user.id).respond(
                request.companion_id,
                request.conversation_id,
                request.message,
                request.attachments,
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


@app.get("/v0.2/companions/{companion_id}/models")
async def companion_models(companion_id: str, user: AuthUser = Depends(require_user)):
    companion = await SupabaseRepository(settings, user.token).get_companion(companion_id)
    if not companion:
        raise HTTPException(status_code=404, detail="Companion not found")
    try:
        models = await OllamaProvider(settings).list_models()
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not list Ollama models") from exc
    return {"models": models, "selected": companion.get("conversation_model"),
            "effective": companion.get("conversation_model") or settings.conversation_model,
            "default": settings.conversation_model,
            "memory_model": settings.memory_observation_model or companion.get("conversation_model") or settings.conversation_model}


@app.put("/v0.2/companions/{companion_id}/model")
async def select_model(companion_id: str, request: ModelSelection, user: AuthUser = Depends(require_user)):
    db = SupabaseRepository(settings, user.token)
    if not await db.get_companion(companion_id):
        raise HTTPException(status_code=404, detail="Companion not found")
    if request.model is not None:
        try:
            models = await OllamaProvider(settings).list_models()
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Could not validate Ollama model") from exc
        if request.model not in models:
            raise HTTPException(status_code=400, detail="Choose an installed Ollama model")
    rows = await db._request("PATCH", "companions", params={"id": f"eq.{companion_id}"},
        headers={"Prefer": "return=representation"}, json={"conversation_model": request.model})
    if not rows:
        raise HTTPException(status_code=404, detail="Companion not found")
    return {"selected": request.model, "effective": request.model or settings.conversation_model}


@app.post("/v0.2/respond/stream")
async def respond_stream(request: RespondRequest, background_tasks: BackgroundTasks,
                         user: AuthUser = Depends(require_user)):
    instance = CognitionRuntime(settings, user.token, user.id)
    if not await instance.db.get_companion(request.companion_id):
        raise HTTPException(status_code=404, detail="Companion not found")
    if request.conversation_id and not await instance.db.get_conversation(request.conversation_id, request.companion_id):
        raise HTTPException(status_code=404, detail="Conversation not found")

    async def events():
        queue = asyncio.Queue(maxsize=64)
        async def work():
            try:
                await queue.put({"type": "activity", "text": "Lumen is thinking…"})
                await prioritize_chat()
                async with model_lock:
                    result = await instance.respond(
                        request.companion_id,
                        request.conversation_id,
                        request.message,
                        request.attachments,
                        emit=queue.put,
                    )
                if result.observation_message_id:
                    background_tasks.add_task(observe, settings, user.token, result.observation_message_id)
                await queue.put({"type": "done", "response": result.model_dump()})
            except Exception:
                await queue.put({"type": "error", "text": "Lumen could not finish this reply. Reload before retrying."})
        task = asyncio.create_task(work())
        try:
            while True:
                event = await queue.get()
                yield json.dumps(event) + "\n"
                if event["type"] in ("done", "error"):
                    break
        finally:
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)
    return StreamingResponse(events(), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
