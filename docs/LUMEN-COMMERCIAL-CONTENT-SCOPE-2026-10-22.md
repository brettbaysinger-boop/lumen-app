# Lumen — Managed Companion Platform: Non-Explicit Launch Scope
Decision: owner-approved, 2026-10-22. Status: product-direction checkpoint, documentation only.

## Decision
Lumen's commercial product will **not** offer nude avatar presentation, sexually explicit generated imagery, or pornographic/sexually explicit conversational experiences. Remove these from launch requirements and the active commercial roadmap. Do not build adult-content subscriptions, nudity toggles, or explicit-content generation features.

This decision supersedes earlier exploratory avatar planning that listed optional nude/adult-content presentation as a prospective product capability. Keep earlier discussions as historical records rather than erasing or rewriting history.

## Audience and age policy
- Initial target: **adults 18+**, with **non-explicit** product experiences. "Adults 18+" is an audience restriction, not an adult-content feature.
- Implement a reliable age-access policy, privacy and security controls, and legal/platform review before public rollout. A mock 18+ checkbox is **not** verified age assurance.
- Expansion to minors is **not approved**; assess product safety, regulatory obligations, and age-appropriate safeguards separately before considering it.
- Do not represent legal or app-store compliance as achieved merely by adopting a non-explicit product scope.

## Preserve core product direction
- Fully managed multi-user AI companion platform; no customer-configured bring-your-own-stack for the initial commercial product. Home-stack pilot and future provider migration remain internal implementation choices.
- Personalized companion personalities, optional age-appropriate romance/affection and warm conversational depth, long-term memory, privacy, voice, and natural interaction.
- Stylized-realistic full-body 3D avatar first; photorealistic option later. Maintain realistic anatomical rigging and underlying body topology for animation/clothing deformation, **without** an adult-content presentation feature.
- Clothing, hairstyles, face identity, expressions, environments, camera controls; visual identity stays separate from memory/personality.
- Existing Helios Kokoro/Whisper and local model work continue. An uncensored research model does **not** override the product's safety and behavior rules.

## Engineering implications
1. Remove adult-nudity/NSFW feature tickets and promotional commitments from the active commercial backlog; do not implement or expose adult presentation modes.
2. Character artist and renderer deliverables for Lumen should be clothed, non-explicit, and age-appropriate. Correct anatomical rigging beneath garments remains required; no nude output assets are required.
3. Muse's existing creator fixture/controls remain applicable; adult entry gates in research prototypes do **not** constitute shipped age verification. Separate age access from explicit-content entitlements.
4. Grok/security work should now prioritize age access, privacy, account isolation, consent/nonconsensual-likeness protection, asset provenance, storage, prompt/content safeguards and Helios gateway security; adult-content entitlement flows are out of scope.
5. No new production flag, database migration, deployment, runtime policy switch, or user data operation is authorized by this document alone.
6. Any reconsideration of explicit adult features requires a new explicit owner decision, dedicated legal/platform review, and a separate scoped project.

## Delivery and acceptance
This is a product/roadmap decision, **not** proof that the existing app currently enforces all content or age policies. Implementation requires separately reviewed code and owner acceptance. Keep memory Phase 2 evaluation and avatar visual/functional acceptance independent.
