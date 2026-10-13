# AI infrastructure

> **Latest five-node runtime checkpoint — October 13, 2026:** [Current LLM Stack Map](LLM-STACK-MAP-2026-10-13.md). This supersedes the *node count* and infrastructure verification status below, without rewriting the earlier October 11 hardware evidence. Five hosts include dedicated Forge and Raspberry Pi 5. The Pi's monitoring software is **not installed**; Video remains the running companion/database node, Heavy remains a general GPU capability node and Helios remains speech. PostgreSQL and storage backups were copied as an encrypted archive to Forge, but restore is untested. Video UFW remains inactive; planned Docker/port hardening is not complete. No services changed in this docs-only checkpoint.


## Verified application node — October 11, 2026 (America/Phoenix)

User-supplied terminal evidence from `aiLumen-llm-video`:

| Component | Verified configuration |
| --- | --- |
| Host | `aiLumen-llm-video` |
| OS | Ubuntu 26.04.1 LTS, Resolute Raccoon |
| Architecture | x86_64 |
| CPU | AMD Ryzen 5 5500; 12 logical CPUs |
| Memory | 45 GiB reported usable RAM |
| Swap | 14 GiB reported by free; 14.8 GiB swap partition |
| GPU | NVIDIA GeForce RTX 5070 |
| GPU memory | 12,227 MiB reported by nvidia-smi; 12 GB class |
| NVIDIA driver | 595.99.02 |
| OS drive | `/dev/sda`, 238.5 GiB SATA SSD; model reported only as SSD |
| Root filesystem | `/dev/sda2`, 222.6 GiB, XFS, mounted at `/` |
| EFI partition | `/dev/sda1`, 1 GiB, FAT, mounted at `/boot/efi` |
| Data drive | Samsung SSD 980 1TB, `/dev/nvme0n1`, 931.5 GiB |
| Data filesystem | `/dev/nvme0n1p1`, XFS, mounted at `/data` |

RAM module capacities/speeds, motherboard model and kernel version were
not supplied in this checkpoint. GPU board vendor is not established by
this nvidia-smi output. Storage sizes above are OS-reported GiB values.

Application responsibilities include Expo web/Android development, FastAPI,
local Supabase/Auth/database, orchestration, and Android notification worker.
Active checkout: `/home/brett/lumen-push`.
Accepted application commit: `a5d184e`, branch `feat/lumen-take2-local`.

## Other stack nodes

Existing project architecture records Helios (`aiLumen-llm-tts-stt`) for
speech recognition/synthesis and Heavy (`aiLumen-llm-heavy`) for GPU inference
and image generation. A separate Forge coding host has been reported in
parallel work. Their current hardware/runtime inventories were not included
in this host checkpoint; retain their existing evidence and obtain fresh
node checkpoints before consolidating exact specifications here.

See [architecture](architecture.md) and
[project status](PROJECT-STATUS.md) for provider roles and application state.
