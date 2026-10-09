"""Generate and privately store images initiated by a companion."""

from uuid import uuid4

from .images import compose_image_prompt, create_image_provider


async def create_companion_image(
    settings, db, user_id, companion, prompt, subject=None
):
    """Return image metadata only after successful generation and storage."""
    if not user_id:
        raise ValueError("Image generation requires an authenticated user.")

    identity_prompt = (
        f"A portrait of {companion.get('name', 'the companion')}: {prompt}"
        if subject == "self"
        else prompt
    )

    resolved_prompt, image_subject = compose_image_prompt(
        identity_prompt,
        companion.get("name", ""),
        companion.get("visual_identity"),
    )

    provider = create_image_provider(settings)
    result = await provider.generate(resolved_prompt)

    mime_type = result["mime_type"]
    extension = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
    }.get(mime_type)

    if extension is None:
        raise ValueError("Unsupported generated image format.")

    path = f"{user_id}/{uuid4()}.{extension}"

    await db.upload_storage(
        "chat-media",
        path,
        result["bytes"],
        mime_type,
    )

    return {
        "attachments": [{
            "path": path,
            "mime_type": mime_type,
        }],
        "generated_image": True,
        "generation_prompt": prompt,
        "resolved_image_prompt": resolved_prompt,
        "image_subject": image_subject or subject,
        "image_provider": result["provider"],
        "image_model": result["model"],
        "image_latency_ms": result["latency_ms"],
    }
