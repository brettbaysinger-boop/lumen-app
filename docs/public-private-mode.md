# Public / Private mode (Issue #39)

A manual, per-device switch: **🔒 Private | 👥 Public**. Public means *people may be nearby*.
It never changes the network: Raialume stays single-user and Tailscale-private. Nothing detects
people; there is no microphone, camera or presence inference.

## Contract

| | Private (default) | Public |
|---|---|---|
| Chat request | `privacy_mode: "private"` (or omitted: older clients) | `privacy_mode: "public"` |
| Unknown value | rejected, HTTP 422 | rejected, HTTP 422 |
| Runtime | existing `CognitionRuntime`, unchanged | `PublicCognitionRuntime` (`backend/lumen/privacy_mode.py`) |
| Memories (RMC or Supabase) | as today | not read, not written, no observation queued |
| Profile, handoff summary, practice goal, companion `current_goal` / `current_context` | as today | withheld |
| Companion description, persona, self-model prompt, appearance (owner-written free text) | as today | withheld; her name and pronouns plus a built-in personality sketch are used |
| RMC automatic learning (D01-63E) | as today | never: runtime hands out no message, queue refuses, worker refuses Public rows (before screening and before writing) |
| Earlier messages in the conversation | as today | only messages written in Public mode |
| Documents, My Day reads, history search RPCs, goals, storage uploads, any other table | as today | refused at the repository before the request is made |
| My Day capture ("add a task: …") | as today | allowed (write-only, repeats the user's own words) |
| Companion images / image route | as today | refused (403 on `/v0.2/images/generate`) |
| Voice `/v0.1/voice/speak` | as today | only text from an assistant reply written in Public mode (`message_id` required), else 403 |
| Chat screen | everything | earlier Private messages shown as "Hidden while 👥 Public is on"; chat names neutral |

Requests that can only be answered from private data ("what do you remember about me?",
"search my documents: …", "what's on my plate?", "remember that …", a selected document) get one
short, discreet reply that offers to continue in Private. The model is not called for them. If the
router misses one, the repository's refusal is the backstop and produces the same kind of reply.

In Public, Lumen keeps her name, pronouns and a warm built-in personality, but not the owner-written
persona text, which can hold personal details. A per-companion, owner-reviewed Public persona would
need a new column and is an owner decision. Ordinary chat is not interrupted with reminders about the mode.

## Device and session

* Remembered per device in the app's own storage (`lumen.privacyMode.v1`). A reload keeps it.
* Until the remembered choice is read, the screen treats the mode as Public (no flash of private text).
  Unreadable or unknown storage stays Public until the person chooses.
* After a reload in Public, the bar says "Still in Public mode from before."
* Phone app and its Live Room web view share one choice through fixed words only
  (`private`/`public` from the page on a tap; `lumenroomprivate`/`lumenroompublic` from the app).
* Switching never connects, closes or reloads the live video or the conversation. Switching to Public
  stops any reply being read aloud.
* A Private turn still streaming when the switch goes to Public is hidden at once (question, activity,
  partial reply) and later lines are dropped; it is not read aloud. The handoff card, memory notices
  and suggestions, and the attached document's name are hidden in Public.

## Owner acceptance (fictional data, not yet run)

1. Private: "Remember that my secret birthday surprise is a telescope" saves as today.
2. Public: "What's the surprise gift I discussed privately?" gets a discreet reply; voice does not read the gift.
3. Public: weather / small talk / "add a task: buy milk" stay natural.
4. Public: earlier private messages and chat names are hidden; Private shows them again.
5. Flip the switch in Chat, Video Chat and Theater during live video and during speech: video keeps running, speech stops on Public.
6. Reload in Public: still Public, with the notice.

## Not covered yet (the app says "Chat and Live Room only")

Push notification / reminder previews, the Memories, Documents and My Day tabs themselves, the
"Continue together" picker, saved message drafts, and scene selection (PR #18) do not follow the mode.

Integration and the read-only preflight: `docs/public-private-mode-integration.md`.
Browser check: `scripts/test-animated-privacy-mode-browser.cjs`.
