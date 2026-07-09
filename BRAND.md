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
| Morning Sky | `#B3D1F6` | Soft backgrounds | not currently used as a flat swatch — see cream exception below |
| Early Light | `#E6F0FC` | Light website sections | not currently used — see cream exception below |
| Deep Midnight | `#0A1A2E` | Text / stability | `--dark`, `--black` (unified — previously two near-identical near-blacks) |
| Warm Charcoal | `#2E2E2E` | Utility / body text | `--muted` |
| Soft Gray | `#CCCCCC` | Minimal lines / forms | not currently used — see cream exception below |

### Deliberate exception: legacy warm cream retained for section backgrounds

Brian's call: the site keeps its original warm cream instead of switching to
Early Light / Soft Gray for section backgrounds and borders. Everything else
in this doc (Arise Blue, Dawn Gold, Deep Midnight, Warm Charcoal) is the
official value as specified.

- `--card2` (light section backgrounds, e.g. "When we gather", the dawn
  gradient sections, the newsletter/msg-preview cards) = `#fdf6ee` (the
  original cream), **not** Early Light `#E6F0FC`.
- `--border` / `--border-hover` (card, form, and divider lines) =
  `#e6e2d9` / `#cbb48c` (the original warm tan tones), **not** Soft Gray
  `#CCCCCC`. These sit on both white and cream backgrounds throughout the
  site, and the warm tone reads better against cream than a cool gray does —
  Soft Gray remains the official spec on paper, but isn't applied here.
- `--accent-glow` (soft translucent backgrounds behind icon circles + input
  focus rings) = a translucent tint of the *current* Arise Blue,
  `rgba(7, 82, 188, .20)` — the same "accent at low alpha" pattern the site
  used before the rebrand, just re-derived from the new blue. Not tied to
  Morning Sky: those icon circles render on white cards (`--card`), not
  directly on the cream `--card2`, so a flat Morning Sky swatch was never
  actually needed here, and a blue-on-cream flat fill risked looking muddy
  next to the restored cream sections. Verified visually — no clash.

If a lighter blue-tinted background is ever wanted for a *new* component
sitting on white, `#B3D1F6` / `#E6F0FC` / `#CCCCCC` are the correct official
values to reach for — they're just not in use on the current page set.

### Notes on values without a direct official swatch

A few existing tokens don't have a 1:1 official counterpart and were derived
to stay in the same family rather than left on the old (pre-rebrand) hex:

- `--accent-dim` (`#053E8D`) — a darker shade of Arise Blue, used for link/button
  hover states.
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
  properties) — keep its hardcoded hex values in sync with this palette too,
  including the cream exception (its background/footer use `#fdf6ee` /
  `#e6e2d9` to match the site's `--card2`/`--border`, not Early Light/Soft
  Gray).
