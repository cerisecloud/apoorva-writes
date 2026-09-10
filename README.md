# apoorva-writes

Apoorva Pothula's blog and portfolio, live at
[apoorva-writes.pages.dev](https://apoorva-writes.pages.dev).

Astro, no client framework, dark theme only, hosted free on Cloudflare Pages.
Pushing to `main` deploys in about 90 seconds.

## Running it

Node 22 or newer is required. `.node-version` pins it, and **deleting that file
will break the Cloudflare build**, because Pages reads it to pick a runtime.

```bash
nvm use 22
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```

## Layout

```
src/pages/            one file per route
  index.astro         home
  about.astro         bio and work history
  blog/               post listing and the [...slug] template
  jobs.astro          Live Jobs Track, described below
src/content/blog/     posts, as Markdown with frontmatter
src/components/       Header, Footer, BaseHead, FormattedDate
src/styles/global.css design tokens live here as CSS variables
public/               served at the site root, unprocessed
```

## Writing a post

Drop a Markdown file into `src/content/blog/`. The frontmatter shape is enforced
by `src/content.config.ts`, so a missing field fails the build rather than
shipping something broken:

```yaml
---
title: 'Post title'
description: 'Shown in the listing and in link previews'
pubDate: 'Sep 09 2026'
---
```

## Theming

Colours, spacing and fonts are CSS variables on `:root` in
`src/styles/global.css`. Change them there and the whole site follows. The theme
is intentionally dark-only, so there are no light-mode overrides to keep in sync.

One Astro behaviour worth knowing if you add a page that builds its own markup:
**`<style>` in an `.astro` file is scoped to elements present in the template.**
Anything created by JavaScript at runtime will not match those rules and will
render unstyled. Use `<style is:global>` and prefix your selectors with a
container class so nothing leaks into the rest of the site. The Live Jobs Track
page does this, and getting it wrong is not obvious: the page renders, just
completely unstyled.

## The Live Jobs Track page

`src/pages/jobs.astro` shows product roles in Bangalore gathered from LinkedIn,
Naukri and Hirist, usually within minutes of being posted.

**The collecting happens somewhere else entirely.** This repo only renders it.
The page fetches a JSON feed and does all filtering, sorting and pagination in
the browser, so nothing here has to be rebuilt when new roles arrive, and there
is no server-side code.

The engine that produces the feed is a separate project:
**[cerisecloud/job-poller](https://github.com/cerisecloud/job-poller)**.

The contract between them is deliberately small. The page reads a feed with this
shape, and that is the whole integration:

```json
{
  "generated": "2026-09-10T14:31:52Z",
  "counts":    { "matched": 222, "other": 506 },
  "latency":   { "live": { "median": 16, "best": 1 } },
  "jobs": [
    {
      "title": "Product Manager", "company": "Example Corp",
      "location": "Bengaluru", "url": "https://...",
      "source": "linkedin", "bucket": "matched",
      "posted_at": "2026-09-10T13:14:00Z", "detect_lag_min": 9
    }
  ]
}
```

The page tries two sources in order and says which one it used, so a stale view
is visible rather than silent:

1. A live endpoint, set as `WORKER_FEED` near the top of the page script.
2. `public/jobs.json`, a snapshot committed to this repo, used if the live
   endpoint is unreachable.

To point the page at a different feed, change `WORKER_FEED`. To render an
entirely different set of jobs, change nothing here and reconfigure the poller.

Adding a new source needs no work in this repo either: the feed carries a
`source` field per row, and the page groups by it. Only the filter dropdown
lists sources explicitly, in `src/pages/jobs.astro`.

## Deploying

Push to `main`. Cloudflare Pages builds with `npm run build` and publishes
`dist/`. There is no other deploy step and no server to maintain.
