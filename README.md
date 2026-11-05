# pathakanshu.com

Static portfolio and writing. The homepage is `index.html`; the SWS205 post is
`college/sws205-final-blog-post/index.html`. No framework or dependencies are required.

## Sitemap and crawler rules

Edit `site.config.json`:

- `sitemap.exclude`: URL path prefixes to omit from the sitemap.
- `robots.disallow`: URL path prefixes to block for all compliant crawlers and agents.
  These paths are also automatically omitted from the sitemap.
- `siteUrl`: the canonical site origin.

Use paths beginning with `/`, without wildcards, query strings, or fragments. Rules
are prefix matches: `/private` covers `/private`, `/private/`, `/private/index.html`,
and everything beneath it (as well as names like `/private-notes`). Choose a unique
prefix when excluding a single page. Trailing slashes are normalized away to cover
both directory URL forms. A `/` rule excludes the entire site.

After adding pages or changing rules, run with Node.js 24:

```sh
node scripts/generate-site-metadata.mjs
node scripts/generate-site-metadata.mjs --check
```

The generator discovers HTML pages recursively, maps `index.html` files to their
directory URLs, and writes deterministic `sitemap.xml` and `robots.txt` files.
Hidden and development directories, error pages, and pages with a robots,
Googlebot, or Bingbot `noindex`/`none` meta directive are not included. No fabricated
modification dates are emitted. Keep the generated files checked in for branch-based
static hosting; `--check` exits unsuccessfully if either file needs regeneration.

The SWS205 post is excluded in both lists and also has a `noindex` meta tag. No link
to it is added to the homepage. Robots rules are voluntary, not authentication:
noncompliant bots can still fetch a public URL. Crawlers blocked by robots.txt cannot
read its meta tag, so this is not a guarantee that a previously discovered URL will
never appear in search results. Use access-controlled hosting for private content.

## Deployment

Deployment uses the existing Cloudflare Pages Git integration, not GitHub Pages or
GitHub Actions. Pushes to the connected production branch (`main`) trigger deployment.

In the Cloudflare Pages project's build settings, use:

- Framework preset: **None**.
- Build command: `node scripts/generate-site-metadata.mjs`.
- Build output directory: `.` (the repository root).
- Root directory: leave blank (the repository root).

The build command regenerates the sitemap and crawler rules before each deployment,
so new pages and exclusion changes are picked up automatically on Git push. No
dependencies need to be installed. Keep the custom domain set to `pathakanshu.com`.

The generated metadata files are also checked in, so an existing no-build deployment
will serve them on the next push. Set the build command above once to ensure future
metadata is regenerated automatically rather than relying on manual generation.
No changes to live Cloudflare project settings are made by this checkout.
