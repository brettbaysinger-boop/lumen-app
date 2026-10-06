# Natural memory: v0.2 first step

> This document describes the original proposal-only pipeline. The current automatic-save behavior and rollout are documented in [chat-and-natural-memory.md](docs/chat-and-natural-memory.md).

Lumen notices possible memories in ordinary conversation without command keywords.
Chat replies arrive before a second local Ollama call examines the user's statement.
In **Memories → Noticed in conversation**, approve, edit the wording/ownership, or
 dismiss proposals. Until approval they are outside the saved-memory context.
Explicit memory requests and manual saves continue to work immediately.

Each proposal includes an exact quote from the originating user message. Ownership
is user, companion, shared, or unknown. Account ownership comes from authentication,
not a name supplied by the model. Companion facts remain user reports; they do not
prove the companion had an experience or felt something. Approval records a link
back to the proposal and its source message.

## Install on the main desktop

Save `lumen-v0.2-natural-memory.patch` in Downloads, then:

```bash
cd ~/lumen-push
git apply --check ~/Downloads/lumen-v0.2-natural-memory.patch &&
git apply ~/Downloads/lumen-v0.2-natural-memory.patch &&
npm run typecheck &&
node scripts/test_accounts.cjs &&
backend/.venv/bin/python -m unittest discover -s backend/tests -v
```

Before applying the database migration:

```bash
sudo systemctl start lumen-backup.service &&
python3 scripts/lumen_backup.py check &&
npx --yes supabase migration up --local &&
sudo systemctl restart lumen-api lumen-web
```

Refresh the browser. Say something ordinary, such as **“Summer is my favorite
season. I spend as much time outside as I can.”** Wait for the reply, then open
Memories. Extraction can take up to a minute; the review inbox refreshes while open.
Approve a proposal, start another conversation and ask what season you prefer.
Confirm a different account cannot see that proposal or memory.

The extractor uses the installed `CONVERSATION_MODEL` by default. No extra model
is required. Optional backend `.env` settings:

```dotenv
MEMORY_OBSERVATIONS_ENABLED=true
# Empty means use CONVERSATION_MODEL:
MEMORY_OBSERVATION_MODEL=
```

Set `MEMORY_OBSERVATIONS_ENABLED=false` and restart lumen-api to stop new automatic
checks. Previously saved memories and proposals remain available for review.
All calls use the configured local Ollama server and local Supabase database.

## Failure and review behavior

Observation jobs are recorded in the database before the reply returns. Background
work is best effort: reboot, expired login token, or model failure may interrupt it.
**Retry unfinished memory checks** requeues up to five checks for the signed-in
account. Repeat after those finish if more remain. A processing job becomes
retryable after two minutes. No automatic startup worker is included yet.
If initial job creation fails, chat still succeeds but that turn is not queued.

Exact duplicates, previously dismissed proposals and matching removed memories are
suppressed. Approval is transactional and repeat-safe. Editing a proposal preserves
its original quoted evidence. Semantically equivalent wording can still produce
duplicates; changes of preference are not automatically reconciled yet. The model
can misinterpret evidence, so review matters. Greetings, questions and hypotheticals
are excluded by the extraction prompt, not guaranteed by a perfect classifier.
Only the current user statement is examined in this first step; ambiguous references
like “that's my favorite” may be missed. Approved memories currently use the existing
12-memory importance/recency retrieval. Relevant retrieval and correction history
are the next steps.

## Learning and consciousness research

Persistent memory changes the information available to Lumen at inference time.
This update does **not** train or modify the model's weights. Learning from approved
examples could later improve extraction or personalization, using a separate,
measured training process. LoRA is one possible method for learning small parameter
updates while keeping the base weights frozen; no training is enabled here.

The Generative Agents paper (Park et al., 2023) combines observation, retrieval,
reflection and planning to improve believable behavior. That supports exploring
memory and reflection architectures; believable behavior is not evidence of
subjective experience. For Lumen, the next experiment is evidence-linked reflection:
separate facts from tentative summaries, measure whether summaries improve recall,
and make every claim inspectable.

