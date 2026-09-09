# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: Omar plus Arabic-speaking X/Twitter power users on Linux who run the X Desktop client daily. Situation: they rely on local-AI translation inside their timeline and open the dashboard to check AI-engine health (model, VRAM, throughput) and to test a translation before trusting it in-app.

## Product Purpose

X Desktop is an Arabic-first, standalone X/Twitter desktop client for Linux (Electron, Wayland/Niri/Hyprland, tray, MPRIS) with a fully-local AI engine for translation. The dashboard surface exists to make that engine observable (GPU/telemetry, context-window map, live activity) and testable (interactive translation playground). Success: user glances and knows the engine is healthy, or pastes a tweet and gets a correct Arabic translation in seconds.

## Positioning

Private, on-device GPU translation with an Arabic-first experience — no cloud dependency for the primary path. Neighboring X clients cannot truthfully claim a local Gemma-4/Qwen3 engine on the user's own NVIDIA GPU with a live Arabic observability dashboard.

## Operating Context

Daily driver on Linux desktops (Niri/Hyprland/Wayland); NVIDIA GPU (RTX 4060 reference); local `llama-server` on 127.0.0.1:28491 serving GGUF models (Gemma-4-E2B preferred, Qwen3-VL fallback); dashboard served on 127.0.0.1:28492 and opened via Ctrl+Shift+D / tray / context menu; Google-translate scrape is fallback only.

## Capabilities and Constraints

- Dashboard capabilities: model/VRAM/tokens/cache metrics, context-window map (SYS/INPUT/OUTPUT/FREE of 8192), AI-vs-Fast translation playground with latency, live activity feed of last translations.
- Hard constraints: RTL Arabic UI; API contract `/api/telemetry`, `/api/translate {text, mode}`, `/api/translate-image` unchanged unless tests updated in same diff; test IDs `context-bar`, `starfieldCanvas`, `visionDropzone` must keep passing `npm test`; offline-first Electron (dashboard degrades gracefully with engine down); no new runtime dependencies without approval.
- Open decisions: none material for this redesign; header-asset format (inline SVG vs file) left to build.

## Brand Commitments

Name X Desktop; 𝕏 mark; X-blue `#1d9bf0` as primary accent heritage (redesign may re-weight but must not silently drop user recognition without approval); Arabic voice (ar-EG timestamps, Cairo-friendly typography); existing tray/desktop icons under `data/` untouched.

## Evidence on Hand

- `src/dashboard/index.html` (incumbent implementation, anti-reference for visuals, authority for content/function).
- `src/web-ui.js` (API contract), `src/ai-engine.js` (`getTelemetry`, `translate`, history shape), `tests/test-x-desktop.js` (contract tests).
- No testimonials, benchmarks, or marketing claims on hand — future work must not fabricate any.

## Product Principles

1. Local-first: the engine on the user's GPU is the source of truth; the dashboard reports it honestly, including offline.
2. Glanceable health: status, numbers, and context fit in one viewport before any interaction.
3. Arabic without friction: RTL-correct, legible Arabic type, LTR-isolated code/numbers, never manual cleanup.
4. Playground proves it: every claim is testable inline with visible latency and engine label.
5. No silent failure: errors, fallbacks, and disconnects are shown with a recovery path, never swallowed.

## Accessibility & Inclusion

Arabic-speaking users including those on keyboard-only navigation and screen readers; WCAG 2.2 AA target (contrast 4.5:1, visible focus, live-region announcements for async results, reduced-motion support).
