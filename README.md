# Arise Dothan — Sites

Static website builder for **Arise Dothan** (a church plant in Dothan, AL). The site is driven by a JSON config in `configs/` and rendered with Handlebars templates into static HTML.

## Build

```bash
npm install
node build.js arise-dothan      # build one site → dist/arise-dothan/
node build.js --all             # build every non-underscore config
npm run clean                   # rm -rf dist
```

- Site configs: `configs/<site-id>.json`
- Base config (inherited by all): `configs/_base.json`
- Configs prefixed with `_` (e.g. `_base.json`, `_church-site-template.json`) are templates — skipped by `--all` and never deployed.
- Templates: `templates/pages/`, `templates/sections/`, `templates/layouts/` (single "default" theme at repo root — Arise is one brand).
- Per-site images: `assets/sites/<site-id>/images/` (processed after the shared `assets/images/`, so a same-named file overrides and a new file extends the set).
- The build does: Handlebars compile → CSS/JS/HTML minify → image → WebP (`sharp`) → sitemap/robots/`llms.txt` → optional Agent-Native discovery docs.

## Integrations

- **Giving** — the Give flow posts to Arise's existing **Stripe + Supabase** backend (`AriseDothan/arise-giving-api`, deployed on Render). Funds: General, Building, Missions, Youth, Worship. Supports one-time and recurring (weekly/monthly) gifts and an optional "cover the fees" toggle.
- **Contact / prayer** — form submissions go to Supabase (or an email relay). No GoHighLevel.
- **Agent-Native** — read-only MCP + discovery docs (opt-in via `agent_native.enabled`, currently disabled).

## Deploy

Deployed to **GitHub Pages** via `.github/workflows/deploy-pages.yml` — on push to `main`, it builds with `node build.js arise-dothan` and publishes `dist/arise-dothan`. The custom domain `arisedothan.com` is configured on the Pages site; DNS points at GitHub Pages once the domain transfer to the new registrar/DNS host completes.
