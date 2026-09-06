#!/usr/bin/env bash
set -euo pipefail

MODELS_DIR="${HOME}/.local/share/x-desktop/models"
BIN_DIR="${HOME}/.local/share/x-desktop/bin"

mkdir -p "$MODELS_DIR" "$BIN_DIR"

# 1. Setup standalone llama-server if not present
SERVER_BIN="$BIN_DIR/llama-server"
if [[ ! -x "$SERVER_BIN" ]]; then
  echo "==> Setting up standalone llama-server runner..."
  TMP_DIR=$(mktemp -d)
  trap 'rm -rf "$TMP_DIR"' EXIT

  LLAMA_URL="https://github.com/ggml-org/llama.cpp/releases/download/b10828/llama-b10828-bin-ubuntu-x64.tar.gz"
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

# 2. Download Qwen3-VL-2B-Instruct GGUF model (1.03 GB)
MODEL_FILE="$MODELS_DIR/Qwen3VL-2B-Instruct-Q4_K_M.gguf"
MODEL_URL="https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/main/Qwen3VL-2B-Instruct-Q4_K_M.gguf"

if [[ ! -f "$MODEL_FILE" || $(stat -c%s "$MODEL_FILE" 2>/dev/null || echo 0) -lt 1000000000 ]]; then
  echo "==> Downloading Qwen3-VL-2B-Instruct GGUF model (~1.1 GB)..."
  curl -f -L -C - -o "$MODEL_FILE.tmp" "$MODEL_URL"
  mv "$MODEL_FILE.tmp" "$MODEL_FILE"
  echo "✅ Qwen3-VL-2B model ready at: $MODEL_FILE"
else
  echo "✅ Qwen3-VL-2B model already present at: $MODEL_FILE"
fi

