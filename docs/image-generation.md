# Lumen Image Generation and Visual Identity

This document describes the current local image-generation implementation and
the roadmap for stable visual identity.

## Current status

Local image generation is integrated on:

`feat/lumen-integration`

Relevant checkpoints:

- `72ba255 Route image generation through local providers`
- `9020e82 Complete local image generation workflow`
- `6ccfcbc Add persistent companion visual identity`

The current system has been verified end to end.

## Provider

Current image provider:

ComfyUI

Current provider node:

`aiLumen-llm-heavy`

Current GPU:

NVIDIA GeForce RTX 5060 Ti 16 GB

## Current model

Lumen currently uses:

`FLUX.2 Klein 4B FP8`

Working model assets on Heavy include:

- `flux-2-klein-4b-fp8.safetensors`
- `qwen_3_4b.safetensors`
- `flux2-vae.safetensors`

## Versioned workflow

The known-good workflow is stored at:

`backend/workflows/flux2-klein-4b-fp8.json`

The graph uses the FLUX.2 latent/scheduler path and substitutes runtime prompt
and random seed values.

The repository workflow is the reproducible definition of the current
generation graph.

## Provider seam

The backend image layer abstracts provider execution from the frontend.

The frontend should not need to know:

- ComfyUI's address
- which GPU is used
- workflow internals
- provider-specific API behavior

This allows future image providers to be added without redesigning
Conversation.

## Current request flow

1. User makes an image request.
2. Frontend recognizes image-generation intent.
3. Frontend sends the authenticated request to Lumen.
4. Backend validates account/companion/conversation ownership.
5. Backend resolves whether the companion is a subject.
6. Backend composes visual identity when appropriate.
7. Backend submits the resolved prompt/workflow to ComfyUI.
8. Heavy generates the image.
9. Backend retrieves the generated PNG.
10. Backend stores the image privately.
11. Message metadata stores generation provenance.
12. Conversation renders the image.

## Storage

Generated chat images are stored in the private Supabase Storage bucket:

`chat-media`

Access remains authenticated and owner scoped.

Generated images should not be made public merely to simplify rendering.

## Prompt provenance

The image message metadata preserves:

- `image_prompt`
- `resolved_image_prompt`
- `image_subject`
- `image_provider`

`image_prompt` is the user's original request.

`resolved_image_prompt` is the internal prompt sent to the provider after
subject/identity composition.

The original user message remains unchanged.

## Companion visual identity

The companion table now includes:

`visual_identity`

This describes stable physical appearance for generation.

It is companion state, not conversational memory.

The migration adds the field but does not hard-code one person's Lumen
appearance into the schema.

The actual identity value belongs to the owned companion row.

## Subject resolution

Current explicit companion-self patterns include:

- `yourself`
- `of you`
- `with you`
- the companion's name

Examples:

"Send me a picture of yourself."

→ companion subject

"Make a portrait of Lumen."

→ companion subject

"Make me a picture."

→ not automatically the companion

"Generate a picture of a woman in a forest."

→ not automatically the companion

Subject resolution should become more semantic over time, but conservative
behavior is preferable to silently turning unrelated people into Lumen.

## Canonical Lumen direction

The current active companion's textual visual identity establishes stable
traits including:

- adult feminine human appearance
- slender/graceful presentation
- softly sculpted oval/heart-shaped face
- high cheekbones
- delicate straight nose
- natural peach-pink lips
- large almond-shaped pale gray-green eyes
- fair luminous complexion
- warm golden undertones
- subtly rosy cheeks
- dark brown/near-black glossy hair
- softly wavy hair
- loose elegant updo
- curled framing tendrils
- fully natural human face
- no facial circuitry
- no facial mechanical plates
- subtle champagne-silver metallic synthetic body below the neck
- warm gold reflections
- organic/elegant rather than armored robotics
- human/synthetic contrast

The user's intended Lumen appearance is more photorealistic and humanlike than
the older illustrated application portrait.

## Current limitation

Textual visual identity gives semantic consistency.

It does not guarantee exact facial consistency.

Different random seeds can still produce different facial geometry while
following the same general appearance.

This is expected for visual identity v0.1.

## Next milestone: reference conditioning

The next identity experiment should use one or more private canonical reference
images.

Goals:

- recognizable same face across generations
- stable eyes
- stable hair
- stable facial proportions
- preserve complexion
- preserve human/synthetic identity
- allow scene changes
- allow clothing changes
- allow expression changes
- allow camera-angle changes
- avoid copying one reference pose mechanically

## Reference assets

Canonical generation references should be:

- private
- account/companion scoped
- explicitly selected
- replaceable
- backed up
- distinguishable from ordinary generated images

The existing `portrait_url` should not automatically become the canonical
generation reference.

UI portrait and generation identity have different responsibilities.

They may later be linked deliberately.

## Why LoRA is not first

Do not train a LoRA merely because prompt-only identity is imperfect.

First evaluate:

