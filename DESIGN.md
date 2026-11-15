---
name: Ledger
description: A strict, ruled training log for lifters and their coaches. Graphite and chalk, plate colours as the only semantic colour.
colors:
  page: "#0b0d10"
  field: "#0f1216"
  panel: "#151920"
  control: "#1d222a"
  hover: "#29303a"
  hairline: "#353d49"
  outline: "#566070"
  chalk: "#eceae4"
  chalk-dim: "#adb3bd"
  chalk-faint: "#818995"
  plate-blue: "#2f6bff"
  plate-red: "#ef5a4d"
  plate-yellow: "#f2c230"
  plate-green: "#3fbf78"
  page-light: "#e8ebef"
  field-light: "#f4f6f8"
  panel-light: "#ffffff"
  control-light: "#eef1f4"
  hover-light: "#dfe4ea"
  hairline-light: "#c5ccd6"
  outline-light: "#8d97a5"
  ink-light: "#13161a"
  plate-blue-light: "#1f56e0"
typography:
  display:
    fontFamily: "Roboto Variable, system-ui, sans-serif"
    fontSize: "clamp(2rem, 7vw, 2.9rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Roboto Variable, system-ui, sans-serif"
    fontSize: "1.7rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Roboto Variable, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Roboto Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Roboto Variable, system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 700
    lineHeight: 1.2
  numeral:
    fontFamily: "Roboto Variable, system-ui, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 700
    fontFeature: "tnum"
rounded:
  swatch: "2px"
  tag: "4px"
  control: "6px"
  panel: "8px"
  sheet: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  touch: "44px"
components:
  button:
    backgroundColor: "{colors.control}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-hover:
    backgroundColor: "{colors.hover}"
  button-primary:
    backgroundColor: "{colors.plate-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.chalk-dim}"
    rounded: "{rounded.control}"
    height: "44px"
  segmented-control:
    backgroundColor: "{colors.field}"
    textColor: "{colors.chalk-dim}"
    rounded: "{rounded.control}"
    padding: "2px"
  segmented-control-active:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.page}"
    rounded: "{rounded.tag}"
    height: "38px"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 12px"
  set-cell:
    backgroundColor: "{colors.field}"
    textColor: "{colors.chalk}"
    typography: "{typography.numeral}"
    rounded: "{rounded.control}"
    height: "38px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.panel}"
    padding: "16px"
  tag:
    backgroundColor: "{colors.control}"
    textColor: "{colors.chalk-dim}"
    rounded: "{rounded.tag}"
    height: "24px"
  letter-badge:
    backgroundColor: "{colors.control}"
    textColor: "{colors.chalk-dim}"
    rounded: "{rounded.tag}"
    height: "26px"
---

# Design System: Ledger

## Overview

**Creative North Star: "The Programming Sheet"**

Ledger looks like a ruled, chalked programming sheet in a plate-loaded gym. It is an operating tool, used one-handed between sets and then read at a desk, so structure does the work: a strict grid, clear hairlines, outlined controls and numbers that line up. Graphite surfaces carry chalk text; the accent plate blue marks the one thing to press next, and the plate colours (red, yellow, green) are the only colours that mean something.

The system is flat and tonal. Depth comes from five separable surface steps and two line weights, not from shadows or gradients. Components are strict and exact: small radii, hard outlines, inverted selection, no decoration. Muscle groups are identified by a small colour swatch beside the name, never by a coloured bar or a tinted card.

**Key Characteristics:**
- Five-step tonal ladder (page, field, panel, control, hover) with a hairline for structure and an outline for every control.
- Roboto throughout, tabular numerals for all load data, no truncated numbers.
- Plate colours carry meaning: red near failure or over the volume ceiling, yellow approaching, green on target or in reserve.
- Muscle colour is identification only: a 9px swatch, plus a tinted letter badge in the logger.
- Dark by default and fully supported in light; the light theme is a cool neutral, not cream.

## Colors

A graphite ladder with chalk text, one blue accent, and three plate colours.

