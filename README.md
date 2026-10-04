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
   Send a message and check that exactly one user message and one model reply
   appear, then reload the conversation and verify they persist.

Only `EXPO_PUBLIC_*` values belong in the client. Keep the service role key in
`backend/.env`. The v0.1 API has no authentication yet; use it on a trusted local
network until authentication and per-user authorization are implemented.

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

Start a message with `Remember` to save its remaining text
verbatim as a user-provided semantic memory. For example:
`Remember: My favorite color is turquoise.`
Commands also accept natural phrasing like `Remember my favorite color is turquoise`
and `Lumen, remember that my favorite color is turquoise`. Colons are optional;
the companion's configured name and `please` are accepted before `remember`.
Recall questions and reminder requests such as `Remember to call me tomorrow`
are not stored by this command (there is no reminder scheduler).
Ordinary chat does not automatically
create memories. A successful command gets a database-backed acknowledgement
without a model call. Active memories are available across conversations and
visible in the Memories tab (refresh the list after saving).

Sequential identical commands reuse an existing memory. Previously deleted
identical memories are not automatically restored; use the Memories tab to add
one again. Paraphrases are not deduplicated, and simultaneous requests can still
create duplicates. Memory retrieval currently includes the 12 highest-ranked
active memories, rather than semantic search. Stored facts represent user
statements, not independently verified facts. If chat persistence fails after
a memory write, the memory can remain saved; check Memories before retrying.

Backend checks: `cd backend && python -m unittest discover -s tests -v`.

- Working branch: `feat/lumen-v0.1-baseline`.
- Backend baseline: `ca455dbe709c2420a23c97fabe455a6a3a16d6b0`.
- Expo now uses the cognition API; live integration verification is next.
- Next: validate a complete turn on Brett's local stack, then add authentication,
  request deduplication, and atomic persistence for failed or interrupted turns.
- Keep implementation checkpoints in this repository so a new chat can resume
  by inspecting the branch and this README.
