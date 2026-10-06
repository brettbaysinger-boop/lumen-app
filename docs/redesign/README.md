# Forge redesign: first implementation

Based on `6ccfcbc` on `feat/lumen-integration`, including image generation,
visual identity, streaming chat, model selection, and the merged media UI.

This pass adds a desktop navigation rail, a persistent companion portrait panel
on large screens, a quieter conversation layout, message starters, and a rounded
composer. Mobile retains bottom navigation. The shared dark and light palettes
now match the existing foreground/background token usage. Supporting screens use
subtle outlines and clearer headings.

Open `preview.html` for a standalone visual direction preview with explicitly
labeled sample data. It is illustrative, not a running backend demo. Navigation,
starter drafts, and sample conversation interactions work locally.

## Install on the existing local setup

Start with a clean working tree containing the existing integration changes.
Import the supplied bundle and switch to its branch:

```bash
cd ~/lumen-push
git fetch /path/to/lumen-forge-redesign.bundle feat/forge-lumen-redesign
git switch -c feat/forge-lumen-redesign FETCH_HEAD
npm ci
npm run typecheck
npm run build:web
```

Build using your existing `.env` and local Supabase/API addresses. The review
build used placeholder addresses only; generated build files are excluded from
the bundle. Deploy through your existing Lumen web startup workflow after review.

If your local integration branch has additional commits, cherry-pick the redesign
commit onto a new branch from your local integration instead of switching away
from those changes. The redesign does not change backend routes or migrations.

## Validation

- TypeScript check passed.
- Expo web export passed with placeholder Supabase variables.
- `git diff --check` passed.
- Browser rendering and real local voice/chat/image workflows need validation on
  the user's machines. This environment has no connection to those services;
  downloading the browser needed for automated visual checks failed.