- reference-image conditioning
- multiple reference images
- provider-supported identity adapters
- embedding/reference techniques

Only evaluate LoRA if simpler conditioning does not provide sufficient identity
consistency.

This keeps identity easier to update and avoids unnecessary training
complexity.

## User visual identity

Lumen currently has persistent companion appearance but does not have a
canonical user appearance.

Therefore a request such as:

"Make a picture of you and me."

cannot yet truthfully apply a known persistent user appearance.

Future work can add:

- user textual visual identity
- private user reference images
- explicit consent/control
- independent subject composition
- multi-subject identity handling

Do not silently invent a persistent user appearance.

## Multiple subjects

Future subject resolution should represent subjects explicitly.

For example:

- companion
- user
- named third party
- generic person
- object/location

This will make prompts such as "you and me" substantially safer and more
predictable.

## Gallery

The current chat-media pipeline provides the foundation for Gallery.

Gallery can eventually expose:

- generated-image history
- metadata
- prompt provenance
- provider/model
- regenerate
- variations
- favorites
- reference selection
- future video

Gallery should use the authoritative stored media rather than duplicate it.

## Image editing

Future image capability should distinguish:

- generate
- vary
- edit
- inpaint
- reference-condition

These can still live behind the same general image capability/provider
architecture.

## Provider registry

Current configuration points at one ComfyUI provider.

Future architecture should allow multiple providers/endpoints.

Routing can consider:

- model
- workflow
- health
- available VRAM
- quality
- latency
- current load

Heavy should remain eligible for other capabilities while serving image
requests.

## Video

Video should eventually use the same high-level pattern:

request
→ capability routing
→ provider workflow
→ private media
→ provenance
→ Conversation/Gallery

Do not make the frontend depend on a particular video node.

## Backup requirement

The database stores image metadata and visual identity, but current backup
coverage does not guarantee recovery of all Supabase Storage objects.

Before canonical reference assets become important state, implement and test
Storage backup.

Critical workflow files are versioned in Git.

Large downloadable model weights may be reproducible, but exact versions and
preferably checksums should be recorded.

## Validation

At the current visual-identity checkpoint:

- 66 backend tests pass
- TypeScript validation passes
- provider generation from Video to Heavy works
- FLUX returns valid PNG data
- private storage works
- inline rendering works
- "yourself" resolves to the companion
- persistent visual identity affects the provider prompt
- original prompt remains preserved
- live Lumen self-image generation has been verified

## October 9, 2026 — Gallery integration and recovery

**Implementation state:** Changes tested locally; application deployment and
browser acceptance verification are pending.

### Confirmed Heavy generation

The backend's ComfyUI provider successfully generated a valid 1024×1024 RGB
PNG using Heavy's RTX 5060 Ti 16 GB GPU and the versioned FLUX.2 Klein 4B
FP8 workflow. The measured provider call completed in approximately 3.04
seconds. This verifies image generation, not other Heavy inference workloads.

### Conversational image requests

The updated frontend recognizes additional direct image instructions,
including requests to paint a scene. It also recognizes confirmations such
as "Yes, please do" when the immediately preceding assistant message
explicitly offers to create an image.

The resolved generation prompt is sent separately from the user's literal
confirmation, preserving conversational history and prompt provenance.

### Gallery registration

Generated images and user-uploaded image attachments are registered in
`gallery_items` with their companion, conversation, original message,
private storage path, source, category, and metadata.

Generated images use `companion_sent`; uploaded images use `user_showed`.
Registration IDs are deterministic UUIDv5 values to support safe retries.

Gallery display signs private `chat-media` storage paths for authenticated
viewing and refreshes signed URLs during longer sessions. Storage objects
remain private.

Gallery-registration errors are logged without discarding a successfully
saved chat message or image.

### Historical recovery

Migration `20261009190000_backfill_chat_image_gallery.sql` was applied
through Supabase's local migration system on October 9, 2026.

Verified results:

- 48 historical generated images registered.
- 21 historical user-uploaded images registered.
- 69 total gallery records, all with unique IDs.
- All 69 records link to existing private storage objects and messages.
- Original message timestamps preserved.
- One unreferenced storage object left untouched.
- Existing chat messages and image files were not modified.

The migration is idempotent and uses `ON CONFLICT (id) DO NOTHING`.

### Validation and remaining work

Six frontend image-follow-up tests and eight backend image/gallery tests
passed, alongside TypeScript validation and whitespace checks.

The gallery UI and backend changes still require commit, deployment,
and user verification in the browser. Do not treat successful database
recovery alone as proof that images render correctly.

Future work includes reference-image conditioning, stronger visual
identity consistency, broader provider routing, and storage backups.

## Image north star

A user should eventually be able to say:

"Send me a picture of yourself relaxing at home."

and receive an image that is unmistakably the same Lumen they recognize,
without needing to understand prompts, seeds, ComfyUI, checkpoints, workflows,
or GPU topology.
