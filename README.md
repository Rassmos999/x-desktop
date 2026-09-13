# X Desktop

Standalone desktop client for X (Twitter) built on Electron with isolated session architecture, hardware-accelerated local AI translation, network-level content filtering, and native desktop integration for Windows and Linux.

---

## Overview

X Desktop runs as a dedicated desktop process with zero credential leakage to your daily web browser instances. It pairs native desktop capabilities (such as Wayland tiling support on Linux and portable execution on Windows) with an in-process neural translation pipeline running locally on your GPU.

### Core Capabilities

- **Isolated Profile Architecture:** Cookies, LocalStorage, and cache reside exclusively in dedicated application storage (`%APPDATA%\x-desktop` on Windows and `~/.config/x-desktop` on Linux).
- **Dual-Engine Translation:**
  - **Local Neural Engine:** Discrete GPU inference using quantized GGUF models (Gemma-4 and Qwen3-VL) with Vulkan acceleration, sustaining over 85 tokens per second with 12,288 context tokens.
  - **Fast Fallback Engine:** Sub-80ms cloud translation for instantaneous reading without GPU utilization.
- **Selection Translation & Inline Replacement:** Highlight any text on the timeline to translate it in an isolated floating tooltip, copy it, or replace the word inline while preserving sentence layout.
- **Clean Timeline Filtering:** Automatic removal of promoted advertisements, boosted posts, tracking endpoints, and subscription promo banners without degrading media playback.
- **Session Assistant (Google Sign-In Bridge):** Native bridge that routes Google OAuth verification to your system browser to satisfy Google security policies, then imports and synchronizes the session token.
- **Media Controls & PiP:** Picture-in-Picture floating video window, media download capabilities, and MPRIS D-Bus integration on Linux.

---

## Distribution Packages

Automated release packages are generated across all target architectures:

| Platform | Format | Package / Target |
| :--- | :--- | :--- |
| **Windows** | Portable Zip (`.zip`) | `x-desktop-windows-x64.zip` (Includes launcher and desktop shortcut installer) |
| **Debian / Ubuntu** | Native Debian Package (`.deb`) | `x-desktop_1.0.1_amd64.deb` |
| **Fedora / RHEL** | RPM Package (`.rpm`) | `x-desktop-1.0.1-1.x86_64.rpm` |
| **Arch Linux** | Pacman Archive (`.pkg.tar.zst`) | `x-desktop-1.0.1-1-x86_64.pkg.tar.zst` |

Download prebuilt releases directly from the [GitHub Releases page](https://github.com/Rassmos999/x-desktop/releases).

---

## Local AI Model Deployment

X Desktop can execute local GGUF models directly on NVIDIA RTX GPUs via its built-in Vulkan runtime.

### Recommended Model Weights

1. **Gemma 4 (E2B-it):** Recommended for technical, programming, and conversational Arabic translation.
   - File: `gemma-4-E2B-it-Q4_K_M.gguf` (~2.9 GB)
   - Quantization: Q4_K_M
   - Context: 12,288 tokens
2. **Qwen3-VL (2B-Instruct):** Recommended for OCR and vision translation.
   - File: `Qwen3VL-2B-Instruct-Q4_K_M.gguf` (~1.03 GB)
   - Projector: `mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf` (~425 MB)

### Model Directory Structure

Place model files in the standard operating system data directory:

- **Linux:** `~/.local/share/x-desktop/models/`
- **Windows:** `%USERPROFILE%\.local\share\x-desktop\models\`

When present, the application automatically launches the local server with full layer offloading (`-ngl 99`), Flash Attention (`-fa on`), and 12K context.

---

## Local Telemetry & Documentation

The client embeds an operations telemetry interface and technical catalog:

- **Telemetry Dashboard:** `http://localhost:28492` (Live GPU VRAM, temperature, measured generation speed, and KV-cache breakdown).
- **Technical Catalog:** `http://localhost:28492/docs` (Detailed hardware requirements and runtime options).

---

## Keyboard Shortcuts

| Key Combination | Action | Scope |
| :--- | :--- | :--- |
| `Ctrl + Q` | Terminate Client & Purge VRAM | Kills all background model processes and frees GPU memory |
| `Ctrl + Shift + D` | Open Telemetry Dashboard | Launches browser monitor on port 28492 |
| `Ctrl + Wheel` | Dynamic Interface Zoom | Smooth renderer scaling |
| `Ctrl + =` | Zoom In | Increments scale factor |
| `Ctrl + -` | Zoom Out | Decrements scale factor |
| `Ctrl + 0` | Reset Zoom | Resets scale factor to 100% |
| `Ctrl + N` | Compose Post | Opens post creation modal |
| `Ctrl + 1 .. 5` | Navigation Tabs | Home, Explore, Notifications, Messages, Bookmarks |
| `Ctrl + Shift + P` | Toggle Picture-in-Picture | Detaches active video into an always-on-top window |

---

## Building from Source

### Prerequisites
- Node.js (v20+)
- Python 3 with ImageMagick or librsvg
- Make

### Build and Install
```bash
# Clone the repository
git clone https://github.com/Rassmos999/x-desktop.git
cd x-desktop

# Install dependencies and build assets
npm install
make icons

# Install locally to ~/.local
make install

# Run the client
x-desktop
```

---

## License

MIT License. Copyright (c) 2026.