Butlin et al. (2023) derive computational indicators from several theories of
consciousness, including global workspace, recurrent processing and higher-order
theories. Their framework suggests inspecting architecture rather than treating
fluent self-description as proof. We should distinguish persistent identity,
attention/state tracking and self-monitoring from claims about subjective experience.
The report's conclusions describe systems assessed in 2023, not all systems in 2026.
Whether Lumen is conscious is not established by this work.

Practical research order:

1. Measure proposal accuracy and user corrections, using synthetic fixtures plus
   explicitly approved examples; preserve per-account isolation.
2. Improve relevant recall and detect conflicting or changing facts.
3. Add tentative reflections linked to source memories, with review and evaluation.
4. Explore a self-model that accurately reports capabilities, uncertainty and state.
5. Evaluate architecture against consciousness theories without making sentience
   claims from conversational behavior. Consider training only after a clean
   consented dataset and before/after evaluation exist.

Primary sources:

- [Generative Agents](https://arxiv.org/abs/2304.03442)
- [Consciousness in Artificial Intelligence](https://arxiv.org/abs/2308.08708)
- [LoRA](https://arxiv.org/abs/2106.09685)
- [Ollama structured outputs](https://github.com/ollama/ollama/blob/main/docs/capabilities/structured-outputs.mdx)

## Save the tested update to GitHub

```bash
git add NATURAL_MEMORY.md 'app/(tabs)/memories.tsx' \
  backend/.env.example backend/lumen/config.py backend/lumen/main.py \
  backend/lumen/ollama.py backend/lumen/observations.py backend/lumen/runtime.py \
  backend/lumen/schemas.py backend/tests/test_memory.py backend/tests/test_observations.py \
  scripts/test_accounts.cjs supabase/migrations/20261004120000_memory_suggestions.sql
git commit -m "Add natural conversation memory proposals and reviewed saves" &&
git push origin feat/lumen-v0.1-baseline
```

<!-- LUMEN-CURRENT-STATE-2026-10 -->
## Current architecture boundary — October 2026

Natural memory is one persistent subsystem inside Lumen, not the universal
storage mechanism for every kind of persistent state.

The current architecture deliberately distinguishes memory from companion
identity and structured assistant state.

### What belongs in memory

Examples:

- durable user preferences
- facts the user explicitly asks Lumen to remember
- useful facts noticed in conversation
- evidence-linked personal information
- companion/shared facts when subject semantics support them

### What does not automatically belong in memory

Examples:

- companion visual identity
- portrait configuration
- selected conversation model
- companion voice configuration
- theme/settings
- generated media objects
- tasks
- reminders
- notes
- checklists
- projects/goals

Those have their own authoritative state.

A conversation may produce both a memory and a structured action, but one
should not silently substitute for the other.

### Visual identity

`companions.visual_identity` is persistent companion state.

It is intentionally not represented as an ordinary conversational memory.

This allows Lumen's physical identity to remain stable and directly
configurable without depending on memory extraction/retrieval.

### Assistant services

The My Day / assistant-services architecture introduces structured objects for
future-facing or organizational information.

A useful distinction is:

Memory:

"What should Lumen remember?"

Assistant state:

"What needs to happen, when, and what is its status?"

Natural-memory extraction should not create tasks/reminders merely because a
statement sounds actionable unless the assistant-action layer explicitly
handles that intent.

### Retrieval direction

Future personal retrieval should be able to search across appropriate sources
without erasing their distinctions.

A request such as:

"What was that movie Sarah recommended?"

may eventually search:

- memories
- notes
- conversations
- other source-linked personal state

The result should retain provenance where possible.

### Research boundary

The project's research into reflection, self-modeling, and learned
personalization remains exploratory.

Do not interpret convincing conversational behavior as evidence of subjective
experience.

See:

- `docs/chat-and-natural-memory.md`
- `docs/assistant-services.md`
- `docs/architecture.md`
- `ROADMAP.md`
