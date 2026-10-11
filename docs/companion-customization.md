# Companion customization upgrades — candidate for f5695d6

User accepted guided creation and new-account first login before this increment.
Adds local name suggestions (soft/cosmic/everyday), removes the pronoun input
and pronouns from review, adds an optional romantic personality, and provides
a structured appearance-description builder plus editable free text. Existing
pronoun data remains; new companions derive it from the selected gender.
Warm/thoughtful remains the default. Presets are editable.

Appearance generation uses the configured local image service. Authenticated
POST /v0.2/companions/{id}/portrait-preview checks owner access before generation,
uses the requested draft appearance/style, stores a private owner-prefixed image
in companion-portraits, and creates neither a chat nor a companion update.
The preview has retry, regenerate and explicit Use this portrait. Saving the
creation form commits the chosen portrait and appearance. Generation varies;
users may refine the description or upload their own exact artwork/photo.

Old selected portraits remain until a replacement is chosen and saved. Normal
cancellation cleans unused staged files. Interrupted/uncertain server requests
can leave unused private files, retained rather than risking saved portraits.
Cancelling a client request does not guarantee cancelling an upstream image job.
Native preview never shows the built-in fallback as a generated image.

Voice sample buttons appear in creation and the existing VoicePicker. Individual
samples send an explicit voice override without saving the choice. The current
server voice sample uses the current saved/default voice, not an unsaved draft.
Web uses existing browser playback; Android/iOS use expo-audio with a temporary
private app-cache WAV from an authenticated POST. Completion, cancellation,
backgrounding and player initialization errors release player/file resources.
Playback samples need the rebuilt native APK. Native microphone recording and
full native spoken replies remain separate work.

Dependencies: expo-audio ~1.1.1 and expo-file-system ~19.0.24, matched to the
installed Expo SDK metadata. Lock changes add expo-audio and update only the
existing expo-file-system version. No app/config plugin or microphone-permission
change. Run npm ci --ignore-scripts after applying.

Local validation: TypeScript, 31 Node tests, 450 backend tests using synthetic
Supabase settings and isolated backend dependencies, guided creation/portrait
selection component checks and existing auth/chat component checks passed.
Android/iOS/web JS exports passed. Host checks, real image generation, native
voice playback and phone acceptance remain pending.

No database migration. API restart is needed for the portrait route. Rebuild the
existing isolated preview after copying changed package manifests and source
files; Gradle autolinks expo-audio. Preserve preview identity and signing key.
Keep the previous working APK. Do not replace the host web build automatically.

Acceptance: suggestions can be refreshed and chosen while free typing works;
no pronoun field; romantic preset remains editable; appearance builder uses only
entered details; portrait Generate shows an actual private image, Regenerate
keeps the selected portrait, Use then Save survives reopening. Samples play on
Android, stop when switched/back/backgrounded, and never change saved voice
until Save. Test new-account setup and existing-companion customization.
Verify other accounts cannot access preview generation or private images.

Configuration/backups preserved. Memory relevance, skills and proposal work
remain paused. Push, wider UI work, iOS device acceptance and consolidation pending.

<!-- companion-customization-accepted-2026-10-11 -->
## October 11, Phoenix — Companion customization accepted

Host TypeScript, all 31 Node tests and all 450 backend tests passed.
Android preview build completed successfully and ADB installation succeeded.
Brett reports all requested phone acceptance checks passed:
name suggestions, removal of the pronoun field, romantic personality,
appearance description builder, native voice samples, and generated
portrait preview/regenerate/use/save persistence.

APK SHA256:
f77f825a5b6fa0c51393fe7bfcf5725ce16e52876e683c7d0761b2bc9bf1a341
Previous APK:
/home/brett/lumen-android-builds/preview.ijhcJd/before-customization.7aZ7cl.apk

No new database migration was required.
Configuration, database backups and prior preview APK preserved.
Memory relevance, skills and proposal work remain paused.
Push notifications, further mobile UI polish and iOS testing remain pending.
