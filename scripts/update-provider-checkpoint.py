"""Append the checkpoint without replacing host-local status or handoff notes."""
from pathlib import Path

MARKER = '<!-- provider-visibility-2026-10-10 -->'


def update(root):
    entry = (root / 'docs/provider-checkpoint-entry.md').read_text()
    targets = [root / 'docs/PROJECT-STATUS.md', root / 'docs/SESSION-HANDOFF-2026-10-09.md']
    # Read both before writing so missing host notes cannot cause a partial update.
    originals = [(path, path.read_text()) for path in targets]
    for path, original in originals:
        if MARKER not in original:
            path.write_text(original.rstrip() + '\n\n' + entry)
            print(f'Appended checkpoint: {path.name}')
        else:
            print(f'Already recorded: {path.name}')


if __name__ == '__main__':
    update(Path(__file__).resolve().parents[1])