### Primary
- **Plate Blue** (#2f6bff dark, #1f56e0 light): the single accent. Primary buttons, focus rings, links, the active tab rule and the superset frame. It stays under about a tenth of any screen.

### Neutral
- **Graphite Page** (#0b0d10 / #e8ebef light): the page behind everything.
- **Sunk Field** (#0f1216 / #f4f6f8): inputs, set cells and segmented-control troughs, darker than the panel so a field reads as a hole to type into.
- **Panel Graphite** (#151920 / #ffffff): panels, sheets and the sticky top bar.
- **Control Graphite** (#1d222a / #eef1f4): buttons, tags and the letter badge.
- **Hover Graphite** (#29303a / #dfe4ea): hover and pressed states, table header cells.
- **Hairline** (#353d49 / #c5ccd6): row dividers and panel borders.
- **Outline** (#566070 / #8d97a5): the border of every button, input, cell, tag and segmented control.
- **Chalk** (#eceae4 / #13161a): text, and the fill of the active segment.
- **Chalk Dim** (#adb3bd / #454c55) and **Chalk Faint** (#818995 / #66707c): secondary and tertiary text.

### Semantic (plate colours)
- **Plate Red** (#ef5a4d): near failure, over the volume ceiling, destructive actions.
- **Plate Yellow** (#f2c230): approaching the target or ceiling.
- **Plate Green** (#3fbf78): on target, reserve left, a completed set.

### Muscle swatches
Push blue #6d9eeb, pull green #93c47d, quads red #e06666, hamstrings, glutes and erectors yellow #ffd966, everything else pink #d5a6bd. These come from the coach's own workbook and appear only as swatches and the letter badge tint.

### Named Rules
**The Plate Colour Rule.** Red, yellow and green mean load state and nothing else; they are never used for decoration or for muscle groups.
**The One Accent Rule.** Plate blue is the only accent. A second accent colour is never introduced.
**The Swatch Rule.** A muscle colour is a 9px square beside a name. It is never a border, a side bar or a tinted card background.

## Typography

**Display Font:** Roboto Variable (with system-ui, sans-serif)
**Body Font:** Roboto Variable
**Label/Mono Font:** none; numerals use tabular figures.

**Character:** a single neutral grotesque used at firm weights, so hierarchy comes from size and weight rather than from a second face.

### Hierarchy
- **Display** (700, clamp(2rem, 7vw, 2.9rem), 1.08): page titles; wraps rather than truncating long program names.
- **Headline** (700, 1.7rem, 1): section and sheet titles.
- **Title** (600, 1.25rem, 1): panel headings.
- **Session / exercise name** (700, 1.4rem session rows, 1.12rem exercise names, -0.01em): the names a lifter scans.
- **Body** (400, 1rem, 1.45): copy, capped near 62ch.
- **Numeral** (700, 1.1rem, tabular): weights, reps and RIR in set cells, all load data.
- **Label** (600 to 700, 0.72 to 0.85rem): table headers, helper text, tags.

### Named Rules
**The Tabular Rule.** Every number a lifter compares is set in tabular figures and is never truncated or ellipsised.

## Layout

A single column on phones: content padded 16px, capped at 780px (880px beside the sidebar), with the tab bar fixed at the bottom and inset for the system bars. At 960px and wider a 224px sidebar replaces the tab bar. Page headers sit on a hairline rule. Sections are separated by 24px, items within a stack by 14px, and rows inside panels by hairline dividers rather than extra boxes. Tap targets are 44px, with 36px for compact controls and 32px for the icon tools in an exercise header. Wide tables (library, log sheet, plan) scroll inside their own bordered frame with sticky first columns and never widen the page. At 380px the set grid tightens, and below 520px the long progression note is hidden.

### Named Rules
**The No Nested Card Rule.** Panels never contain panels. Inside a panel, groups are separated by hairlines or spacing.

## Elevation & Depth

Flat and tonal. There are no resting shadows. Depth is conveyed by the surface ladder (page, field, panel, control, hover) and by the two line weights. The only floating elements are the rest timer bar and the toast, which invert to a chalk fill, and the bottom sheet, which rises over a dimmed scrim.

### Named Rules
**The Flat-By-Default Rule.** Surfaces carry no shadow at rest. Separation is a border or a tonal step.

## Shapes

Small, firm radii: panels 8px, controls and cells 6px, tags, the letter badge and segments 4px, swatches 2px, bottom sheet 12px. Set-completion discs are the one circle, 38px. Every control and field has a 1px outline in the outline colour; panels and rows use the lighter hairline. A superset is a single 1px plate-blue frame around its members, with an 8px outer radius.

## Components

### Buttons
- **Shape:** 6px radius, 44px tall (36px small), outline border.
- **Default:** control graphite fill, chalk text, outline border; hover moves to hover graphite and a lighter border.
- **Primary:** plate blue fill, white text, used once per view.
- **Ghost:** no fill or border, dim text; used for tool icons and dismiss actions.
- **Danger:** red text on the default button.

### Segmented control
- **Style:** a sunk-field trough with an outline; the active segment is inverted (chalk fill, page-coloured text). Long controls scroll sideways instead of widening the page.

### Inputs / Fields
- **Style:** sunk field fill, outline border, 6px radius, 44px tall; set cells are 38px and centred.
- **Focus:** the border turns plate blue with a 2px translucent ring.
- **Done state:** a completed set tints its cells green.

### Panels and lists
- **Panel:** panel graphite, 1px hairline, 8px radius, 16px padding. Lists inside use hairline dividers.

### Tags
- **Style:** 4px radius, control fill, outline border, semantic text colour for ok, warn, bad and accent states.

### Navigation
- **Mobile:** fixed bottom tab bar with a strong top line; the active tab has a 2px plate-blue rule on top and a blue icon.
- **Desktop:** a 224px sidebar with the brand at the top; the active item sits in a hairline-bordered panel.

### Exercise header and superset
- **Letter badge:** 34 by 26px, 4px radius, tinted with the muscle colour; the letter names the superset group and the number the order inside it.
- **Superset frame:** members share a 1px plate-blue frame with a plain sentence label; rest starts after the last member.

### Volume track
- **Style:** a 12px sunk track with a hairline, a plate-coloured fill, a chalk target tick and a red ceiling tick.

### Rest timer
- **Style:** a chalk-filled bar above the tab bar, with the time in large numerals, minus and plus 15 seconds, skip, and a thin accent progress line.

## Do's and Don'ts

### Do:
- **Do** separate layers with the tonal ladder and the two line weights; every control gets the outline weight.
- **Do** use plate blue for the single next action and plate colours only for load state.
- **Do** show muscle identity as a 9px swatch next to the name.
- **Do** keep all load numbers tabular and fully visible, wrapping names rather than truncating numbers.
- **Do** scroll wide tables inside their own frame.
- **Do** respect reduced motion; the sheet rise (0.24s, exponential ease-out) is the one motion moment.

### Don't:
- **Don't** put cards inside cards.
- **Don't** add eyebrow labels above headings.
- **Don't** use coloured side bars or tinted card backgrounds for muscle groups.
- **Don't** add resting shadows, gradients or glow.
- **Don't** introduce a second accent colour or use red, yellow or green decoratively.
- **Don't** use cream or warm beige in the light theme.
