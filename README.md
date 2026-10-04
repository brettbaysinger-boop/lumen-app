# lumen-app

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-tkgshliu)

## Lumen v0.1: connect chat to cognition

The Expo chat sends each turn to `POST /v0.1/respond`. The backend retrieves context,
calls Ollama, and saves both messages and conversation metadata. The client reads
those saved messages from Supabase; it does not generate canned replies.

1. Copy `.env.example` to `.env` at the repository root. Fill in the Supabase URL
   and **anon** key, and set `EXPO_PUBLIC_LUMEN_API_URL` to your server address.
   A phone must use the server's LAN IP, not `localhost`.
2. In `backend`, create a virtual environment, install with `pip install -e .`,
   and copy `.env.example` to `.env`. Configure the same Supabase project using
   its service role key, plus `OLLAMA_URL` and an installed `CONVERSATION_MODEL`.
   For Ollama on the same host without Docker, use `http://127.0.0.1:11434`.
3. From `backend`, start `uvicorn lumen.main:app --host 0.0.0.0 --port 8000`.
   Check `http://YOUR_SERVER_IP:8000/health` for Ollama and database status.
4. For Expo web, include the exact frontend origin (for example
   `http://192.168.1.100:8081`) in backend `LUMEN_CORS_ORIGINS`.
5. Run `npm ci` and `npm run dev`. Restart Expo after changing environment values.
   Create an account or sign in, then send a message and check that exactly one user message and one model reply
   appear, then reload the conversation and verify they persist.

Only `EXPO_PUBLIC_*` values belong in the client. Keep the service role key in
`backend/.env`. Chat and voice require a verified Supabase Auth session. The
backend forwards the user token to PostgREST so database policies enforce
account isolation. See [ACCOUNTS.md](ACCOUNTS.md) for setup and existing-data migration.

Requests time out after two minutes. The server may finish after a timeout or
connection loss; reload the conversation before retrying to check for a saved turn.

## Development checkpoint

### Voice through Helios (browser app)

Set `SPEECH_URL=http://100.121.251.39:8000` in `backend/.env` and install the
updated backend dependencies with `backend/.venv/bin/python -m pip install -e backend`.
The default speech models are `Systran/faster-distil-whisper-small.en` for STT
and `speaches-ai/Kokoro-82M-v1.0-ONNX` with voice `af_heart` for TTS. Models must
already be installed on Helios. Override `TRANSCRIPTION_MODEL`, `SPEECH_MODEL`,
or `SPEECH_VOICE` in backend settings to change them.

Restart `lumen-api` and `lumen-web` after installation. Open the browser app at
`http://localhost:8081`; microphone permission requires localhost or HTTPS.
Tap the microphone, allow access, speak, and tap Stop. Recording stops after
60 seconds. Helios transcribes the audio into the existing draft; review and
press Send yourself. Recordings are sent to Helios via Lumen and are not saved
by Lumen. Conversation text is saved through the usual chat flow. Each assistant
reply has a Play reply / Stop audio button. Playback is manual and supports
replies up to 4,000 characters. Voice controls currently support Expo web only.
The Settings voice toggle does not gate these manually invoked controls.

Audio checks: `node scripts/test-voice.cjs`; backend voice tests are included
in `python -m unittest discover -s backend/tests -v`.

### Explicit long-term memories

Ask directly to save a fact, with optional punctuation, `please`, or Lumen's name:

- `Remember my favorite color is turquoise`
- `You should remember that my favorite color is turquoise`
- `Lumen, you should really remember that my name is Brett`
- `Save this to memory: my favorite color is turquoise`
- `Put in your memory my favorite color is turquoise`

The fact is saved verbatim as a user-provided semantic memory. Use explicit names
and dates for facts such as birthdays, so they stay clear in later conversations.
Requests such as `put that in your memory` ask for the exact fact instead of
guessing what “that” means. Recall questions and reminders such as
`Remember to call me tomorrow` do not create memories.

Successful writes receive a deterministic acknowledgement and a **Memory saved**
label. Existing facts display **Memory already saved**. These labels come from
backend results stored with the reply and persist when the conversation reloads.
Failed writes never receive a success label. Ordinary model replies cannot set
these labels; a response guard requests one rewrite for common unsupported save claims.
If the rewrite still claims a save, it lists the available saved facts instead. This guard covers common wording, not every possible
model paraphrase; the label is the authoritative save confirmation. Unrecognized
phrasing and ordinary conversation do not automatically save facts.
Active memories are available across conversations and visible in the Memories
tab (refresh the list after saving).

Sequential identical commands reuse an existing memory. Previously deleted
identical memories are not automatically restored; use the Memories tab to add
one again. Paraphrases are not deduplicated, and simultaneous requests can still
create duplicates. Memory retrieval currently includes the 12 highest-ranked
active memories, rather than semantic search. Each memory has a subject:
`user`, `companion`, `shared`, or `unknown`; a user UUID when applicable; the
reporting user's UUID; and an optional event timestamp. First-person `my`/`I`
requests describe the user, `your`/`you` or the companion's possessive name describe
the companion, and `our`/`we` describe both. Other wording stays unassigned.
The Memories tab supports setting or correcting the subject. Stored facts
represent reported statements, not independently verified experiences. If chat persistence fails after
a memory write, the memory can remain saved; check Memories before retrying.

Backend checks: `cd backend && python -m unittest discover -s tests -v`.

- Working branch: `feat/lumen-v0.1-baseline`.
- Backend baseline: `ca455dbe709c2420a23c97fabe455a6a3a16d6b0`.
- Login, account isolation, and memory subjects are implemented; verify on the local stack using ACCOUNTS.md.
- Next: reviewed memory extraction, semantic retrieval, request deduplication,
  and atomic persistence for failed or interrupted turns.
- Keep implementation checkpoints in this repository so a new chat can resume
  by inspecting the branch and this README.
