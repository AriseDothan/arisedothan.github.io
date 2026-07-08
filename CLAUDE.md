# Arise Dothan Sites — Claude Code Instructions

## What This Repo Is
The website builder for **Arise Dothan**, a Spirit-filled, Bible-centered church plant in Dothan, AL (mission: *Follow. Become. Do.*). The site is a JSON config in `configs/` rendered through Handlebars templates + a single church theme, built to static HTML, and deployed to GitHub Pages.

## Build System
- `node build.js <site-id>` — build one site (outputs to `dist/<site-id>/`)
- `node build.js --all` — build every non-underscore config
- Site configs: `configs/<site-id>.json`; base (inherited by all): `configs/_base.json`
- Templates: `templates/pages/`, `templates/sections/`, `templates/layouts/`. Arise is one brand, so the **default theme lives at the repo root** (`templates/` + `assets/`); `config.theme` is omitted/`"default"`.
- Pipeline: Handlebars compile → CSS/JS minify (CleanCSS + terser; `critical.css` is inlined, not written) → image → WebP (`sharp`, with per-site override layering + auto mobile-hero) → sitemap/robots/`llms.txt` → per-page `.md` companions → optional Agent-Native discovery docs → `_redirects` → post-build validation (fails the build on any unresolved `{{…}}` or missing css/js).
- Configs prefixed with `_` are templates — skipped by `--all`, never deployed.
- **Always define `config.pages[]`** in every site config — `build.js` throws if it's missing; there is no default page set.
- **Per-site images:** `assets/sites/<site_id>/images/` is processed after the shared theme images — a same-named file overrides, a new file extends. See `assets/sites/README.md`.

## Config Structure Quick Reference
Each site config JSON:
- `site_id`, `domain`, `theme`
- `business` — name, tagline, phone, phone_raw, email, address, geo, hours (gathering times), service_area
- `branding` — nested `colors` + logo (flat palette tokens live in `_base.json`)
- `integrations` — analytics/pixel IDs (GA/GTM), giving + contact endpoints
- `seo` — title_suffix, default_meta_description, default_og_image
- `social` — facebook, instagram, x/twitter, youtube
- `custom_values` / purpose-built top-level sections — page copy, image paths, leadership, values, gatherings, events
- `cro` — per-page hero/CTA copy
- `pages` — page routing (template → output → path, title, meta, layout)
- `agent_native` — read-only MCP + discovery docs (`enabled`, id, name, description, services→ministries/gatherings)

## Integrations (Arise-specific)
- **Giving:** the Give page talks to Arise's existing **Stripe + Supabase** backend — repo `AriseDothan/arise-giving-api`, deployed on Render. Endpoints: `POST /create-payment-intent` (one-time), `POST /create-subscription` (recurring weekly/monthly), `POST /cancel-subscription`, `GET /subscriptions/:email`. Funds: **General, Building, Missions, Youth, Worship**. Optional donor-covers-fees toggle. Do NOT rebuild giving — wire the front end to this API.
- **Contact / prayer:** submissions go to Supabase (or a simple email relay). No GoHighLevel.
- The Supabase anon URL/key and the Render giving API base URL are injected via config `integrations` / `custom_values`, not hardcoded in templates.

## Agent-Native
Currently **disabled** (`agent_native.enabled: false`) — no MCP worker is deployed from this repo. If enabled later, `build.js` emits `/.well-known/agent/data.json` + discovery docs from `agent_native.services` / `.service_areas` (define these explicitly in the config; there's no auto-derivation). Read-only — no lead/quote write tool.

## Git Workflow
- Repo: `AriseDothan/arisedothan.github.io`. Branch from `main`, push, open a PR to `main`.
- Use descriptive branch names (e.g. `feat/give-page`, `content/gatherings-copy`).
- Never commit directly to `main` if branch protection is enabled.

## Deploy
- Deployed to **GitHub Pages** via `.github/workflows/deploy-pages.yml` — on push to `main`, builds with `node build.js arise-dothan` and publishes `dist/arise-dothan`, with a `CNAME` file for the custom domain.
- Custom domain: `arisedothan.com`. DNS is being migrated to a new host — the four GitHub Pages apex A records + a `www` CNAME to `arisedothan.github.io` need to be added there before the custom domain resolves.

## Style Notes
- No GoHighLevel, no seasonal-promo workers. Keep the build engine single-purpose to this one church site — don't reintroduce a multi-vertical fallback page set or unrelated service catalogs.
