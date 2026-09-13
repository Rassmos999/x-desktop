#!/usr/bin/env bash
# Fetch the local inference runtime and the models the client expects.
#
# The engine hard-requires Gemma for text translation; the Qwen pair only adds
# image translation and is skipped when --text-only is passed.
set -euo pipefail

MODELS_DIR="${HOME}/.local/share/x-desktop/models"
BIN_DIR="${HOME}/.local/share/x-desktop/bin"

TEXT_ONLY=0
[[ "${1:-}" == "--text-only" ]] && TEXT_ONLY=1

mkdir -p "$MODELS_DIR" "$BIN_DIR"

# 1. Setup standalone llama-server if not present
SERVER_BIN="$BIN_DIR/llama-server"
if [[ ! -x "$SERVER_BIN" ]]; then
  echo "==> Setting up standalone llama-server runner..."
  TMP_DIR=$(mktemp -d)
  trap 'rm -rf "$TMP_DIR"' EXIT

  LLAMA_URL="https://github.com/ggml-org/llama.cpp/releases/download/b10828/llama-b10828-bin-ubuntu-vulkan-x64.tar.gz"
  curl -f -L -o "$TMP_DIR/llama.tar.gz" "$LLAMA_URL"
  tar -xzf "$TMP_DIR/llama.tar.gz" -C "$TMP_DIR"

  # Copy llama-server and required shared libraries
  FOUND_DIR=$(find "$TMP_DIR" -name "llama-server" -exec dirname {} \; | head -n 1)
  if [[ -n "$FOUND_DIR" ]]; then
    cp -a "$FOUND_DIR"/* "$BIN_DIR/"
    chmod 755 "$BIN_DIR/llama-server"
    echo "✅ Standalone llama-server ready at: $SERVER_BIN"
  fi
fi

# 2. Download a model, resuming and skipping when a complete file is present.
#    $1 file name, $2 url, $3 minimum plausible size, $4 label
download_model() {
  local file="$MODELS_DIR/$1" url="$2" min_size="$3" label="$4"
  if [[ -f "$file" ]] && [[ $(stat -c%s "$file" 2>/dev/null || echo 0) -ge "$min_size" ]]; then
    echo "✅ $label already present: $file"
    return 0
  fi
  echo "==> Downloading $label..."
  curl -f -L -C - -o "$file.part" "$url"
  mv "$file.part" "$file"
  echo "✅ $label ready: $file"
}

# The text model is required: without it the AI engine has nothing to load.
download_model \
  "gemma-4-E2B-it-Q4_K_M.gguf" \
  "https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf" \
  3000000000 \
  "Gemma-4-E2B text model (~2.9 GB)"

# The vision pair is optional and only enables translation of text in images.
if [[ "$TEXT_ONLY" -eq 0 ]]; then
  download_model \
    "Qwen3VL-2B-Instruct-Q4_K_M.gguf" \
    "https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/main/Qwen3VL-2B-Instruct-Q4_K_M.gguf" \
    1000000000 \
    "Qwen3-VL-2B vision model (~1.03 GB)"
  download_model \
    "mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf" \
    "https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf" \
    400000000 \
    "Qwen3-VL vision projector (~425 MB)"
fi

echo
echo "Done. Launch the client and open the dashboard (Ctrl+Shift+D) to confirm the engine is ready."
echo "Models: $MODELS_DIR"
