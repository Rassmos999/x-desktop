---
name: "X Desktop"
description: "Dark cinematic editorial — warm near-black ground, high-contrast display serif, copper numerals, hairline rules. Public surfaces and the engine dashboard share one world."
colors:
  ground: "#14110f"
  panel: "#1c1916"
  well: "#100e0c"
  text: "#e8decd"
  muted: "#b4a99a"
  faint: "#8d8171"
  copper: "#b7825e"
  copper-ink: "#d0a381"
  line: "rgba(232, 222, 205, 0.16)"
  line-strong: "rgba(232, 222, 205, 0.34)"
  ok: "#6f9f5f"
  ok-ink: "#a3c98f"
  warn: "#c08a3e"
  warn-ink: "#e0b169"
  bad: "#b4544a"
  bad-ink: "#e08a80"
  action: "#1d9bf0"
  action-deep: "#1a8cd8"
typography:
  display:
    fontFamily: '"Bodoni Moda", "Amiri", Georgia, serif'
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  heading-ar:
    fontFamily: '"Amiri", "Noto Naskh Arabic", Georgia, serif'
    fontWeight: 400
    lineHeight: 1.25
  body:
    fontFamily: '"Manrope", "Noto Sans Arabic", system-ui, sans-serif'
    fontSize: "15px"
    lineHeight: 1.8
  label:
    fontFamily: '"JetBrains Mono", ui-monospace, monospace'
    fontSize: "10px"
    letterSpacing: "1.7px"
  data:
    fontFamily: '"JetBrains Mono", ui-monospace, monospace'
    fontWeight: 500
    lineHeight: 1.8
rounded:
  panel: "0px"
  control: "0px"
spacing:
  gutter: "clamp(22px, 4.4vw, 72px)"
  section: "96px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "#ffffff"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    border: "1px solid {colors.line-strong}"
  marker-number:
    textColor: "{colors.copper}"
  note:
    backgroundColor: "{colors.panel}"
    border: "1px solid {colors.line}"
---

## Overview

Dark cinematic editorial. The world was adopted from a reviewed design direction and then
translated onto this product: a warm near-black ground rather than a cool one, enormous
high-contrast display serif at negative tracking, very small uppercase mono labels at wide
positive tracking, copper for numerals and markers, hairline rules instead of boxes, and
asymmetric grids that give a section a lead column and a body column.

Dark is chosen from the use scene — a GPU ops session at night — not from the category.
One world covers all three surfaces: the public landing page (Persuade), the manual (Read),
and the engine dashboard (Operate).

## Colors

Ground, panels and wells form three steps of the same warm black; rules are warm translucent
hairlines, never gray. Body text is the warm cream; secondary text holds about 7:1 on panel,
and the faint tone is reserved for large text, labels and meta.

Copper is **typographic**: numerals, section markers, emphasis, note edges. It is never a
control. X-blue is the **action** colour and appears on the primary button and nothing else —
brand heritage stays, in the one place a user clicks.

Severity is stated three ways at once — colour, plus a written label, plus a shape where one
exists — so it never depends on colour alone.

## Typography

The display voice is a Latin-only didone. Arabic has no didone, so the system states its
translation rather than leaving it to fallback: **Amiri** — a high-contrast Naskh revival —
carries Arabic display, and **Noto Sans Arabic** carries Arabic body text. The character is
preserved (high stroke contrast, classical serif) without pretending one face serves both
scripts. Arabic documents re-point the display token at Amiri outright.

Mono labels are the connective tissue. Wide positive tracking at a small size is what makes a
technical label read as considered. **Never letter-spaced or uppercased when the label carries
Arabic** — Arabic is a connected script and tracking breaks its joins.

Numerals, code, paths and commands are LTR-isolated inside RTL prose.

## Layout

Sections are asymmetric: a lead column beside a body column at roughly 1 : 2. Sections are
separated by hairline rules, with more space above a heading than below it. The reading column
is held to a comfortable measure; tables stay tables.

Below 900px the grids collapse to one column, the manual's contents rail becomes a disclosure,
and the landing hero's specification strip wraps.

## Elevation & Depth

There is no shadow anywhere. Depth is a hairline border plus a darker fill for wells. Corners
are square: this world has no rounded panels and no pills.

