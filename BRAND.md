# Arise Dothan — Brand Colors

Official palette, provided directly by Arise Dothan leadership. This is the
source of truth — the CSS custom properties in `configs/_base.json`
(`branding` block, consumed by `generateVariablesCSS()` in `build.js`) should
always trace back to these values.

## Core palette

| Name | Hex | Role | Site token |
|---|---|---|---|
| Arise Blue | `#0752BC` | Primary brand color | `--accent` |
| Arise White | `#FFFFFF` | Clean backgrounds / contrast | `--card`, `--white` |
| Dawn Gold | `#BC6907` | Accent / mission highlights | `--gold` |
| Morning Sky | `#B3D1F6` | Soft backgrounds | `--accent-glow` (used as a translucent tint, `rgba(179, 209, 246, .45)`, to preserve the existing soft-glow look on icon circles and input focus rings) |
| Early Light | `#E6F0FC` | Light website sections | `--card2` |
| Deep Midnight | `#0A1A2E` | Text / stability | `--dark`, `--black` (unified — see note below) |
| Warm Charcoal | `#2E2E2E` | Utility / body text | `--muted` |
| Soft Gray | `#CCCCCC` | Minimal lines / forms | `--border` |

### Notes on values without a direct official swatch

A few existing tokens don't have a 1:1 official counterpart and were derived
to stay in the same family rather than left on the old (pre-rebrand) hex:

- `--accent-dim` (`#053E8D`) — a darker shade of Arise Blue, used for link/button
  hover states.
- `--border-hover` (`#999999`) — a darker neutral gray than Soft Gray, used for
  hover states on card/ghost-button borders.
- `--muted2` (`#6B6B6B`) — a lighter neutral gray than Warm Charcoal, used for
  de-emphasized secondary text (captions, footer fine print).
- `--orange` (`#d5813f`) — unchanged. A decorative-only accent used once (the
  third gathering-times card's top border, for a 3-color rotation). Not part
  of the official palette and not brand-critical; left as-is rather than
  reusing a ministry sub-brand color here.
- `--dawn-rose` (`#e99678` / `233, 150, 122`) — unchanged. A decorative
  highlight tone in the hero's sunrise glow gradient, not a brand token.

### Contrast note

Dawn Gold (`#BC6907`) is darker/more saturated than the old gold (`#e0a64e`),
which changes what reads well on top of it. Text previously used a dark-brown
(`#3a2708`, ~3.5:1 contrast against the new gold — fails WCAG AA) has been
switched to Deep Midnight (`#0A1A2E`, ~4.3:1) on gold buttons and the gold
marquee band. This clears AA for large/bold text and is close to normal-text
AA; verified visually across the CTA buttons, gold marquee band, and eyebrow
labels on the dark hero.

## Ministry sub-brand colors (documented only — not applied site-wide)

These are reserved for future ministry-specific pages/sections (kids
check-in, student ministry, worship, groups, outreach). They are **not**
wired into the current site's design tokens.

| Ministry | Hex |
|---|---|
| Kids | `#F7A531` |
| Students | `#132F66` |
| Worship | `#D99515` |
| Groups | `#7B8F43` |
| Outreach | `#C3423F` |

## Where colors are consumed

- `configs/_base.json` → `branding` block → `build.js`'s `generateVariablesCSS()`
  → `dist/<site>/css/variables.css` (`:root` custom properties) → every
  stylesheet in `assets/css/`.
- `assets/css/base.css` also hardcodes `--dawn-amber` / `--dawn-cobalt` as raw
  RGB triplets (needed for `rgba(var(--dawn-amber), .34)`-style translucency,
  which doesn't work with a hex custom property) — keep these in sync with
  `--gold` / `--accent` by hand if those values change again.
- `scripts/publish-post.js` inline-styles the publish emails independently
  (email clients don't support external stylesheets or CSS custom
  properties) — keep its hardcoded hex values in sync with this palette too.
