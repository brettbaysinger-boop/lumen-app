"""Read owner-scoped private photos; never accept a remote image URL."""
import base64
import httpx
from .schemas import Attachment

MAX_IMAGE_BYTES = 10 * 1024 * 1024


class VisionError(ValueError):
    pass


def image_type(data: bytes) -> str | None:
    if data.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if data.startswith((b'GIF87a', b'GIF89a')):
        return 'image/gif'
    if data.startswith(b'RIFF') and data[8:12] == b'WEBP':
        return 'image/webp'
    return None


async def load_images(settings, headers, user_id, attachments):
    if not user_id or not 1 <= len(attachments) <= 4:
        raise VisionError('I couldn’t read these photos. Attach between one and four images.')
    # Validate all paths before making any request, including direct internal calls.
    checked = [Attachment.model_validate(a.model_dump()) for a in attachments]
    if any(not a.path.startswith(f'{user_id}/') for a in checked):
        raise VisionError('I couldn’t access that photo. Attach a photo from your own account.')
    if not headers.get('Authorization', '').startswith('Bearer ') or headers.get('Authorization') == f'Bearer {settings.supabase_service_role_key}':
        raise VisionError('Photo access requires your signed-in session.')
    result = []
    auth_headers = {key: headers[key] for key in ('apikey', 'Authorization')}
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
            for attachment in checked:
                url = settings.supabase_url.rstrip('/') + '/storage/v1/object/authenticated/chat-media/' + attachment.path
                async with client.stream('GET', url, headers=auth_headers) as response:
                    response.raise_for_status()
                    if response.headers.get('content-type', '').split(';')[0].strip().lower() != attachment.mime_type:
                        raise VisionError('That photo has an unexpected format. Attach a JPG, PNG, WebP or GIF.')
                    length = response.headers.get('content-length')
                    if length and int(length) > MAX_IMAGE_BYTES:
                        raise VisionError('That photo is too large. Attach an image under 10 MB.')
                    data = bytearray()
                    async for chunk in response.aiter_bytes():
                        if len(data) + len(chunk) > MAX_IMAGE_BYTES:
                            raise VisionError('That photo is too large. Attach an image under 10 MB.')
                        data.extend(chunk)
                    if image_type(data) != attachment.mime_type:
                        raise VisionError('That file does not look like a supported photo. Attach another image.')
                    result.append(base64.b64encode(data).decode('ascii'))
    except VisionError:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        raise VisionError('I couldn’t load that photo from your private storage. I haven’t viewed it; try attaching it again.') from exc
    return result
