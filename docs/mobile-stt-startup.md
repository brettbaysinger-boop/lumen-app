# Native speech startup follow-up — October 11, Phoenix

Brett reports login keyboard, Chrome Google login, reply playback and push working.
STT remains unaccepted. S22 APK e7b65eab578adacbd0432b5b3f537f9b7f2798d168369f7a96abe09c460711fc
built and installed; backup /home/brett/lumen-android-builds/before-login-stt.WH6G5B.
Phone app microphone permission and global microphone access are enabled.
Only transient Starting/Waiting-for-permission status observed; filtered logcat
contained no recorder exception. The exact failing stage is not yet established.

Candidate skips permission requests when already granted, tolerates temporary
inactive state during startup while still cancelling backgrounding, and keeps
voice errors separate from chat sync errors. Recorder failures name their stage.
The native Talk/Stop control is tap-based. Native recording allows five minutes
at 64 kbps mono AAC (approximately 2.4 MB payload); backend keeps its 10 MB limit
and 120-second upstream transcription timeout. Longer transcription may time out.
Web retains its existing one-minute recording limit.
No new dependencies, schema or backend changes. Real STT remains pending.

<!-- mobile-voice-keyboard-accepted-2026-10-11 -->
## October 11, Phoenix — Mobile keyboard and voice accepted

Baseline commit: 8522280 on feat/lumen-take2-local.
Host TypeScript and all 47 Node tests passed.
Assistant chat cache/management regressions and platform exports passed;
the final STT startup follow-up Android export also passed.

Brett reports S22 acceptance on both accounts:
- Chat and login fields remain visible above the keyboard.
- Native companion reply playback works.
- Tap Talk / tap Stop records and transcribes into the draft.
- Five-minute native recording limit verified.
- Leaving chat and backgrounding cancel voice work as intended.
- Reply playback and notification regression checks still pass.

Chrome Google sign-in/sign-out passed twice after adding
raialume-preview://login to the local Supabase redirect allowlist.
Running auth allowlist verified; API and push services restarted and active.
API/Ollama/database health reported OK. Firefox remains unverified.

Native recording uses mono AAC at 64 kbps with a five-minute limit.
Permission checks reuse existing grants; startup tolerates temporary inactive
state, while backgrounding cancels. Voice errors persist independently of
chat refresh and identify the failing recorder stage.
Transcripts remain drafts until the user sends them.
Backend retains its 10 MB upload limit and 120-second speech timeout.

Known pre-follow-up APK:
e7b65eab578adacbd0432b5b3f537f9b7f2798d168369f7a96abe09c460711fc
Its backup: /home/brett/lumen-android-builds/before-login-stt.WH6G5B.
Final follow-up APK hash and backup path have not been supplied here.

No new dependencies, backend changes or migrations in these mobile fixes.
Local Supabase configuration and existing backup files remain outside this
commit. No Git push or web deployment performed by this checkpoint.
iOS device testing remains pending.
