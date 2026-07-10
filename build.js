#!/usr/bin/env node

/**
 * Arise Dothan Site Builder
 *
 * Reads a location config, processes Handlebars templates, generates
 * complete static HTML/CSS/JS output ready for static hosting.
 *
 * Usage:
 *   node build.js arise-dothan                   # Build one site
 *   node build.js --all                          # Build all sites
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Handlebars = require('handlebars');
const CleanCSS = require('clean-css');
const { minify: terserMinify } = require('terser');
const { minify: htmlMinify } = require('html-minifier-terser');
const sharp = require('sharp');
const yaml = require('yaml');
const { marked } = require('marked');

// ─── Cache Buster ─────────────────────────────────────────────────────
// Short hash unique to each build — appended as ?v= on CSS/JS references
const BUILD_HASH = crypto.randomBytes(4).toString('hex');

// ─── Config ────────────────────────────────────────────────────────────
const ROOT = __dirname;
const CONFIGS_DIR = path.join(ROOT, 'configs');
const DIST_DIR = path.join(ROOT, 'dist');

// Theme-aware directory resolution
// If a config has "theme": "op-select", templates come from templates/op-select/
// and assets from assets/op-select/. Default theme uses templates/ and assets/ directly.
function getTemplatesDir(theme) {
  if (theme && theme !== 'default') {
    return path.join(ROOT, 'templates', theme);
  }
  return path.join(ROOT, 'templates');
}

function getAssetsDir(theme) {
  if (theme && theme !== 'default') {
    return path.join(ROOT, 'assets', theme);
  }
  return path.join(ROOT, 'assets');
}

// ─── Handlebars Helpers ────────────────────────────────────────────────
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('year', () => new Date().getFullYear());
Handlebars.registerHelper('isodate', () => new Date().toISOString().split('T')[0]);
Handlebars.registerHelper('json', (obj) => JSON.stringify(obj, null, 2));
Handlebars.registerHelper('concat', (...args) => {
  args.pop(); // remove Handlebars options
  return args.join('');
});
Handlebars.registerHelper('cachebust', () => BUILD_HASH);
Handlebars.registerHelper('formatDate', (isoDate) => {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
});

// ─── Load Config ───────────────────────────────────────────────────────
function loadConfig(siteId) {
  const basePath = path.join(CONFIGS_DIR, '_base.json');
  const sitePath = path.join(CONFIGS_DIR, `${siteId}.json`);

  if (!fs.existsSync(sitePath)) {
    console.error(`Config not found: ${sitePath}`);
    process.exit(1);
  }

  const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  const site = JSON.parse(fs.readFileSync(sitePath, 'utf8'));

  // Deep merge base into site (site values take precedence)
  return deepMerge(base, site);
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ─── Template Processing ───────────────────────────────────────────────
function loadTemplate(templatesDir, templatePath) {
  const fullPath = path.join(templatesDir, templatePath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`Template not found: ${fullPath}`);
    return null;
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function registerPartials(templatesDir) {
  // Clear previously registered partials to avoid cross-theme bleed
  const registered = Handlebars.partials;
  for (const key of Object.keys(registered)) {
    Handlebars.unregisterPartial(key);
  }

  // Register all section templates as partials
  const sectionsDir = path.join(templatesDir, 'sections');
  if (fs.existsSync(sectionsDir)) {
    for (const file of fs.readdirSync(sectionsDir)) {
      if (file.endsWith('.html')) {
        const name = file.replace('.html', '');
        const content = fs.readFileSync(path.join(sectionsDir, file), 'utf8');
        Handlebars.registerPartial(name, content);
      }
    }
  }

  // Register layouts as partials
  const layoutsDir = path.join(templatesDir, 'layouts');
  if (fs.existsSync(layoutsDir)) {
    for (const file of fs.readdirSync(layoutsDir)) {
      if (file.endsWith('.html')) {
        const name = `layout-${file.replace('.html', '')}`;
        const content = fs.readFileSync(path.join(layoutsDir, file), 'utf8');
        Handlebars.registerPartial(name, content);
      }
    }
  }
}

// ─── Page Definitions ──────────────────────────────────────────────────
// Every site config must define its own pages array.
function getPages(config) {
  if (config.pages && Array.isArray(config.pages)) {
    return config.pages;
  }

  throw new Error(`Config "${config.site_id || config.domain}" is missing a pages[] array. Define config.pages explicitly — there is no default page set.`);
}

// ─── Build 404 Page ───────────────────────────────────────────────────
// If the theme has a pages/404.html template, compile it through the
// normal layout pipeline.  Otherwise, generate a minimal branded 404
// so every Cloudflare Pages deployment returns a real HTTP 404.
async function build404Page(templatesDir, baseLayout, context, config, outputDir) {
  const templateSrc = loadTemplate(templatesDir, 'pages/404.html');

  // Only reference the 404 CSS file if the theme provides a custom template
  // (and therefore likely has the matching CSS). Fallback uses inline styles.
  const page404Meta = {
    title: 'Page Not Found',
    meta_description: `The page you requested could not be found. Return home to ${config.business.name}.`,
    path: '/404.html',
    noindex: true,
    og_image: config.seo.default_og_image,
    css_files: templateSrc ? ['page-404.css'] : []
  };

  let pageContent;
  if (templateSrc) {
    // Theme provides a custom 404 template
    const pageCompiled = Handlebars.compile(templateSrc);
    pageContent = pageCompiled(context);
  } else {
    // Fallback — minimal branded 404 that works with any theme's base layout
    pageContent = `
<section class="section" style="min-height:60vh;display:flex;align-items:center;justify-content:center;text-align:center">
  <div class="container container--narrow stack">
    <span class="eyebrow mx-auto">Page not found</span>
    <h1>This page wandered off.</h1>
    <p class="lede">The page you're looking for doesn't exist or has moved. Let's get you back home.</p>
    <div class="btn-row" style="justify-content:center">
      <a class="btn btn--primary btn--lg" href="/">Back to Home</a>
      <a class="btn btn--ghost btn--lg" href="/gatherings/">Plan a visit</a>
    </div>
  </div>
</section>`;
  }

  const pageContext = {
    ...context,
    page: {
      ...page404Meta,
      content: pageContent
    }
  };

  const rawHtml = baseLayout(pageContext);

  let html;
  try {
    html = await htmlMinify(rawHtml, {
      collapseWhitespace: true,
      removeComments: true,
      minifyCSS: true,
      minifyJS: true,
      removeRedundantAttributes: true,
      removeEmptyAttributes: true,
      conservativeCollapse: true
    });
  } catch (e) {
    console.log(`  WARN: HTML minify failed for 404.html, using unminified`);
    html = rawHtml;
  }

  fs.writeFileSync(path.join(outputDir, '404.html'), html);
  console.log('  OK: 404.html');
}

// ─── Generate Sitemap ──────────────────────────────────────────────────
function generateSitemap(config, pages, blogPosts) {
  const today = new Date().toISOString().split('T')[0];
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  for (const page of pages) {
    xml += `  <url>\n`;
    xml += `    <loc>https://${config.domain}${page.path}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
    xml += `    <priority>${page.priority}</priority>\n`;
    xml += `  </url>\n`;
  }

  // Blog posts
  if (blogPosts && blogPosts.length > 0) {
    // Blog index
    xml += `  <url>\n`;
    xml += `    <loc>https://${config.domain}/blog/</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>daily</changefreq>\n`;
    xml += `    <priority>0.7</priority>\n`;
    xml += `  </url>\n`;

    for (const post of blogPosts) {
      // Skip noindexed posts from sitemap
      if (post._noindex) continue;
      const lastmod = post.updated_at ? post.updated_at.split('T')[0] : today;
      xml += `  <url>\n`;
      xml += `    <loc>https://${config.domain}/blog/${post.slug}/</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += `    <changefreq>monthly</changefreq>\n`;
      xml += `    <priority>0.5</priority>\n`;
      xml += `  </url>\n`;
    }
  }

  xml += `</urlset>\n`;
  return xml;
}

// ─── Generate robots.txt ───────────────────────────────────────────────
function generateRobots(config) {
  return `User-agent: *\nAllow: /\n\nSitemap: https://${config.domain}/sitemap.xml\n`;
}

// ─── Agent Readiness (Markdown for Agents, llms.txt) ───────────────────
// Makes each site machine-readable per the emerging agent standards checked
// by Cloudflare's "Is It Agent Ready" scanner:
//   - A .md companion for every HTML page (served via Markdown content
//     negotiation by the repo-root functions/_middleware.js Pages Function)
//   - An llms.txt index describing the site for LLMs (llmstxt.org)
//   - An Agent Skills discovery index at /.well-known/agent-skills/
//     documenting the site's real actions (agentskills.io RFC v0.2.0)
function stripTagsToText(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ');
}

const NAMED_ENTITIES = {
  nbsp: ' ', lt: '<', gt: '>', quot: '"',
  apos: "'", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"',
  mdash: '—', ndash: '–', hellip: '…', middot: '·', bull: '•',
  rarr: '→', larr: '←', uarr: '↑', darr: '↓', harr: '↔',
  deg: '°', times: '×', divide: '÷', minus: '−', plusmn: '±',
  starf: '★', star: '☆', infin: '∞', check: '✓', cross: '✗',
  copy: '©', reg: '®', trade: '™', sect: '§', para: '¶',
  prime: '′', Prime: '″', dagger: '†', Dagger: '‡',
  laquo: '«', raquo: '»', hearts: '♥', diams: '♦', clubs: '♣', spades: '♠',
  euro: '€', pound: '£', cent: '¢', yen: '¥',
  frac12: '½', frac14: '¼', frac34: '¾',
};

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 10)); } catch { return ''; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ''; } })
    .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (m, name) => (name in NAMED_ENTITIES ? NAMED_ENTITIES[name] : m))
    .replace(/&amp;/g, '&');
}

// Dependency-free HTML → Markdown for the main content region of a rendered page.
function htmlToMarkdown(rawHtml) {
  let h = String(rawHtml || '');

  // Isolate the primary content region; fall back to <body> then whole doc.
  const main = h.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main) {
    h = main[1];
  } else {
    const body = h.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    if (body) h = body[1];
  }

  // Drop non-content, interactive, and boilerplate blocks entirely.
  h = h.replace(/<!--[\s\S]*?-->/g, ' ');
  h = h.replace(/<(script|style|noscript|svg|template|iframe|form|select|head)\b[\s\S]*?<\/\1>/gi, ' ');
  h = h.replace(/<(nav|header|footer)\b[\s\S]*?<\/\1>/gi, ' ');

  // Headings.
  for (let i = 6; i >= 1; i--) {
    const re = new RegExp(`<h${i}\\b[^>]*>([\\s\\S]*?)<\\/h${i}>`, 'gi');
    h = h.replace(re, (_, t) => `\n\n${'#'.repeat(i)} ${decodeHtmlEntities(stripTagsToText(t)).trim()}\n\n`);
  }

  // Line breaks and rules.
  h = h.replace(/<br\s*\/?>/gi, '\n');
  h = h.replace(/<hr\s*\/?>/gi, '\n\n---\n\n');

  // Emphasis.
  h = h.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) => `**${stripTagsToText(t).trim()}**`);
  h = h.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t) => `*${stripTagsToText(t).trim()}*`);

  // Links and images.
  h = h.replace(/<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, t) => {
    const text = stripTagsToText(t).trim();
    if (!text) return '';
    if (!href || href.startsWith('#') || href.startsWith('javascript')) return text;
    return `[${text}](${href})`;
  });
  h = h.replace(/<img\b[^>]*>/gi, (tag) => {
    const alt = (tag.match(/alt="([^"]*)"/i) || [, ''])[1];
    const src = (tag.match(/src="([^"]*)"/i) || [, ''])[1];
    return alt ? `![${alt}](${src})` : '';
  });

  // Lists.
  h = h.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `\n- ${stripTagsToText(t).trim()}`);
  h = h.replace(/<\/(ul|ol)>/gi, '\n\n');

  // Block separators.
  h = h.replace(/<\/(p|div|section|article|tr|li)>/gi, '\n\n');
  h = h.replace(/<\/(td|th)>/gi, ' ');

  // Strip any remaining tags, decode entities, normalize whitespace.
  h = decodeHtmlEntities(stripTagsToText(h));
  h = h.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
  return h.trim();
}

// Build the full Markdown document for a page (front-matter-style header + body).
function pageMarkdown(page, rawHtml, config) {
  const title = decodeHtmlEntities(
    page.title || (rawHtml.match(/<title>([\s\S]*?)<\/title>/i) || [, ''])[1]
  ).trim();
  const desc = decodeHtmlEntities(
    page.meta_description || (rawHtml.match(/<meta\s+name="description"\s+content="([^"]*)"/i) || [, ''])[1]
  ).trim();
  const urlPath = page.path || ('/' + String(page.output || '').replace(/index\.html$/, '').replace(/\.html$/, ''));
  const canonical = `https://${config.domain}${urlPath}`;

  let out = `# ${title}\n\n`;
  if (desc) out += `> ${desc}\n\n`;
  out += `Source: ${canonical}\n\n---\n\n`;
  out += htmlToMarkdown(rawHtml) + '\n';
  return out;
}

// llms.txt — a concise, machine-readable index of the site (llmstxt.org).
function generateLlmsTxt(config, pages, blogPosts) {
  const b = config.business || {};
  const addr = b.address || {};
  const name = b.name || config.domain;
  const tagline = b.tagline || `${name}${addr.city ? ` — ${addr.city}, ${addr.state || ''}`.trim() : ''}`.trim();

  let out = `# ${name}\n\n> ${tagline}\n\n`;

  const facts = [];
  if (b.phone) facts.push(`- Phone: ${b.phone}`);
  if (b.email) facts.push(`- Email: ${b.email}`);
  if (addr.street) facts.push(`- Address: ${addr.street}, ${addr.city}, ${addr.state} ${addr.zip || ''}`.trim());
  if (b.service_area) facts.push(`- Service area: ${Array.isArray(b.service_area) ? b.service_area.join(', ') : b.service_area}`);
  if (facts.length) out += facts.join('\n') + '\n\n';

  out += `Pages below offer a Markdown version via \`Accept: text/markdown\` content negotiation, or by appending the linked path.\n\n## Pages\n\n`;
  for (const p of pages) {
    const urlPath = p.path || ('/' + String(p.output || '').replace(/index\.html$/, '').replace(/\.html$/, ''));
    const t = decodeHtmlEntities(String(p.title || urlPath)).replace(/\s*[|—-].*$/, '').trim() || urlPath;
    const d = p.meta_description ? `: ${decodeHtmlEntities(p.meta_description).trim()}` : '';
    out += `- [${t}](https://${config.domain}${urlPath})${d}\n`;
  }

  const indexable = (blogPosts || []).filter(post => post && !post._noindex);
  if (indexable.length) {
    out += `\n## Blog\n\n- [Blog index](https://${config.domain}/blog/)\n`;
    for (const post of indexable.slice(0, 100)) {
      const t = decodeHtmlEntities(String(post.title || post.slug)).trim();
      out += `- [${t}](https://${config.domain}/blog/${post.slug}/)\n`;
    }
  }
  return out;
}

// Agent Skills discovery index (agentskills.io / Cloudflare RFC v0.2.0).
// Publishes /.well-known/agent-skills/index.json + per-skill SKILL.md files
// documenting the site's REAL actions (request a quote, business info) so an
// agent can act on the live site. Returns a list of {rel, content} files;
// each index entry carries a sha256 digest of its SKILL.md artifact.
function generateAgentSkills(config, pages) {
  const b = config.business || {};
  const addr = b.address || {};
  const base = `https://${config.domain}`;
  const findPath = (re) => {
    const p = (pages || []).find(pg => re.test((pg.path || '') + ' ' + (pg.output || '')));
    return p && p.path ? p.path : null;
  };
  const contactPath = findPath(/contact/i);
  const servicesPath = findPath(/services/i);
  const hours = b.hours || {};
  const hoursLine = [
    hours.weekday_open ? `Mon–Fri ${hours.weekday_open}–${hours.weekday_close}` : null,
    hours.saturday_open ? `Sat ${hours.saturday_open}–${hours.saturday_close}` : null,
    hours.sunday ? `Sun ${hours.sunday}` : null,
  ].filter(Boolean).join(' · ');
  const area = Array.isArray(b.service_area) ? b.service_area.join(', ') : (b.service_area || '');

  const skills = [];

  // Skill: plan a visit / get connected (uses the site's real pages).
  {
    const gatherPath = findPath(/gather/i);
    const connectPath = findPath(/connect|contact/i);
    let md = `# Plan a Visit to ${b.name}\n\n`;
    md += `Help someone plan a first visit to ${b.name}`;
    md += addr.city ? ` in ${addr.city}, ${addr.state}, or get connected.\n\n` : `, or get connected.\n\n`;
    if (b.tagline) md += `> ${b.tagline}\n\n`;
    if (Array.isArray(config.gatherings) && config.gatherings.length) {
      md += `## Gatherings\n\n`;
      for (const g of config.gatherings) {
        md += `- ${[g.when, g.time, g.what].filter(Boolean).join(' — ')}${g.detail ? `: ${g.detail}` : ''}\n`;
      }
      md += `\n`;
    }
    if (addr.venue || addr.street) {
      md += `Location: ${[addr.venue, addr.street, addr.city ? `${addr.city}, ${addr.state} ${addr.zip || ''}`.trim() : null].filter(Boolean).join(' · ')}\n\n`;
    }
    md += `## Steps\n\n`;
    let n = 1;
    if (gatherPath) md += `${n++}. See gathering times & what to expect: ${base}${gatherPath}\n`;
    if (connectPath) md += `${n++}. Say hello, ask a question, or request prayer: ${base}${connectPath}\n`;
    if (b.phone) md += `${n++}. Call or text ${b.phone}.\n`;
    md += `\n## Reference\n\n`;
    if (area) md += `- Area served: ${area}\n`;
    md += `- Machine-readable site index: ${base}/llms.txt\n`;
    skills.push({ name: 'plan-a-visit', description: `How to plan a first visit to ${b.name} — gathering times, location, and how to connect.`, md });
  }

  // Skill: business info (contact, hours, location, service area).
  {
    let md = `# ${b.name} — Business Information\n\n`;
    if (b.tagline) md += `> ${b.tagline}\n\n`;
    md += `## Contact\n\n`;
    if (b.phone) md += `- Phone: ${b.phone}\n`;
    if (b.email) md += `- Email: ${b.email}\n`;
    if (addr.street) md += `- Address: ${`${addr.street}, ${addr.city}, ${addr.state} ${addr.zip || ''}`.trim()}\n`;
    if (hoursLine) md += `- Hours: ${hoursLine}\n`;
    if (area) md += `- Service area: ${area}\n`;
    md += `\n## More\n\n`;
    md += `- Full machine-readable index of pages: ${base}/llms.txt\n`;
    md += `- Any page is available as Markdown via an \`Accept: text/markdown\` request header.\n`;
    skills.push({ name: 'business-info', description: `Contact details, hours, location, and service area for ${b.name}.`, md });
  }

  const files = [];
  const index = { $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json', skills: [] };
  for (const s of skills) {
    const rel = `.well-known/agent-skills/${s.name}/SKILL.md`;
    files.push({ rel, content: s.md });
    index.skills.push({
      name: s.name,
      type: 'skill-md',
      description: s.description,
      url: `${base}/${rel}`,
      digest: 'sha256:' + crypto.createHash('sha256').update(s.md).digest('hex'),
    });
  }
  files.push({ rel: '.well-known/agent-skills/index.json', content: JSON.stringify(index, null, 2) + '\n' });
  return files;
}

// ─── Agent-Native (Is It Agent Ready Level 5) ──────────────────────────
// Build the canonical agent-data object for a site — the single source of truth
// the shared agent-native worker reads at runtime AND from which the discovery
// docs are generated. Services/areas come from config.agent_native.services /
// .service_areas (no auto-derivation — define them explicitly per site).
// request_quote is enabled only when the site has a lead webhook. Returns
// null unless agent_native is enabled.
function buildAgentData(config, pages) {
  const an = config.agent_native;
  if (!an || !an.enabled) return null;
  const b = config.business || {};
  const addr = b.address || {};
  const hours = b.hours || {};
  const base = `https://${config.domain}`;

  const services = Array.isArray(an.services) ? an.services : [];
  const serviceAreas = Array.isArray(an.service_areas) ? an.service_areas : [];

  const weekday = hours.weekday_open ? `${hours.weekday_open} – ${hours.weekday_close}` : 'Closed';
  const dayHours = {
    monday: weekday, tuesday: weekday, wednesday: weekday, thursday: weekday, friday: weekday,
    saturday: hours.saturday_open ? `${hours.saturday_open} – ${hours.saturday_close}` : (hours.saturday || 'Closed'),
    sunday: hours.sunday || 'Closed',
  };
  const phoneDigits = String(b.phone_raw || b.phone || '').replace(/\D/g, '');
  const phoneE164 = phoneDigits.length === 10 ? '+1' + phoneDigits : (phoneDigits ? '+' + phoneDigits : '');
  const social = {};
  for (const [k, v] of Object.entries(config.social || {})) { if (v) social[k] = v; }

  // Resolve the lead webhook: explicit override, then the config's
  // integrations field, then custom_values fallback field(s).
  const cv = config.custom_values || {};
  const webhook = (an.quote && an.quote.webhook_url)
    || (config.integrations || {}).ghl_webhook_url
    || cv.webhook_url
    || cv.website_webhook_url
    || '';
  const quote = webhook ? {
    webhook_url: webhook,
    lead_source: (an.quote && an.quote.lead_source) || 'agent-mcp',
    scopes: ['mcp:read', 'mcp:quote'],
    rate_limit: (an.quote && an.quote.rate_limit) || { limit: 5, window_seconds: 60 },
  } : null;

  const reviews = config.reviews || {};
  return {
    site_id: config.site_id,
    generated_for: base,
    server: {
      name: an.id || config.site_id,
      version: an.version || '1.0.0',
      title: an.name || b.name || config.site_id,
      description: an.description || b.tagline || `${b.name || config.site_id} agent interface.`,
    },
    business: {
      name: b.name || '',
      short_name: an.short_name || (b.name || '').replace(/\s+(LLC|Inc\.?)$/i, '').trim() || b.name || '',
      tagline: b.tagline || '',
      description: an.description || b.tagline || '',
      phone: b.phone || '',
      phone_e164: phoneE164,
      email: b.email || '',
      website: base,
      address: addr,
      geo: b.geo || null,
      timezone: an.timezone || 'America/Chicago',
      metro_area: b.metro_area || '',
      rating: reviews.average_rating || null,
      review_count: reviews.total_reviews || null,
      hours: dayHours,
      social,
    },
    services,
    service_areas: serviceAreas,
    quote,
  };
}

// Agent-Native discovery documents (Is It Agent Ready Level 5). Emitted when
// config.agent_native.enabled. Advertises the REAL MCP server (the shared
// workers/mcp Worker on the `/mcp*` route) + companion discovery metadata, and
// the agent-data.json the Worker reads. Every endpoint referenced must be live
// before this ships. Returns { files: [{rel, content}], headers } or null.
function generateAgentNative(config, pages) {
  const data = buildAgentData(config, pages);
  if (!data) return null;
  const an = config.agent_native;
  const b = config.business || {};
  const base = data.generated_for;
  const mcp = an.mcp_endpoint || `${base}/mcp`;
  const health = `${mcp}/health`;
  const register = `${mcp}/register`;
  const slug = data.server.name;
  const name = data.server.title;
  const version = data.server.version;
  const desc = data.server.description;
  const hasQuote = !!data.quote;
  const scopes = hasQuote ? ['mcp:read', 'mcp:quote'] : ['mcp:read'];

  // request_quote is only advertised when the site has a lead webhook
  // (otherwise the MCP is read-only).
  const READ_TOOLS = [
    { id: 'get_business_info', name: 'Get business info', description: 'Contact, hours, address, rating, service area, and social links.', tags: ['info', 'contact'] },
    { id: 'get_services', name: 'Get services', description: 'Services offered; optional category filter.', tags: ['services'] },
    { id: 'get_hours', name: 'Get hours', description: 'Business hours and whether the location is open right now.', tags: ['hours'] },
    { id: 'list_service_areas', name: 'List service areas', description: 'Cities and counties served, with location-specific service pages.', tags: ['locations'] },
  ];
  const QUOTE_TOOL = { id: 'request_quote', name: 'Request a quote', description: 'Submit a free, no-obligation quote request (name + phone/email + service). Supports dryRun.', tags: ['quote', 'lead', 'booking'] };
  const tools = hasQuote ? [...READ_TOOLS, QUOTE_TOOL] : READ_TOOLS;

  const files = [];

  // 1) MCP Server Card — SEP-1649.
  files.push({ rel: '.well-known/mcp/server-card.json', content: JSON.stringify({
    serverInfo: { name: slug, version, title: name, description: desc },
    protocolVersion: '2025-06-18',
    transport: { type: 'streamable-http', endpoint: mcp },
    endpoint: mcp,
    capabilities: { tools: { listChanged: false } },
    tools: tools.map((t) => ({ name: t.id, description: t.description })),
    documentation: `${base}/auth.md`,
    wellKnown: {
      a2a: `${base}/.well-known/agent-card.json`,
      apiCatalog: `${base}/.well-known/api-catalog`,
      oauthProtectedResource: `${base}/.well-known/oauth-protected-resource`,
    },
  }, null, 2) + '\n' });

  // 2) A2A Agent Card.
  files.push({ rel: '.well-known/agent-card.json', content: JSON.stringify({
    protocolVersion: '0.3.0',
    name,
    version,
    description: desc,
    url: mcp,
    preferredTransport: 'JSONRPC',
    supportedInterfaces: [
      { url: mcp, transport: 'JSONRPC', description: 'Model Context Protocol over Streamable HTTP (JSON-RPC 2.0).' },
    ],
    additionalInterfaces: [{ url: mcp, transport: 'JSONRPC' }],
    provider: { organization: b.name || name, url: base },
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    defaultInputModes: ['application/json', 'text/plain'],
    defaultOutputModes: ['application/json', 'text/plain'],
    documentationUrl: `${base}/auth.md`,
    skills: tools.map((t) => ({ id: t.id, name: t.name, description: t.description, tags: t.tags })),
  }, null, 2) + '\n' });

  // 3) API Catalog — RFC 9727 linkset (served as application/linkset+json).
  files.push({ rel: '.well-known/api-catalog', content: JSON.stringify({
    linkset: [{
      anchor: mcp,
      'service-desc': [{ href: `${base}/openapi.json`, type: 'application/json' }],
      'service-doc': [{ href: `${base}/auth.md`, type: 'text/markdown' }],
      status: [{ href: health, type: 'application/json' }],
    }],
  }, null, 2) + '\n' });

  // 4) OpenAPI 3.1 description of the live HTTP surface.
  files.push({ rel: 'openapi.json', content: JSON.stringify({
    openapi: '3.1.0',
    info: { title: `${name} API`, version, description: `${desc}\n\nMCP server (JSON-RPC 2.0 over Streamable HTTP) plus health and anonymous-registration endpoints.`, contact: { name: b.name, email: b.email, url: base } },
    servers: [{ url: base }],
    paths: {
      '/mcp': {
        post: {
          summary: 'MCP JSON-RPC 2.0 endpoint (initialize, tools/list, tools/call, ping).',
          operationId: 'mcpRpc',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { jsonrpc: { type: 'string', const: '2.0' }, id: {}, method: { type: 'string' }, params: { type: 'object' } }, required: ['jsonrpc', 'method'] } } } },
          responses: { 200: { description: 'JSON-RPC response', content: { 'application/json': { schema: { type: 'object' } } } }, 202: { description: 'Accepted (notification, no response body)' } },
        },
      },
      '/mcp/health': {
        get: { summary: 'Health/status of the MCP server.', operationId: 'health', responses: { 200: { description: 'Server is healthy', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' }, server: { type: 'string' }, version: { type: 'string' } } } } } } } },
      },
      '/mcp/register': {
        get: { summary: 'Describe the optional anonymous agent credential.', operationId: 'registerInfo', responses: { 200: { description: 'Anonymous-tier description', content: { 'application/json': { schema: { type: 'object' } } } } } },
        post: { summary: 'Issue an optional anonymous bearer credential.', operationId: 'register', responses: { 200: { description: 'Anonymous credential', content: { 'application/json': { schema: { type: 'object', properties: { access_token: { type: 'string' }, token_type: { type: 'string' }, scope: { type: 'string' } } } } } } } },
      },
    },
  }, null, 2) + '\n' });

  // 5) auth.md — agent registration / access doc (H1 contains "auth.md").
  const TOOL_DOCS = {
    get_business_info: 'contact, hours, address, rating, service area.',
    get_services: 'services offered (optional `category` filter).',
    get_hours: 'hours and whether open right now.',
    list_service_areas: 'cities/counties served.',
    request_quote: 'submit a free quote request. Requires a real name, a phone or email, and the service(s) of interest. Supports `dryRun: true` to validate without submitting.',
  };
  const toolsMd = tools.map((t) => `- \`${t.id}\` — ${TOOL_DOCS[t.id] || t.description}`).join('\n');
  files.push({ rel: 'auth.md', content:
`# auth.md — ${b.name || name} Agent Access

${b.name || name} publishes a public Model Context Protocol (MCP) server for AI
agents. This document describes how agents access it and what it can do.

## Audience

AI agents acting for a person who wants information about, or a free quote from,
${b.name || name}${b.address && b.address.city ? ` (${b.tagline || 'auto services'} in ${b.address.city}, ${b.address.state})` : ''}.

## Authentication

**None required.** The MCP server is public and accepts anonymous requests.

- Resource (MCP endpoint): ${mcp} — Streamable HTTP, JSON-RPC 2.0
- Identity type: \`anonymous\`
- An optional anonymous credential may be claimed at the registration endpoint
  below. It is an identity for attribution only — it is **not** a security
  control and is not required to call any tool.

## Registration (optional)

- Registration / claim endpoint: ${register}
- Method: HTTP \`POST\` (no body required)
- Returns a bearer credential (\`access_token\`) you MAY send as
  \`Authorization: Bearer <token>\` on MCP requests.

## Discovery documents

- OAuth Protected Resource Metadata: ${base}/.well-known/oauth-protected-resource
- OAuth Authorization Server Metadata: ${base}/.well-known/oauth-authorization-server
- MCP Server Card (SEP-1649): ${base}/.well-known/mcp/server-card.json
- A2A Agent Card: ${base}/.well-known/agent-card.json
- API Catalog (RFC 9727): ${base}/.well-known/api-catalog
- OpenAPI: ${base}/openapi.json

## Tools

${toolsMd}

## Acceptable use & rate limits

- Requests are rate-limited per IP address.
${hasQuote ? '- `request_quote` creates a real sales lead — submit only genuine requests on\n  behalf of a real person, and test with `dryRun: true`.\n' : ''}${b.phone ? `- For urgent needs, call or text ${b.phone}.\n` : ''}` });

  // 6) OAuth Protected Resource Metadata — RFC 9728.
  files.push({ rel: '.well-known/oauth-protected-resource', content: JSON.stringify({
    resource: mcp,
    authorization_servers: [base],
    scopes_supported: scopes,
    bearer_methods_supported: ['header'],
    resource_documentation: `${base}/auth.md`,
  }, null, 2) + '\n' });

  // 7) OAuth Authorization Server Metadata — RFC 8414 + agent_auth (anonymous).
  files.push({ rel: '.well-known/oauth-authorization-server', content: JSON.stringify({
    issuer: base,
    registration_endpoint: register,
    scopes_supported: scopes,
    response_types_supported: ['none'],
    grant_types_supported: [],
    token_endpoint_auth_methods_supported: ['none'],
    service_documentation: `${base}/auth.md`,
    agent_auth: {
      skill: `${base}/auth.md`,
      register_uri: register,
      identity_endpoint: register,
      claim_uri: register,
      claim_endpoint: register,
      identity_types_supported: ['anonymous'],
      anonymous: {
        credential_types_supported: ['bearer'],
        claim_uri: register,
      },
    },
  }, null, 2) + '\n' });

  // 8) agent-data.json — single source of truth the shared MCP Worker reads.
  files.push({ rel: '.well-known/agent/data.json', content: JSON.stringify(data, null, 2) + '\n' });

  // Pages _headers: set correct Content-Type for extensionless docs + CORS.
  const headers = [
    '/.well-known/agent/data.json',
    '  Access-Control-Allow-Origin: *',
    '',
    '/auth.md',
    '  Content-Type: text/markdown; charset=utf-8',
    '  Access-Control-Allow-Origin: *',
    '',
    '/openapi.json',
    '  Access-Control-Allow-Origin: *',
    '',
    '/.well-known/api-catalog',
    '  Content-Type: application/linkset+json; charset=utf-8',
    '  Access-Control-Allow-Origin: *',
    '',
    '/.well-known/oauth-protected-resource',
    '  Content-Type: application/json; charset=utf-8',
    '  Access-Control-Allow-Origin: *',
    '',
    '/.well-known/oauth-authorization-server',
    '  Content-Type: application/json; charset=utf-8',
    '  Access-Control-Allow-Origin: *',
    '',
    '/.well-known/mcp/server-card.json',
    '  Access-Control-Allow-Origin: *',
    '',
    '/.well-known/agent-card.json',
    '  Access-Control-Allow-Origin: *',
    '',
  ].join('\n');

  return { files, headers };
}


// ─── Generate CSS Variables ────────────────────────────────────────────
function generateVariablesCSS(config) {
  const b = config.branding;
  return `:root {
  --black: ${b.black};
  --charcoal: ${b.charcoal};
  --dark: ${b.dark};
  --card: ${b.card};
  --card2: ${b.card2};
  --border: ${b.border};
  --border-hover: ${b.border_hover};
  --accent: ${b.accent};
  --accent-dim: ${b.accent_dim};
  --accent-glow: ${b.accent_glow};
  --gold: ${b.gold};
  --orange: ${b.orange};
  --white: ${b.white};
  --muted: ${b.muted};
  --muted2: ${b.muted2};
  --font-heading: ${b.font_heading};
  --font-body: ${b.font_body};
  --font-accent: ${b.font_accent};
  --font-mono: ${b.font_mono};
}
`;
}

// ─── Blog Builder ─────────────────────────────────────────────────────
// Posts are authored as Markdown files with a YAML frontmatter block in
// content/blog/*.md. The frontmatter supplies metadata (title, slug, date,
// excerpt, category…) and everything after the closing `---` is the post
// body, rendered from Markdown to HTML via `marked`.
const BLOG_CONTENT_DIR = path.join(ROOT, 'content', 'blog');
const POSTS_PER_PAGE = 30;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Plain-text excerpt from rendered HTML, trimmed to a word boundary.
function excerptFromHtml(html, maxLen = 160) {
  const text = decodeHtmlEntities(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, text.lastIndexOf(' ', maxLen)).trim() + '…';
}

// Build date used to decide which posts are "live" yet. Defaults to the
// real current date; override with BUILD_DATE=YYYY-MM-DD for testing a
// future date without editing post frontmatter or waiting for the day to
// arrive. Compared at UTC day granularity so a post goes live the moment
// its published_at date arrives, regardless of server timezone/time-of-day.
function getBuildDateUTC() {
  const raw = process.env.BUILD_DATE ? new Date(process.env.BUILD_DATE) : new Date();
  return Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate());
}

function loadBlogPosts(config) {
  // Support per-site blog content directory via config.blog_content_dir
  const blogDir = config && config.blog_content_dir
    ? path.join(ROOT, config.blog_content_dir)
    : BLOG_CONTENT_DIR;

  if (!fs.existsSync(blogDir)) return [];

  const files = fs.readdirSync(blogDir)
    .filter(f => f.endsWith('.md') && !f.startsWith('_'));

  const buildDateUTC = getBuildDateUTC();
  const posts = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(blogDir, file), 'utf8');
      const match = raw.match(FRONTMATTER_RE);
      if (!match) {
        console.log(`  WARN: blog/${file} has no YAML frontmatter, skipping`);
        continue;
      }
      const data = yaml.parse(match[1]) || {};
      const bodyMd = match[2] || '';

      data.slug = data.slug || slugify(file.replace(/\.md$/, ''));

      // draft: true fully excludes a post from the build — no page, no
      // index/sitemap/llms.txt entry — regardless of published_at. Use this
      // to hold a scheduled post without losing its intended date; a fake
      // future date would also hide it, but draft is unambiguous about why.
      if (data.draft) {
        console.log(`  BLOG: blog/${file} is a draft — excluding`);
        continue;
      }

      const d = new Date(data.published_at);
      const postDateUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      if (data.published_at && postDateUTC > buildDateUTC) {
        console.log(`  BLOG: blog/${file} is scheduled for ${data.published_at} — not live yet, excluding`);
        continue;
      }

      data.content = marked.parse(bodyMd.trim());
      data.excerpt = data.excerpt || excerptFromHtml(data.content);
      data.meta_description = data.meta_description || data.excerpt;
      data.published_date_display = d.toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
      });
      data._noindex = !!data.noindex;
      posts.push(data);
    } catch (e) {
      console.log(`  WARN: Could not parse blog/${file}: ${e.message}`);
    }
  }

  // Sort newest first
  posts.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  return posts;
}

// Categories are derived from whatever `category` field posts declare —
// no separate taxonomy file to keep in sync.
function loadBlogCategories(posts) {
  const categories = {};
  for (const post of posts) {
    if (!post.category) continue;
    if (!categories[post.category]) {
      categories[post.category] = { slug: slugify(post.category), count: 0 };
    }
    categories[post.category].count++;
  }
  return categories;
}

async function buildBlogPages(config, templatesDir, outputDir, context, baseLayout) {
  const posts = loadBlogPosts(config);
  if (posts.length === 0) {
    const blogDir = config.blog_content_dir || 'content/blog';
    console.log(`  BLOG: No blog posts found in ${blogDir}/, skipping`);
    return [];
  }

  console.log(`\n  BLOG: Building ${posts.length} blog posts...`);

  const categories = loadBlogCategories(posts);
  const catList = Object.entries(categories).map(([name, info]) => ({
    name, slug: info.slug, count: info.count
  })).sort((a, b) => b.count - a.count);

  // Load blog templates
  const postTemplateSrc = loadTemplate(templatesDir, 'pages/blog-post.html');
  const indexTemplateSrc = loadTemplate(templatesDir, 'pages/blog-index.html');

  if (!postTemplateSrc || !indexTemplateSrc) {
    console.log('  BLOG: Missing blog templates, skipping');
    return [];
  }

  const postTemplate = Handlebars.compile(postTemplateSrc);
  const indexTemplate = Handlebars.compile(indexTemplateSrc);

  let built = 0;

  // ── Build individual post pages ──
  for (const post of posts) {
    const postContext = {
      ...context,
      blog: post,
      page: {
        title: post.title,
        meta_description: post.meta_description,
        path: `/blog/${post.slug}/`,
        og_image: post.image_url || config.seo.default_og_image,
        noindex: post._noindex || false,
        content: '' // Will be set below
      }
    };

    // Render post template
    postContext.page.content = postTemplate(postContext);

    const rawHtml = baseLayout(postContext);
    let html;
    try {
      html = await htmlMinify(rawHtml, {
        collapseWhitespace: true,
        removeComments: true,
        minifyCSS: true,
        minifyJS: true,
        removeRedundantAttributes: true,
        removeEmptyAttributes: true,
        conservativeCollapse: true
      });
    } catch (e) {
      html = rawHtml;
    }

    const outPath = path.join(outputDir, 'blog', post.slug, 'index.html');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);
    built++;
  }

  const noindexCount = posts.filter(p => p._noindex).length;
  console.log(`  BLOG: ${built} post pages built (${noindexCount} noindexed, ${built - noindexCount} in sitemap)`);

  // ── Build paginated index pages ──
  const totalPages = Math.ceil(posts.length / POSTS_PER_PAGE);

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const startIdx = (pageNum - 1) * POSTS_PER_PAGE;
    const pagePosts = posts.slice(startIdx, startIdx + POSTS_PER_PAGE);

    const indexContext = {
      ...context,
      blog_index: {
        posts: pagePosts,
        is_all: true,
        categories: catList.map(c => ({ ...c, active: false })),
        current_page: pageNum,
        total_pages: totalPages,
        has_pagination: totalPages > 1,
        prev_page: pageNum > 1 ? (pageNum === 2 ? '/blog/' : `/blog/page/${pageNum - 1}/`) : null,
        next_page: pageNum < totalPages ? `/blog/page/${pageNum + 1}/` : null,
      },
      page: {
        title: pageNum === 1
          ? `Blog${config.seo.title_suffix}`
          : `Blog — Page ${pageNum}${config.seo.title_suffix}`,
        meta_description: `Stories, reflections, and updates from ${config.business.name} as we follow Jesus, become like Him, and do what He did in Dothan.`,
        path: pageNum === 1 ? '/blog/' : `/blog/page/${pageNum}/`,
        og_image: config.seo.default_og_image,
        content: ''
      }
    };

    indexContext.page.content = indexTemplate(indexContext);

    const rawHtml = baseLayout(indexContext);
    let html;
    try {
      html = await htmlMinify(rawHtml, {
        collapseWhitespace: true, removeComments: true, minifyCSS: true,
        minifyJS: true, removeRedundantAttributes: true, removeEmptyAttributes: true,
        conservativeCollapse: true
      });
    } catch (e) {
      html = rawHtml;
    }

    const outPath = pageNum === 1
      ? path.join(outputDir, 'blog', 'index.html')
      : path.join(outputDir, 'blog', 'page', String(pageNum), 'index.html');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);
  }

  console.log(`  BLOG: ${totalPages} index page(s) built`);

  // ── Build category pages ──
  let catPagesBuilt = 0;
  for (const cat of catList) {
    const catPosts = posts.filter(p => p.category === cat.name);
    const catTotalPages = Math.ceil(catPosts.length / POSTS_PER_PAGE);

    for (let pageNum = 1; pageNum <= catTotalPages; pageNum++) {
      const startIdx = (pageNum - 1) * POSTS_PER_PAGE;
      const pagePosts = catPosts.slice(startIdx, startIdx + POSTS_PER_PAGE);

      const catContext = {
        ...context,
        blog_index: {
          posts: pagePosts,
          is_all: false,
          categories: catList.map(c => ({ ...c, active: c.name === cat.name })),
          current_page: pageNum,
          total_pages: catTotalPages,
          has_pagination: catTotalPages > 1,
          prev_page: pageNum > 1 ? (pageNum === 2 ? `/blog/category/${cat.slug}/` : `/blog/category/${cat.slug}/page/${pageNum - 1}/`) : null,
          next_page: pageNum < catTotalPages ? `/blog/category/${cat.slug}/page/${pageNum + 1}/` : null,
        },
        page: {
          title: `${cat.name} Articles${config.seo.title_suffix}`,
          meta_description: `${cat.name} posts from ${config.business.name} in ${config.business.address.city}, ${config.business.address.state}.`,
          path: pageNum === 1 ? `/blog/category/${cat.slug}/` : `/blog/category/${cat.slug}/page/${pageNum}/`,
          og_image: config.seo.default_og_image,
          content: ''
        }
      };

      catContext.page.content = indexTemplate(catContext);

      const rawHtml = baseLayout(catContext);
      let html;
      try {
        html = await htmlMinify(rawHtml, {
          collapseWhitespace: true, removeComments: true, minifyCSS: true,
          minifyJS: true, removeRedundantAttributes: true, removeEmptyAttributes: true,
          conservativeCollapse: true
        });
      } catch (e) {
        html = rawHtml;
      }

      const outPath = pageNum === 1
        ? path.join(outputDir, 'blog', 'category', cat.slug, 'index.html')
        : path.join(outputDir, 'blog', 'category', cat.slug, 'page', String(pageNum), 'index.html');
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, html);
      catPagesBuilt++;
    }
  }

  console.log(`  BLOG: ${catPagesBuilt} category page(s) built`);

  // Add Article schema JSON-LD to each post page would go here
  // (already in the template via structured data)

  return posts;
}

// ─── Build ─────────────────────────────────────────────────────────────
async function buildSite(siteId) {
  console.log(`\n  Building: ${siteId}`);
  console.log('  ' + '─'.repeat(50));

  const config = loadConfig(siteId);

  // Staging: strip production TRACKING IDs so no real analytics/conversions
  // fire from test traffic. Webhook URLs are KEPT so form submissions can be
  // E2E-tested on staging — staged leads are distinguishable in GHL because
  // source_url contains the Cloudflare preview domain (e.g. "staging-...").
  if (process.env.DEPLOY_ENV === 'staging') {
    console.log('  [STAGING] Stripping tracking IDs (webhooks kept for E2E form testing)');
    if (config.integrations) {
      const TRACKING_KEYS = [
        'google_ads_conversion_id',
        'google_ads_conversion_label',
        'google_ads_send_to',
        'google_ads_phone_conversion_label',
        'google_analytics_id',
        'google_tag_manager_id',
        'google_tag_manager_id_ga',
        'facebook_pixel_id',
        'ghl_external_tracking_id',
      ];
      for (const key of TRACKING_KEYS) {
        if (config.integrations[key] !== undefined) {
          config.integrations[key] = '';
        }
      }
    }
    config._isStaging = true;
  }

  const theme = config.theme || 'default';
  const templatesDir = getTemplatesDir(theme);
  const assetsDir = getAssetsDir(theme);
  const outputDir = path.join(DIST_DIR, siteId);

  console.log(`  Theme: ${theme}`);

  // Clean and create output directory
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  // Register partials for this theme
  registerPartials(templatesDir);

  // Build template context
  const context = {
    ...config,
    location: {
      name: config.business.name,
      phone: config.business.phone,
      phone_raw: config.business.phone_raw,
      city: config.business.address.city,
      state: config.business.address.state,
      address: config.business.address.street,
      full_url: `https://${config.domain}`,
      email: config.business.email,
      timezone: 'US/Central'
    }
  };

  // Generate CSS variables file (used by default + op-select themes)
  if (config.branding && config.branding.black) {
    const cssDir2 = path.join(outputDir, 'css');
    fs.mkdirSync(cssDir2, { recursive: true });
    fs.writeFileSync(path.join(cssDir2, 'variables.css'), generateVariablesCSS(config));
  }

  // Copy + minify CSS files
  const cssDir = path.join(outputDir, 'css');
  fs.mkdirSync(cssDir, { recursive: true });
  const srcCssDir = path.join(assetsDir, 'css');
  const cssMinifier = new CleanCSS({ level: 2 });
  let inlineCriticalCSS = ''; // Will be inlined in <head> by base.html
  if (fs.existsSync(srcCssDir)) {
    for (const file of fs.readdirSync(srcCssDir)) {
      if (file.endsWith('.css')) {
        let content = fs.readFileSync(path.join(srcCssDir, file), 'utf8');
        if (content.includes('{{')) {
          content = Handlebars.compile(content)(context);
        }
        const minified = cssMinifier.minify(content);

        // critical.css gets inlined in <head>, not written as a file
        if (file === 'critical.css') {
          inlineCriticalCSS = minified.styles;
          console.log(`  CSS: ${file} → inlined (${(Buffer.byteLength(minified.styles) / 1024).toFixed(1)} KB)`);
          continue;
        }

        fs.writeFileSync(path.join(cssDir, file), minified.styles);
        const saved = Buffer.byteLength(content) - Buffer.byteLength(minified.styles);
        console.log(`  CSS: ${file} (${(Buffer.byteLength(minified.styles) / 1024).toFixed(0)} KB, saved ${(saved / 1024).toFixed(0)} KB)`);
      }
    }
  }
  // Make critical CSS available to templates
  context.critical_css = inlineCriticalCSS;

  // Copy + minify JS files (process with Handlebars for config injection)
  const jsDir = path.join(outputDir, 'js');
  fs.mkdirSync(jsDir, { recursive: true });
  const srcJsDir = path.join(assetsDir, 'js');
  if (fs.existsSync(srcJsDir)) {
    for (const file of fs.readdirSync(srcJsDir)) {
      if (file.endsWith('.js')) {
        let content = fs.readFileSync(path.join(srcJsDir, file), 'utf8');
        if (content.includes('{{')) {
          content = Handlebars.compile(content)(context);
        }
        const result = await terserMinify(content, { compress: true, mangle: true });
        fs.writeFileSync(path.join(jsDir, file), result.code);
        const saved = Buffer.byteLength(content) - Buffer.byteLength(result.code);
        console.log(`  JS:  ${file} (${(Buffer.byteLength(result.code) / 1024).toFixed(0)} KB, saved ${(saved / 1024).toFixed(0)} KB)`);
      }
    }
  }

  // Optimize + convert images to WebP
  // Source order: theme images first (assets/<theme>/images), then per-site
  // overrides (assets/sites/<site_id>/images). The per-site dir is processed
  // second, so a same-named file OVERRIDES the theme's output and a new file
  // EXTENDS it — this is how two clients can share a theme without sharing
  // photos. No per-site dir = exactly the old single-dir behavior.
  const imgDir = path.join(outputDir, 'images');
  fs.mkdirSync(imgDir, { recursive: true });
  const themeImgDir = path.join(assetsDir, 'images');
  const siteImgDir = path.join(ROOT, 'assets', 'sites', siteId, 'images');
  const imgSourceDirs = [themeImgDir, siteImgDir].filter(d => fs.existsSync(d));
  if (imgSourceDirs.includes(siteImgDir)) {
    console.log(`  IMG: per-site overrides found (assets/sites/${siteId}/images)`);
  }
  for (const srcImgDir of imgSourceDirs) {
    const imageFiles = fs.readdirSync(srcImgDir).filter(f => {
      const filePath = path.join(srcImgDir, f);
      return fs.statSync(filePath).isFile();
    });

    for (const file of imageFiles) {
      const filePath = path.join(srcImgDir, file);
      const ext = path.extname(file).toLowerCase();
      const baseName = path.basename(file, ext);

      if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        // Convert to WebP with quality optimization
        const originalSize = fs.statSync(filePath).size;
        const webpPath = path.join(imgDir, `${baseName}.webp`);

        // Tiered quality based on image type and source size
        // Hero backgrounds (under dark overlays) get aggressive compression + slight blur
        // >3MB non-hero = showcase images → q65, resize 1600
        // >1MB = section images → q72, resize 1920
        // <1MB = smaller assets → q85, no resize
        const isHeroBg = baseName.toLowerCase().includes('hero');
        let quality, maxWidth, applyBlur;
        if (isHeroBg && originalSize > 2_000_000) {
          // Hero backgrounds rendered under dark overlays — imperceptible quality loss
          quality = 50;
          maxWidth = 1400;
          applyBlur = 0.8;
        } else if (originalSize > 3_000_000) {
          quality = 65;
          maxWidth = 1600;
        } else if (originalSize > 1_000_000) {
          quality = 72;
          maxWidth = 1920;
        } else {
          quality = 85;
          maxWidth = undefined;
        }

        let pipeline = sharp(filePath);
        if (maxWidth) {
          pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
        }
        if (applyBlur) {
          pipeline = pipeline.blur(applyBlur);
        }
        await pipeline.webp({ quality, effort: 6 }).toFile(webpPath);

        // Auto-generate mobile hero variants at 768px for all hero images
        if (isHeroBg) {
          const mobilePath = path.join(imgDir, `${baseName}-mobile.webp`);
          if (!fs.existsSync(path.join(srcImgDir, `${baseName}-mobile.webp`))) {
            await sharp(filePath)
              .resize({ width: 768, withoutEnlargement: true })
              .blur(0.5)
              .webp({ quality: 55, effort: 6 })
              .toFile(mobilePath);
            const mobileSize = fs.statSync(mobilePath).size;
            console.log(`  IMG: ${baseName}-mobile.webp (auto-generated, ${(mobileSize / 1024).toFixed(0)} KB)`);
          }
        }

        const newSize = fs.statSync(webpPath).size;
        const pctSaved = ((1 - newSize / originalSize) * 100).toFixed(0);
        console.log(`  IMG: ${file} → ${baseName}.webp (${(newSize / 1024).toFixed(0)} KB, saved ${pctSaved}%)`);

        // Original JPG/PNG omitted from dist — WebP serves all content
      } else {
        // Non-image files (svg, etc.) — copy as-is
        fs.copyFileSync(filePath, path.join(imgDir, file));
      }
    }

    // Process image subdirectories (gallery/, etc.) — resize + convert to WebP
    const subDirs = fs.readdirSync(srcImgDir).filter(f => {
      return fs.statSync(path.join(srcImgDir, f)).isDirectory() && !f.startsWith('drive-download');
    });
    for (const subDir of subDirs) {
      const srcSub = path.join(srcImgDir, subDir);
      const outSub = path.join(imgDir, subDir);
      fs.mkdirSync(outSub, { recursive: true });
      const subFiles = fs.readdirSync(srcSub).filter(f => fs.statSync(path.join(srcSub, f)).isFile());
      let subTotal = 0, subSaved = 0;
      for (const file of subFiles) {
        const filePath = path.join(srcSub, file);
        const ext = path.extname(file).toLowerCase();
        const baseName = path.basename(file, ext);
        if (['.jpg', '.jpeg', '.png'].includes(ext)) {
          const originalSize = fs.statSync(filePath).size;
          const webpPath = path.join(outSub, `${baseName}.webp`);
          // Gallery images render at max 420×300 — 800px width is 2x sufficient
          await sharp(filePath)
            .resize({ width: 800, withoutEnlargement: true })
            .webp({ quality: 82 })
            .toFile(webpPath);
          subTotal++;
          subSaved += originalSize - fs.statSync(webpPath).size;
        } else {
          fs.copyFileSync(filePath, path.join(outSub, file));
        }
      }
      if (subTotal > 0) {
        console.log(`  IMG: ${subDir}/ → ${subTotal} images to WebP (saved ${(subSaved / 1024 / 1024).toFixed(1)} MB)`);
      }
    }
  }

  // Get page definitions
  const pages = getPages(config);

  // Load base layout
  const baseLayoutSrc = loadTemplate(templatesDir, 'layouts/base.html');
  if (!baseLayoutSrc) {
    console.error('  ERROR: Base layout template not found!');
    return;
  }
  const baseLayout = Handlebars.compile(baseLayoutSrc);

  // Cache for alternate layouts (e.g., lp-base for landing pages)
  const layoutCache = { 'base': baseLayout };
  function getLayout(layoutName) {
    if (!layoutName) return baseLayout;
    if (layoutCache[layoutName]) return layoutCache[layoutName];
    const src = loadTemplate(templatesDir, `layouts/${layoutName}.html`);
    if (!src) {
      console.log(`  WARN: Layout ${layoutName}.html not found, falling back to base`);
      return baseLayout;
    }
    layoutCache[layoutName] = Handlebars.compile(src);
    return layoutCache[layoutName];
  }

  // Build each page
  let pagesBuilt = 0;
  for (const page of pages) {
    const pageSrc = loadTemplate(templatesDir, page.template);
    if (!pageSrc) {
      console.log(`  SKIP: ${page.template} (not found)`);
      continue;
    }

    const pageCompiled = Handlebars.compile(pageSrc);
    const pageContent = pageCompiled(context);

    const pageContext = {
      ...context,
      page: {
        ...page,
        og_image: config.seo.default_og_image,
        content: pageContent
      }
    };

    const layout = getLayout(page.layout);
    const rawHtml = layout(pageContext);

    // Minify HTML (fall back to raw if minifier chokes on complex markup)
    let html;
    try {
      html = await htmlMinify(rawHtml, {
        collapseWhitespace: true,
        removeComments: true,
        minifyCSS: true,
        minifyJS: true,
        removeRedundantAttributes: true,
        removeEmptyAttributes: true,
        conservativeCollapse: true
      });
    } catch (e) {
      console.log(`  WARN: HTML minify failed for ${page.output}, using unminified`);
      html = rawHtml;
    }

    // Ensure output directory exists
    const outPath = path.join(outputDir, page.output);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);

    // Markdown companion for agents (served via Accept: text/markdown).
    // Derived from the unminified HTML for cleaner structure.
    const mdPath = outPath.replace(/\.html$/, '.md');
    fs.writeFileSync(mdPath, pageMarkdown(page, rawHtml, config));

    pagesBuilt++;
    console.log(`  OK: ${page.output}`);
  }

  // ─── Generate 404.html ─────────────────────────────────────────────────
  // Cloudflare Pages serves this automatically for any URL that doesn't
  // match a file in the output directory — returning HTTP 404 instead of
  // falling back to index.html (which would produce a soft-404 / duplicate).
  await build404Page(templatesDir, baseLayout, context, config, outputDir);

  // ── Build blog posts ──
  const blogPosts = await buildBlogPages(config, templatesDir, outputDir, context, baseLayout);

  // Generate sitemap.xml (includes blog posts)
  const sitemap = generateSitemap(config, pages, blogPosts);
  fs.writeFileSync(path.join(outputDir, 'sitemap.xml'), sitemap);
  console.log('  OK: sitemap.xml');

  // Generate robots.txt
  const robots = generateRobots(config);
  fs.writeFileSync(path.join(outputDir, 'robots.txt'), robots);
  console.log('  OK: robots.txt');

  // Generate llms.txt (machine-readable site index for LLMs / agents)
  fs.writeFileSync(path.join(outputDir, 'llms.txt'), generateLlmsTxt(config, pages, blogPosts));
  console.log('  OK: llms.txt');

  // Generate Agent Skills discovery index (/.well-known/agent-skills/)
  {
    const skillFiles = generateAgentSkills(config, pages);
    for (const f of skillFiles) {
      const fp = path.join(outputDir, f.rel);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, f.content);
    }
    console.log(`  OK: .well-known/agent-skills/ (index.json + ${skillFiles.length - 1} SKILL.md)`);
  }

  // Generate Agent-Native discovery docs (MCP Server Card, A2A Agent Card,
  // API Catalog, OpenAPI, auth.md, OAuth metadata) when the config opts in.
  {
    const agentNative = generateAgentNative(config, pages);
    if (agentNative) {
      for (const f of agentNative.files) {
        const fp = path.join(outputDir, f.rel);
        fs.mkdirSync(path.dirname(fp), { recursive: true });
        fs.writeFileSync(fp, f.content);
      }
      fs.writeFileSync(path.join(outputDir, '_headers'), agentNative.headers);
      console.log(`  OK: agent-native discovery (${agentNative.files.length} docs + _headers) → MCP ${config.agent_native.mcp_endpoint || ''}`);
    }
  }
  // NOTE: Markdown content negotiation is served by the repo-root
  // functions/_middleware.js Pages Function (shared across all sites), which
  // reads the per-page .md companions emitted into this dist above.

  // Generate _redirects file (Cloudflare Pages native redirects)
  {
    const lines = [];

    // Config-based redirects
    if (config.redirects) {
      for (const [from, to] of Object.entries(config.redirects)) {
        lines.push(`${from} ${to} 301`);
      }
    }

    if (lines.length > 0) {
      fs.writeFileSync(path.join(outputDir, '_redirects'), lines.join('\n') + '\n');
      console.log(`  OK: _redirects (${lines.length} rules)`);
    }
  }

  // ─── Post-Build Validation ────────────────────────────────────────────
  const errors = [];
  const warnings = [];

  for (const page of pages) {
    const outPath = path.join(outputDir, page.output);
    if (!fs.existsSync(outPath)) continue;
    const html = fs.readFileSync(outPath, 'utf8');

    // Bare-layout pages ship their own self-contained HTML (inline CSS/JS),
    // so the CSS/JS reference checks below don't apply.
    const isBare = page.layout === 'bare';

    // 1. Every page must link to at least one CSS file that exists
    const cssRefs = [...html.matchAll(/href="\/css\/([^"?]+)/g)].map(m => m[1]);
    if (cssRefs.length === 0 && !isBare) {
      errors.push(`${page.output}: No CSS file linked`);
    } else {
      for (const ref of cssRefs) {
        const cssPath = path.join(outputDir, 'css', ref);
        if (!fs.existsSync(cssPath)) {
          errors.push(`${page.output}: Links to /css/${ref} but file does not exist`);
        } else {
          const size = fs.statSync(cssPath).size;
          if (size < 2048) {
            warnings.push(`${page.output}: /css/${ref} is only ${size} bytes — may be incomplete`);
          }
        }
      }
    }

    // 2. Every page must link to at least one JS file that exists
    const jsRefs = [...html.matchAll(/src="\/js\/([^"?]+)/g)].map(m => m[1]);
    for (const ref of jsRefs) {
      const jsPath = path.join(outputDir, 'js', ref);
      if (!fs.existsSync(jsPath)) {
        errors.push(`${page.output}: Links to /js/${ref} but file does not exist`);
      }
    }

    // 3. Check for unresolved Handlebars variables ({{something}})
    const unresolved = html.match(/\{\{[^}]+\}\}/g);
    if (unresolved) {
      const unique = [...new Set(unresolved)].slice(0, 5);
      errors.push(`${page.output}: ${unresolved.length} unresolved template variable(s): ${unique.join(', ')}`);
    }
  }

  // Report results
  if (warnings.length > 0) {
    console.log('\n  ⚠ Warnings:');
    for (const w of warnings) console.log(`    ${w}`);
  }

  if (errors.length > 0) {
    console.log('\n  ✗ BUILD VALIDATION FAILED:');
    for (const e of errors) console.log(`    ${e}`);
    console.log(`\n  ${errors.length} error(s) found. Fix before deploying.\n`);
    process.exit(1);
  }

  console.log(`  ✓ Validation passed (${pagesBuilt} pages, 0 errors)`);
  console.log(`\n  Done! ${pagesBuilt} pages built to dist/${siteId}/\n`);
}

// ─── CLI Entry Point ───────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: node build.js <site-id> | --all');
  process.exit(1);
}

function checkDomainCollisions() {
  const byDomain = {};
  for (const f of fs.readdirSync(CONFIGS_DIR)) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue;
    const cfg = JSON.parse(fs.readFileSync(path.join(CONFIGS_DIR, f), 'utf8'));
    if (!cfg.domain) continue;
    (byDomain[cfg.domain] = byDomain[cfg.domain] || []).push(f.replace('.json', ''));
  }
  const collisions = Object.entries(byDomain).filter(([, ids]) => ids.length > 1);
  if (collisions.length === 0) return;
  console.log('\n  ⚠️  DOMAIN COLLISION WARNING');
  console.log('  Multiple non-template configs claim the same domain. Only one can be');
  console.log('  attached to the live Cloudflare Pages custom domain — edits to the other');
  console.log('  will deploy successfully but never reach production. Prefix one with `_`');
  console.log('  to mark it as a template, or consolidate.');
  for (const [domain, ids] of collisions) {
    console.log(`    ${domain}: ${ids.join(', ')}`);
  }
  console.log('');
}

(async () => {
  checkDomainCollisions();

  if (args[0] === '--all') {
    const configs = fs.readdirSync(CONFIGS_DIR)
      .filter(f => f.endsWith('.json') && !f.startsWith('_'))
      .map(f => f.replace('.json', ''));

    console.log(`\nBuilding ${configs.length} site(s)...`);
    for (const id of configs) {
      await buildSite(id);
    }
  } else {
    await buildSite(args[0]);
  }
})();
