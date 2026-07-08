# assets/sites/ — per-site image overrides

Theme images are shared: `build.js` copies `assets/<theme>/images/` into every
site built with that theme. Two clients on the same theme would therefore share
photos — this directory fixes that without forking the theme.

```
assets/sites/<site_id>/images/   ← this site's own photos
```

During `node build.js <site_id>`, the per-site directory is processed **after**
the theme's images:

- a file with the **same name** as a theme image **overrides** it in `dist/`
- a **new** file **extends** the set (same WebP/resize pipeline, including
  auto-generated `-mobile` hero variants)
- no per-site directory = exactly the old theme-only behavior

Subdirectories (e.g. `gallery/`) work the same way. Reference the images from
the site config (`custom_values.*_image`) exactly as before — paths in `dist/`
are unchanged (`/images/<name>.webp`).

Used by client onboarding (`scripts/onboard-client.js` stamps shared-theme
configs; drop the client's logo/hero/before-after photos here). See
`docs/CLIENT-ONBOARDING.md`.
