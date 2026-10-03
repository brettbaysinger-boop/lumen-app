import httpx

from .config import Settings


class SupabaseRepository:
    def __init__(self, settings: Settings):
        self.base_url = settings.supabase_url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        }

    async def _request(self, method: str, table: str, **kwargs):
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.request(
                method,
                f"{self.base_url}/{table}",
                headers=self.headers,
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

    async def create_message(self, payload: dict):
        rows = await self._request(
            "POST", "messages",
            params={"select": "*"},
            headers={**self.headers, "Prefer": "return=representation"},
            json=payload,
        )
        return rows[0]

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
