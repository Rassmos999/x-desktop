---
name: "X Desktop Dashboard"
description: "Mission-control telemetry wall for the local AI engine — Arabic-first ops room, dark from the night-ops scene."
colors:
  ground: "#06080c"
  panel: "#0b0f15"
  well: "#04060a"
  text: "#e9eef5"
  muted: "#9facc0"
  line: "rgba(255, 255, 255, 0.09)"
  line-strong: "rgba(255, 255, 255, 0.18)"
  ok: "#22c55e"
  ok-ink: "#4ade80"
  warn: "#f59e0b"
  warn-ink: "#fbbf24"
  fault: "#ef4444"
  fault-ink: "#f87171"
  action: "#1d9bf0"
  action-deep: "#1a8cd8"
  engine-ai: "#a855f7"
  engine-ai-ink: "#c084fc"
  engine-fast: "#38bdf8"
  engine-fast-ink: "#7dd3fc"
  tank-sys: "#1d4ed8"
  tank-in: "#0284c7"
  tank-out: "#047857"
  focus: "#7dd3fc"
typography:
  data:
    fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    fontWeight: 600
    lineHeight: 1.3
  label:
    fontFamily: '"Noto Sans Arabic", "IBM Plex Sans", system-ui, sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
  heading:
    fontFamily: '"Noto Sans Arabic", "IBM Plex Sans", system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.6
  body-ar:
    fontFamily: '"Noto Sans Arabic", "IBM Plex Sans", system-ui, sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.9
rounded:
  panel: "14px"
  control: "8px"
  well: "10px"
  pill: "5px"
spacing:
  cut: "26px"
  panel: "20px"
  row: "17px"
  tight: "10px"
components:
  readout-value:
    typography: "{typography.data}"
    textColor: "{colors.text}"
  readout-label:
    typography: "{typography.label}"
    textColor: "{colors.muted}"
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "9px 22px"
  button-primary-hover:
    backgroundColor: "{colors.action-deep}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "9px 22px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "9px 22px"
  status-ok:
    textColor: "{colors.ok-ink}"
  status-idle:
    textColor: "{colors.warn-ink}"
  pill-ai:
    textColor: "{colors.engine-ai-ink}"
    rounded: "{rounded.pill}"
  pill-fast:
    textColor: "{colors.engine-fast-ink}"
    rounded: "{rounded.pill}"
---

## Overview

Telemetry Wall: a single-viewport ops room for one local engine. Status rail at inline-start, numbered test console first in the main column, context tank plus route states, operations log last. Dark is picked from the use scene (late-night GPU ops), not the category. Severity is always color plus glyph plus label, never color alone. Data reads in tabular mono, LTR-isolated inside RTL Arabic prose.

## Colors

Ground near-black `{colors.ground}`, panels `{colors.panel}`, wells `{colors.well}`; hairline rules `{colors.line}`. Nominal green, degraded amber, fault red — each with a lighter ink variant for text on dark. Primary action keeps X-blue heritage `{colors.action}`. Engine tags: AI purple, Fast sky. Tank segments: system indigo, input sky-dark, output emerald. Muted body text holds ~7:1 on panels; faint grays are large-text/meta only.

## Typography

Arabic voice is Noto Sans Arabic first with an offline-safe system fallback (dashboard must render with no network). Data voice is JetBrains Mono first with tabular numerals; every number/code/clock is LTR-isolated (`direction: ltr; unicode-bidi: isolate`). Arabic labels never use letter-spacing or uppercase transforms. Headings are semibold 16px; body Arabic runs 1.9 line-height.

## Layout

Max width 1240px; rail 300px plus fluid main; deep cut gaps (26px) between sections; tight groups inside panels. Desktop rail is sticky; below 960px everything stacks single-column with a static rail; below 480px the log table becomes label-stacked cards and headers hide accessibly. One lobe per section: each panel is dominated by one data region.

## Elevation & Depth

Elevation is declared once, as border: 1px hairline panels, no shadows. Wells sit one step deeper via darker fill. Status glyphs may glow (nominal pulse only, off under reduced motion).

## Shapes

Panels 14px, controls 8px, wells 10px, pills 5px. Status glyphs: circle nominal, rounded square degraded, rotated square fault, triangle idle-route. Tank bar is an 18px slim gauge with true linear proportions and numeric legend.

## Components

Status rail: state line (glyph plus label, `role=status`), model line, readout rows (short label above LTR value), live clock. Console: three numbered steps (input with real label and LTR textarea, engine buttons with latency readout, output with `role=status`). Tank: slim bar with aria-labeled segments plus numeric legend and utilization caption. Routes: code plus glyph state rows. Log: table with engine pills and mono timestamps, `role=log` with polite live region, re-rendered only on content change; empty state explains itself.

## Do's and Don'ts

Do keep every test ID (`context-bar`, `starfieldCanvas`, `visionDropzone`, metric and control IDs) or update `tests/test-x-desktop.js` in the same diff. Do render feed and metrics with `textContent`, never `innerHTML`. Do pause polling when the document is hidden. Do keep the `/api/*` contract byte-compatible. Don't prefill the result box with invented translations; don't show measurements before they exist (`RTT —`); don't draw tank segments out of proportion for looks; don't use emoji or unicode glyphs as icons; don't add kickers, section numbers, or nested cards.
