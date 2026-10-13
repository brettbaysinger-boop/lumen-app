# Phase 1a — Evidence-first durability triage

This is a deliberately narrow, account- and companion-generic hardening
increment. No production-specific person name, AI companion name, account ID,
or memory row ID is part of the implementation.

## Policy

Natural extraction from a conversation is NOT the same as an explicit request
to remember information.

- Skip unmistakable greetings, isolated immediate requests, connection
  checks, transient feedback and temporary states, even if the model
  incorrectly claims the suggestion is durable.
- If the current message includes a factual assertion inside a question,
  a request for a form of address, or mixed request + personal assertion,
  mark it for human review rather than automatically saving it.
- Allow ordinary long-term facts to proceed through the existing evidence,
  subject, sensitivity and auto-save checks.
- An explicit user-directed "remember this" request stays in its distinct
  user-authorized path. It is not silently censored by natural-chat rules.
- In the Memories UI, ambiguous manual additions and review approvals
  display a warning and require a second deliberate click with unchanged
  text, subject and type. Ownership contradictions remain disallowed.

No classifier is perfect. The objective is a conservative first gate, not
to decide whether user-provided personal facts are objectively true.
The source user statement remains the only admissible evidence. Previous
turns may clarify reference but never serve as independent proof.

## Scope and evidence

This iteration modifies the natural observation pipeline and the UI.
The prior authenticated review RPC and explicit memory writes remain in
place. A follow-up **Phase 1b** should add database-side durability
confirmation for legacy clients and direct-RPC review calls; UI confirmation
by itself is not a security boundary.

No live database migration, service restart, or semantic retrieval activation
is part of the Phase 1a patch. Test with backend suite, TypeScript, node
contract and web export before deploying. Any browser behavior is pending
acceptance until actually tested.

The Phase 1 reference baseline is 97 active/97 current embeddings for one
pilot companion, 122 active globally, other companion embeddings 0, and
semantic reply integration disabled, from the user's verified October 12
terminal checkpoint.
