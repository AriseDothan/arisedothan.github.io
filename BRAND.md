# Arise Dothan — Brand Colors

Official palette, provided directly by Arise Dothan leadership. Documented
here for reference — **not currently applied to the site.** Brian tried it
(see git history: commits `2e7505a`, `24c2d75`, later fully reverted) and
decided to keep the site's original launch colors instead. If that changes,
this table plus `configs/_base.json`'s `branding` block is where to start.

## Core palette (official, not applied)

| Name | Hex | Role |
|---|---|---|
| Arise Blue | `#0752BC` | Primary brand color |
| Arise White | `#FFFFFF` | Clean backgrounds / contrast |
| Dawn Gold | `#BC6907` | Accent / mission highlights |
| Morning Sky | `#B3D1F6` | Soft backgrounds |
| Early Light | `#E6F0FC` | Light website sections |
| Deep Midnight | `#0A1A2E` | Text / stability |
| Warm Charcoal | `#2E2E2E` | Utility / body text |
| Soft Gray | `#CCCCCC` | Minimal lines / forms |

## What the site actually uses (original launch palette)

| Token | Hex | Role |
|---|---|---|
| `--accent` | `#1b4fc8` | Primary brand color (cobalt) |
| `--gold` | `#e0a64e` | Accent / mission highlights |
| `--dark` | `#0a1a2e` | Hero / dark section background |
| `--black` | `#0e1726` | Primary text |
| `--card` | `#ffffff` | Card / clean backgrounds |
| `--card2` | `#fdf6ee` | Light section backgrounds (warm cream) |
| `--border` / `--border-hover` | `#e6e2d9` / `#cbb48c` | Card, form, and divider lines |
| `--muted` | `#5b6470` | Body / utility text |

These live in `configs/_base.json`'s `branding` block, consumed by
`build.js`'s `generateVariablesCSS()` → `dist/<site>/css/variables.css`.
`assets/css/base.css` also hardcodes `--dawn-amber` / `--dawn-cobalt` as raw
RGB triplets mirroring `--gold` / `--accent` (needed for
`rgba(var(--dawn-amber), .34)`-style translucency, which doesn't work with a
hex custom property) — keep these in sync by hand if `--gold`/`--accent`
ever change. `scripts/publish-post.js` inline-styles the publish emails
independently with matching hardcoded hex values (email clients don't
support external stylesheets or CSS custom properties).

## Ministry sub-brand colors (documented only — not applied site-wide)

These are reserved for future ministry-specific pages/sections (kids
check-in, student ministry, worship, groups, outreach). Not wired into the
current site's design tokens.

| Ministry | Hex |
|---|---|
| Kids | `#F7A531` |
| Students | `#132F66` |
| Worship | `#D99515` |
| Groups | `#7B8F43` |
| Outreach | `#C3423F` |
