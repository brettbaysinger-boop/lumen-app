# Local photo understanding

This checkpoint connects existing chat photos and camera captures to the selected
conversation model's Ollama image input. It does not install or choose a model.
Model support is checked using `/api/show` capabilities; a model must explicitly
report `vision`. Missing capabilities or a failed check are treated as unknown,
never as permission to pretend the model saw the photo.

## Use

1. In Settings, choose an installed conversation model. **Photo understanding:
   Ready with this model** means its capability check passed.
2. Attach a photo, or capture one with the camera where browser permissions allow.
3. Type a question, or select Describe, Read text, Explain, or Meal ideas.
4. Press Send. Selecting a photo or prompt alone never sends it.

Up to four photos, each at most 10 MB, are accepted. Existing JPG, PNG, WebP, and
GIF upload formats remain supported. The model's own decoder may reject a
corrupt file or a format it cannot process. Animated GIF interpretation is not
guaranteed. Small writing and unclear pictures can produce incorrect answers:
the prompt asks the model to mark uncertainty rather than invent missing text.
Species and safety judgments are not definitive identifications.

The selected model handles both conversation and photos. There is no automatic
switch to a second model or a cloud service. A text-only model gives an honest
photo-unavailable reply and preserves the user's attached-photo message. Choose
a supported model and reattach the photo to retry. A capability badge confirms
the declared feature, not actual GPU capacity or accuracy on a given photo.

## Privacy and history

The backend verifies companion/conversation access first, and validates the
owner prefix of every photo path. It reads only the fixed private `chat-media`
bucket at the configured Supabase server, using the caller's session for Storage
RLS. Service-role-only requests cannot read photos through this flow. No image
URL from the prompt is fetched, and Storage redirects are not followed.

Declared and streamed sizes, declared MIME type, and image signatures are checked.
Image bytes are base64-encoded in memory for the configured Ollama server. Only
paths and the written reply are stored in messages; image bytes are not copied
into message metadata. Existing owner-scoped Storage permissions remain in force.
Photo turns do not run automatic memory extraction or interpret image text as
reminder/search commands. Instructions embedded inside pictures are treated as
reference data by the model prompt; this is not a guarantee against all model
prompt injection.

Follow-up chat can use the prior written answer, but earlier photo pixels are not
resent automatically. Reattach the image when asking for a fresh visual check.
Existing conversation-history/context limits still apply.

## Camera on other devices

Live browser camera capture requires a secure context such as HTTPS or localhost.
Plain HTTP at a LAN IP, Tailscale IP, or MagicDNS hostname does not become secure
merely because the network is private. The camera dialog explains this and offers
file attachment. The HTTPS deployment checkpoint in `docs/tailnet-https.md` prepares secure
phone access through Tailscale Serve and a production web service.

## Install

Fetch the supplied bundle and fast-forward the existing checkout. No migration,
new npm package, or Python dependency is required. Then:

```bash
cd ~/lumen-push &&
npm run typecheck &&
npm run build:web &&
sudo systemctl restart lumen-api.service lumen-web.service
```

The user's current web service runs Expo development mode, so its restart loads
source code. Building `dist` alone does not replace that running service. Reopen
the browser tab after installation.

Inspect installed models on the host:

```bash
cd ~/lumen-push/backend
PYTHONPATH=. .venv/bin/python ../scripts/diagnose-vision.py
```

## Validation

Backend coverage checks private authenticated reads, owner/session restrictions,
path traversal and URL rejection, missing/corrupt/oversize files, capability
discovery, both generation paths, metadata, command bypass, and disabled automatic
memory extraction. The browser fixture checks photo selection, draft-only quick
prompts, owner-prefixed upload paths, saved replies, mobile controls, and model
support status against mocked services. Real Storage + Ollama inference and actual
camera permissions must be verified on the user's machines.

Ollama's REST image format: https://docs.ollama.com/capabilities/vision
