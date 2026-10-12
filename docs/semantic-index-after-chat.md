# Controlled semantic indexing after chat

This increment adds an off-by-default authenticated indexing hook so a normal
Lumen chat can supply the real user token without copying browser credentials
into a terminal.

Both settings must be true:
- `semantic_memory_enabled`
- `semantic_index_after_chat`

After a successful authenticated reply, one bounded indexing batch is queued as
a FastAPI background task. Existing memory observation is queued first when
present. The reply still uses the existing lexical memory path.

Background indexing failures are swallowed after a bounded log message so an
embedding outage or stale memory cannot turn an already-completed reply into an
error. Logs contain aggregate counts only, never memory text, tokens, or
provider response bodies.

This is a controlled rollout hook, not the final durable indexing scheduler.
