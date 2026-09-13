# X Desktop

A standalone X (Twitter) desktop client for Linux and Windows: an isolated profile, network-level
feed filtering, and Arabic translation that runs on your own GPU.

[![Release](https://img.shields.io/github/v/release/Rassmos999/x-desktop?sort=semver&color=b7825e&label=release)](https://github.com/Rassmos999/x-desktop/releases/latest)
[![License](https://img.shields.io/github/license/Rassmos999/x-desktop?color=b7825e)](LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-linux%20%7C%20windows-b7825e)](#installation)
[![Electron](https://img.shields.io/badge/electron-41-b7825e)](https://www.electronjs.org/)

[Landing page](https://rassmos999.github.io/x-desktop/) ·
[Manual](https://rassmos999.github.io/x-desktop/manual/) ·
[الدليل بالعربية](https://rassmos999.github.io/x-desktop/manual/ar/)

---

## What it is

X in a dedicated profile that shares nothing with your daily browser — no cookies, no cache, no
credentials — with translation performed by a model loaded on your own graphics card.

**Core capabilities**

- **Isolated profile.** Cookies, storage and cache live under `~/.config/x-desktop` on Linux and
  `%APPDATA%\x-desktop` on Windows, separate from every other browser on the machine.
- **Timeline filtering.** Promoted posts, boosted entries and known advertising and analytics
  endpoints are blocked at the network layer before they render.
- **Two translation engines.** AI runs locally on the GPU; Fast is a cloud call. See the honest
  comparison below.
- **Selection and inline translation.** Highlight text in a post to translate it in a tooltip,
  copy the result, or swap it inline and restore the original.
- **Local engine dashboard.** Telemetry, a test console, and model switching on
  `127.0.0.1:28492`.
- **Google sign-in bridge.** Routes Google authentication to your system browser and imports the
  resulting session token.
- **Desktop integration.** Tray actions, MPRIS media controls on Linux, example Niri and Hyprland
  tiling rules, and media download.

## Translation, stated plainly

| | AI engine | Fast engine |
| :-- | :-- | :-- |
| Runs on | Your GPU, served from `127.0.0.1:28491` | A cloud request to `translate.googleapis.com` |
| Leaves your machine | Nothing | The text you translate |
| Needs a model | Yes — one GGUF file | No |

If the local model returns nothing usable, the client currently completes the request through the
cloud path rather than failing. The dashboard tags every result with the engine that produced it,
so treat the tag as the proof of which path ran, not the button you pressed.

## Installation

| System | Package | Install |
| :-- | :-- | :-- |
| Debian, Ubuntu | `.deb` | `sudo apt install ./x-desktop_1.0.1_amd64.deb` |
| Fedora, RHEL | `.rpm` | `sudo dnf install ./x-desktop-1.0.1-1.x86_64.rpm` |
| Arch Linux | `.pkg.tar.zst` | `sudo pacman -U x-desktop-1.0.1-1-x86_64.pkg.tar.zst` |
| Windows x64 | portable `.zip` | Extract and run `x-desktop.exe` |

All four are attached to the [latest release](https://github.com/Rassmos999/x-desktop/releases/latest).

### From source

Requires Node.js 20+, Python 3, `make`, and ImageMagick or `librsvg`.

```bash
git clone https://github.com/Rassmos999/x-desktop.git
cd x-desktop
npm install
make icons
make install      # ~/.local; use PREFIX=/usr with sudo for a system install
x-desktop
```

## Models

The AI engine needs the llama.cpp runtime and at least one GGUF model. Both live outside the
application directory so they survive updates.

```bash
./tools/setup-ai-engine.sh    # runtime + required model, about 3 GB
```

| File | Size | Purpose |
| :-- | :-- | :-- |
| `gemma-4-E2B-it-Q4_K_M.gguf` | 2.89 GB | Required, from [unsloth/gemma-4-E2B-it-GGUF](https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF) |
| `Qwen3VL-2B-Instruct-Q4_K_M.gguf` | 1.03 GB | Optional vision model, from [Qwen/Qwen3-VL-2B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF) |
| `mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf` | 425 MB | Optional projector the vision model requires |

Locations: `~/.local/share/x-desktop/models/` on Linux,
`%USERPROFILE%\.local\share\x-desktop\models\` on Windows. The active model is recorded in
`config.json` in the folder above `models/`.

Any GGUF text model in that folder appears in the dashboard and can be switched to there. A file
whose name begins with `mmproj` is treated as a projector and never loaded as a model.

## Keyboard shortcuts

| Keys | Action |
| :-- | :-- |
| `Ctrl + Q` | Quit and release GPU memory |
| `Ctrl + Shift + D` | Open the engine dashboard |
| `Ctrl + 1..5` | Home, Explore, Notifications, Messages, Bookmarks |
| `Ctrl + N` | Compose a post |
| `Ctrl + =` / `Ctrl + -` / `Ctrl + 0` | Zoom in / out / reset |
| `Ctrl + wheel` | Continuous zoom |
| `Ctrl + Shift + I` | Developer tools |

## Endpoints

| Endpoint | Port | Purpose |
| :-- | :-- | :-- |
| `GET /api/telemetry` | 28492 | Engine state, model, VRAM, throughput, history |
| `GET /api/models` | 28492 | Installed models, active model, vision availability |
| `POST /api/models/active` | 28492 | Switch the active model and restart the engine |
| `POST /api/models/reveal` | 28492 | Open the models folder |
| `POST /api/translate` | 28492 | Translate text through either engine |
| `POST /api/translate-image` | 28492 | Translate text found in an image |
| `GET /health` | 28491 | Engine liveness |

Everything binds to loopback only. The model endpoints change state, so they accept requests only
from this machine's own dashboard origin.

## Development

```bash
npm start          # run the client
npm test           # contract tests
make icons         # regenerate icon sizes
make package       # build all distribution packages
```

The public site and manual are hand-authored under `docs/` and published by GitHub Pages from
`main` / `docs`. The manual is also served inside the application at
`http://127.0.0.1:28492/docs`.

## Requirements

Linux x64 or Windows x64. Local translation expects a discrete GPU reachable through Vulkan; an
NVIDIA RTX 4060 is the configuration the models were measured on. Without a compatible GPU the
client still browses and the Fast engine still translates. Image translation requires both a
vision-capable model and its projector; when either is missing the client does not offer it.

## License

MIT — see [LICENSE](LICENSE).

