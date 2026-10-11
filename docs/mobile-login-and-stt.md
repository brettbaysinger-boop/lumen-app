# Mobile login and speech input — October 11, Phoenix

Candidate applies after the keyboard/reply-audio patch on host commit 8522280.
Brett accepted keyboard positioning, reply playback, stop/background behavior and
notification regression on both accounts. Google sign-in/sign-out passed twice
with Chrome after allowing raialume-preview://login in local Supabase. API and
push services active; API/Ollama/database health OK. Firefox remains unverified.
These host acceptance reports have not yet been committed.

Login now uses keyboard avoidance and scrolls with a compact form while typing.
Native chat offers microphone recording with runtime permission, a 60-second
limit, authenticated audio/mp4 upload to the existing Helios transcription route,
and transcript insertion into the draft. Sending remains a separate user action.
Private recording files are deleted after upload, failure or cancellation.
Leaving the chat, changing conversations and backgrounding cancel voice work;
late results cannot overwrite a new voice session. No dependency or schema change.
The expo-audio config plugin adds native microphone permission on rebuild.

Assistant validation: TypeScript, 46 Node tests and chat cache/management component
regressions passed. Real microphone input and login positioning require S22 checks.
Google/Firebase preview configuration and the signing key must survive rebuild.
