import httpx

from .config import Settings


class SupabaseRepository:
    def __init__(self, settings: Settings, access_token: str | None = None):
        self.base_url = settings.supabase_url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {access_token or settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        }

    async def _request(self, method: str, table: str, **kwargs):
        headers = {**self.headers, **kwargs.pop("headers", {})}
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.request(
                method,
                f"{self.base_url}/{table}",
                headers=headers,
                **kwargs,
            )
            response.raise_for_status()
            if not response.content:
                return []
            return response.json()

    async def get_companion(self, companion_id: str):
        rows = await self._request(
            "GET", "companions",
            params={"id": f"eq.{companion_id}", "limit": "1"},
        )
        return rows[0] if rows else None

    async def get_conversation(self, conversation_id: str, companion_id: str):
        rows = await self._request("GET", "conversations", params={
            "id": f"eq.{conversation_id}", "companion_id": f"eq.{companion_id}", "limit": "1"})
        return rows[0] if rows else None

    async def get_profile(self, user_id: str):
        rows = await self._request("GET", "profiles", params={"id": f"eq.{user_id}", "limit": "1"})
        return rows[0] if rows else None

    async def get_state(self, companion_id: str):
        rows = await self._request(
            "GET", "companion_state",
            params={"companion_id": f"eq.{companion_id}", "limit": "1"},
        )
        return rows[0] if rows else None

    async def get_recent_messages(self, conversation_id: str, limit: int = 20):
        return await self._request(
            "GET", "messages",
            params={
                "conversation_id": f"eq.{conversation_id}",
                "order": "created_at.desc",
                "limit": str(limit),
            },
        )

    async def get_relevant_memories(self, companion_id: str, limit: int = 12):
        return await self._request(
            "GET", "memories",
            params={
                "companion_id": f"eq.{companion_id}",
                "is_active": "eq.true",
                "order": "importance.desc,updated_at.desc",
                "limit": str(limit),
            },
        )

    async def create_conversation(self, companion_id: str, title: str):
        rows = await self._request(
            "POST", "conversations",
            params={"select": "*"},
            headers={**self.headers, "Prefer": "return=representation"},
            json={"companion_id": companion_id, "title": title, "is_active": True},
        )
        return rows[0]

    async def remember(self, companion_id: str, conversation_id: str, content: str, subject: str = "user"):
        # Include inactive rows: deleting a memory should not allow a repeated
        # identical instruction to silently resurrect it.
        existing = await self._request(
            "GET", "memories",
            params={"companion_id": f"eq.{companion_id}",
                    "content": f"eq.{content}", "subject": f"eq.{subject}", "limit": "1"},
        )
        if existing:
            return "existing" if existing[0]["is_active"] else "deleted"
        await self._request(
            "POST", "memories",
            headers={"Prefer": "return=minimal"},
            json={"companion_id": companion_id,
                  "conversation_id": conversation_id,
                  "type": "semantic", "content": content, "subject": subject,
                  "importance": 0.9, "confidence": 1.0,
                  "source": "explicit_user_request", "tags": ["user_requested"]},
        )
        return "saved"

    async def create_message(self, payload: dict):
        rows = await self._request(
            "POST", "messages",
            params={"select": "*"},
            headers={**self.headers, "Prefer": "return=representation"},
            json=payload,
        )
        return rows[0]

    async def upload_storage(
        self,
        bucket: str,
        path: str,
        content: bytes,
        content_type: str,
    ):
        url = (
            self.base_url.removesuffix("/rest/v1")
            + f"/storage/v1/object/{bucket}/{path}"
        )
        headers = {
            "apikey": self.headers["apikey"],
            "Authorization": self.headers["Authorization"],
            "Content-Type": content_type,
            "x-upsert": "false",
        }
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url, headers=headers, content=content)
            response.raise_for_status()
            return response.json() if response.content else {}

    async def touch_conversation(self, conversation_id: str, message_count_delta: int = 1):
        rows = await self._request(
            "GET", "conversations",
            params={"id": f"eq.{conversation_id}", "select": "message_count"},
        )
        current = rows[0].get("message_count", 0) if rows else 0
        await self._request(
            "PATCH", "conversations",
            params={"id": f"eq.{conversation_id}"},
            headers={**self.headers, "Prefer": "return=minimal"},
            json={
                "message_count": current + message_count_delta,
                "last_message_at": "now()",
            },
        )
