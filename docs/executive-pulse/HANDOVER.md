# Pulse: executive dashboard handover

Pulse is a single-page executive dashboard prototype for **Northstar Consumer Goods**, a fictional multinational consumer goods (CPG) company. It shows how a CEO, CFO, CMO, Chief Sales Officer and COO could run the business from one page. It was built as an interview piece for a Revenue Growth Management (RGM) role.

- **Live:** https://apoorva-writes.pages.dev/experiments/executive-pulse/ (the write-up is at `/projects/executive-dashboard`)
- **Code:** `public/experiments/executive-pulse/` (three files, no build step, no dependencies)
- **Data:** synthetic, generated in the browser. Every company, brand, retailer, person and number is made up.

If you fork this repo, this folder has everything you need:

| File | What it is |
|---|---|
| `docs/executive-pulse/HANDOVER.md` | This document |
| `docs/executive-pulse/cpg-metric-pyramid.html` | The metric pyramid the dashboard is built on: one tree per executive, L1 to L3, with definitions, the names real CPG companies use, and sources. Open it in a browser. |
| `docs/executive-pulse/AI-Writing-Signals-Checklist.md` | The writing rules every piece of text on the dashboard follows |
| `tools/ai-scan.sh` | An automated check for the mechanical tells in that checklist |

---

## 1. How to run and publish

```bash
cd public/experiments/executive-pulse
python3 -m http.server 8766        # open http://localhost:8766/
```

Or run `npm run dev` at the repo root (Node 22, see the README) and open `http://localhost:4321/experiments/executive-pulse/`.

- **Publishing:** push to `main` on `cerisecloud/apoorva-writes`. Cloudflare Pages rebuilds the site in about 90 seconds. Astro copies `public/` as it is, so the dashboard needs no build of its own.
- **Caching:** browsers cache these files hard. After you change a JS file, bump the `?v=NN` on both script tags at the bottom of `index.html`. When testing locally, hard refresh or add `?r=1` to the URL.
- **Deep links:** `#cfo` opens a role, `#coo-POR` opens a role with a card's panel open, and `#v=<base64>` opens a saved view (made by the panel's link button).
- **Layout:** desktop only, tuned for 1440 × 900. Light theme only, whatever the rest of the site does.

---

## 2. The metric pyramid

The metrics come from `cpg-metric-pyramid.html`. Every executive has their own tree with at most 4 metrics at each level. **L1** metrics are the cards on the home page. Opening a card shows its **L2** metrics as tiles at the top of the panel. Clicking an L2 opens a **side panel** with that metric and its **L3** metrics; clicking an L3 shows it in the same side panel.

| Role | L1 cards |
|---|---|
| CEO | Organic sales growth, Adjusted operating margin, Free cash flow conversion, Perfect order rate |
| CFO | Organic sales growth, Gross margin, Adjusted operating margin, Free cash flow conversion |
| CSO | Organic sales growth, Value market share, Perfect order rate, Days sales outstanding |
| CMO | Brand equity, Organic sales growth, Advertising and marketing % of net sales |
| COO | Perfect order rate, Gross margin, Free cash flow conversion, Total recordable incident rate |

The full L2 and L3 trees are in the `TREE` object in `app/pulse.js`, and they match the pyramid file one to one. If you change one, change the other.

### What each level shows

- **L1 panel:** the analysis Pulse always had (bridges, contributor bars, tables, drill-downs, Ask, filters, RGM checks), plus a "What adds up to …" block of L2 tiles at the top. Each block carries the roll-up rule from the pyramid, such as "Organic sales growth = volume growth + price/mix".
- **Side panel (L2 or L3):**
  1. The metric itself, in the standard card layout
  2. What it means, and how it adds up
  3. What drives it (its L3s, for an L2)
  4. A breakdown by country and by brand where the metric can be split. Clicking a row applies that filter to the main panel.
  5. "Open the full analysis", which opens the matching deep view in the main panel. The `FULL` map in the code says which view each metric opens.
- Everything follows the panel's own filters and the period chosen in Filters.

### Where the numbers come from

About 20 metrics are calculated from the weekly data model: organic growth, volume, price/mix, pricing, mix, trade spend, promotion ROI, share, category growth, gross margin, operating margin, marketing spend and ROI, distribution cost, logistics cost per case, overheads, penetration, buying rate, brand health, OEE, savings and forecast accuracy.

The rest use small synthetic tables by country, defined next to each metric in the `MX` registry: DSO, DPO, DIO, the parts of perfect order (on time, damage free, paperwork, carrier on time, cycle time), on-shelf availability, ROAS, ROIC, TRIR, E&O inventory and capital spending. They are plausible, not modelled. Replace them with real feeds before anyone reads them as facts.

### Old metrics that are not in the pyramid

They were folded in so nothing was lost:

- Shopper sales and launches sit behind Organic volume growth, Category growth and Innovation rate.
- Supply risk sits behind Forecast accuracy.
- Channel stock sits behind On-shelf availability and Days inventory outstanding.
- The CSO's sales heads table stays in the CSO's Organic sales growth panel.
- The old card ids (`SSG`, `CHINV`, `OTIF`, `COGS`, `SALES`, `RISK` and others) still exist in `card()`, so watchlist views saved on them keep working.

---

## 3. Page anatomy and design rules

### The standard order for any metric

Every metric card, highlight bar, issue row, watchlist tile, L2 tile and side-panel card reads in the same order, so people know where to look:

1. **Status first.** The status word (OFF TRACK, AT RISK, ON TRACK, OPPORTUNITY) in its own colour. Bad is louder than good: off-track and at-risk get a tinted chip, on-track is plain text. Summary rows also carry a coloured left edge.
2. **Which metric.**
3. **How far off and in which direction**, large and in the status colour: "▼ 0.4 pts behind plan". This matters more than the value itself.
4. **The actual value**, smaller, with what it is judged against: "Now 4.6%, plan 4.9%". Never a bare "Now 4.6%".
5. **The trend.**
6. **What is behind it**, and in the summary the next step, then the CTAs.

Surfaces are kept calm on purpose: soft borders, a white background and one whisper of shadow. Colour carries the message, not boxes.

The code for this lives in `gapOf` and `gapHtml` (the gap line), `nowLine` (the value and its comparison), `cardHtml` (L1 cards), `summaryView` (summary rows), `watchTile` (watchlist) and `l2Block` and `renderDrawer` (pyramid tiles and side panel).

### Page, top to bottom

| Area | What it shows |
|---|---|
| Header | Role, **Filters** (period, comparison, calendar or fiscal year, plus a Custom option that shows a disabled date range on purpose), Ask (press `/`), Demo, Watchlist |
| Summary | Two headline sentences, each opening its metric, then up to six issue rows. One row carries the whole story: status, the metric and its gap, why it is happening, the next step with its due date and where it came from, and on the right the action's own button (Assign, Email, Book meeting), a menu and "See analysis". An issue with no action of its own shows what Pulse suggests and who owns it. The CEO's earnings line is the first row. |
| Core metrics | The role's L1 cards, with the watchlist on the same shelf to their right. The link above the shelf scrolls between the two. |
| Panel | Opens under the cards. The headline takes the left, and a fixed column on the right holds the tools, Ask and one Filters button. L2 tiles, then the analysis. Deeper levels swap in place with breadcrumbs. |
| My actions | Open, Overdue and Done. Email and meeting buttons only prepare drafts. Nothing is ever sent. |

### Visual rules

- Tokens are on `:root` in `index.html`: ink `#16191d`, one accent `#1f5bd6`, and good, warn, crit and opportunity colour pairs.
- Status classes `s-crit`, `s-warn`, `s-good` and `s-opp` set `--tint` and `--sig`. Reuse them for anything new.
- Colours follow good or bad for the business, not up or down. Higher cost is red.
- Margins move in bps, growth and share in pts, money in `$` (USD at plan rates).
- Form fields have a white background and `color-scheme: light`, so a browser in dark mode cannot turn them black.

### What a card's chart says

- With weekly history: the line, a dashed line for what it is judged against, the gap between them shaded in the status colour, the value the line starts from, and the period it covers.
- With no history (the synthetic metrics in section 2): a bar from zero to today with a tick where the comparison sits, under the caption "Now against target". Do not fake a curve for these.
- `trendOf` returns `null` when a metric has no history, which is what switches a card to the bar.

---

## 4. Writing rules

All text on the dashboard follows `AI-Writing-Signals-Checklist.md`. In short:

- Write plain sentences a person would say out loud. One idea per sentence, with a concrete number.
- No em dashes, en dashes or middots as separators. Use commas, "to" ("weeks 40 to 41") or "in" ("Bolt Brew in UK").
- No arrow chains inside sentences. "→" is only used as a click affordance.
- Write "last year", not "LY", in sentences. Put "n/a" or "none" in empty table cells, not a dash.
- Straight quotes only.
- Name roles, not people, when the reader needs to know who acts: "Ask the India Sales Director to…".

Run the scan after any copy change:

```bash
tools/ai-scan.sh public/experiments/executive-pulse/index.html public/experiments/executive-pulse/app/pulse.js public/experiments/executive-pulse/data/pulse-data.js
```

The scan is blunt, so read every hit before changing it. One known false positive: "Overall equipment effectiveness" is the industry name for OEE and trips the "Overall" check.

---

## 5. Files and code map

```
public/experiments/executive-pulse/
  index.html          markup, all CSS (tokens on :root), header, side panel, overlays
  data/pulse-data.js  synthetic data model, exposed as window.KD
  app/pulse.js        all application logic (one IIFE, no framework)
```

### Data model (`data/pulse-data.js`)

- **Calendar:** weekly, 2026. `CW = 41` is the last week of actuals (week ending 11 Oct 2026). Market data runs to `MKT_LAST = 38` (20 Sep). Weeks 42 to 52 are forecast.
- **Dimensions:** 4 countries (India, Indonesia, UK, USA) in 3 regions, 6 brands in 3 categories, and 5 channels.
- **Series:** one per brand, country and channel, with weekly arrays for actual (`A`), plan (`T`), last year (`L`) and latest estimate (`E`).
- **Helpers:**
  - `K.agg(filter, scenario, w0, w1)` sums a slice and derives net sales, cost of goods, gross margin, distribution cost, marketing, contribution margin, fill rate and lost sales. It is memoised.
  - `K.share` and `K.market` give market data.
  - `K.finance` gives the company P&L below contribution margin.
  - `K.invDays` and `K.invProj` give days of stock now and over the next 13 weeks.
- **Reference tables:** promotions, campaigns, penetration, frequency, switching, brand health, share of voice, launches, plants, savings, suppliers, forecast accuracy, commodities, safety, quality and cash.
- **Planted stories:** the stories each role should find are built into `storyFx`. Examples are Volt Coffee's 12% price cut in UK convenience, Crunch Chips USA growth bought with promotions, the oat cost spike, the Indonesia port disruption and India general trade loading.

### `app/pulse.js`, in reading order

| Section | What it does |
|---|---|
| formatting, periods and state | Number formats, `win()` for the period window, `state` |
| exceptions engine | `diagnose()` and `exceptions()`: rule-based "AI" that finds and ranks problems by brand and country. Its plain-language causes feed Other issues, Next steps and My actions. |
| charts | Hand-built SVG: `lineChart`, `waterfall`, `divBars`, `dumbbell`, `bullet`, `rangePlot` |
| drill panel and the older panels | `openSlice`, `openTile`, `openCFO`, `band()` and friends. These are the deep analyses the pyramid points to. |
| PULSE v2 | `card(id)` returns value, gap inputs (`raw`, `craw`, `rk`, `rg`), status, period, reference, insight and the summary sentence. Also `cardHtml`, `summaryView`, `PANEL`, RGM checks, watchlist, actions and the Ask demo. |
| Metric pyramid | `TREE`, `LOGIC`, the `MX` registry (`mx(id, name, definition, formula, {f, rk, rg, vs, by, …})`), `FULL`, `l2Block`, the side panel, and the hooks that wrap `openCard`, `runAsk` and `card` |
| render, events, boot | `renderHome`, `syncControls`, the role picker, click handling and boot |

Inside an `mx()` entry, `f(filter, period)` returns `{ raw, craw }` (actual and comparison) and can override `value`, `ref`, `insight` or `say`. `rk` sets the unit of the gap (`pts`, `bps`, `pct`, `x`, `days`, `$`, `n0`, `n2`), and `rg` says whether higher is good (1), bad (−1) or neutral (0). Status, the gap line and the default sentence are worked out from those.

### Ask

`METRIC_WORDS` maps phrases to metric ids. Ask finds the metric in the role's tree, or else the CEO's tree, opens its L1 with the filters it understood, and opens the side panel on the L2 or L3. For example, "pricing in India" opens Organic sales growth for India with the side panel on Price/mix › Pricing.

---

## 6. Common changes

- **Add a metric:**
  1. Add an `mx()` entry.
  2. Put its id in `TREE` under the right parent.
  3. Add a `FULL` entry if a deep view fits.
  4. Add phrases to `METRIC_WORDS`.
  5. Add it to `cpg-metric-pyramid.html` too, so the two stay in step.
- **Make a metric an L1 for a role:** move it to the top level of that role's `TREE` entry and add a `PANEL[id]` that opens its main analysis.
- **Change a number or story:** edit `data/pulse-data.js`. Every view recomputes.
- **Change copy:** follow section 4 and run the scan.
- **After any change:**
  1. Bump `?v=` in `index.html`.
  2. Open each role.
  3. Open every card, every L2 tile and one L3 per tile.
  4. Run one Ask query, one watchlist restore and the demo.
  5. Check the console for errors.

### Test checklist used before this handover

- All 5 roles: every L1 card opens its panel; every L2 tile opens the side panel; the first L3 under each opens; breakdown rows apply filters; "Open the full analysis" opens the deep view with breadcrumbs.
- Ask: "pricing in India", "fill rate in Indonesia", "brand awareness", "days sales outstanding" and "trade spend in USA" all land on the right L1 and side panel.
- Filters popover, including the disabled Custom range. The demo runs end to end. Watchlist tiles open their saved view. No console errors.

---

## 7. How it got here

1. **First build:** five roles, exception-led, four core metrics per role, a fictional company, light theme, desktop only. A visual direction of restraint: wide display type, one blue accent, conclusion-titled charts.
2. **C-suite review:** YTD as the default period, bps for margins, plan and latest-estimate naming, colours that follow good and bad, 13-week trends, a live watchlist, share links and export.
3. **Owner review:** the Ask demo, a compact summary, clickable headline sentences, roles instead of names, Next steps linked to My actions, "Why the RGM tool recommends…" cards, and blue CTAs.
4. **Plain-language pass (Oct 2026):** every string rewritten against the writing checklist. Dense "→" chains replaced with one sentence per issue. Dead code removed.
5. **Status-first anatomy (Oct 2026):** cards, the EPS bar, issue rows and watchlist tiles reordered so status shows first, then the metric, then the gap, then the value. Filters button labelled "Filters", with a disabled Custom range to show the idea without building it.
6. **Metric pyramid (Oct 2026):** cards replaced by the pyramid's L1s per role. L2 tiles added to each panel and L3s added in a side panel, with every earlier analysis still reachable.
7. **Density pass (Oct 2026):** the summary's two columns merged into one block, so an issue and its next step read as one thing and the core metrics sit above the fold. Tinted bands dropped for status chips. The watchlist moved onto the cards' shelf. Charts on metrics without history replaced by an honest bar. Panel header given a fixed column for its controls.

## 8. Known limits and next steps

- **Prototype only:** the data is synthetic, the "AI" text is rules, and the RGM, supply planner, panel and tracker integrations are illustrative.
- **Synthetic metrics:** the metrics listed in section 2 need real sources.
- **Storage:** the watchlist, actions and role choice live in the browser's `localStorage`. They are not shared between people or devices.
- **Access:** there is no access control. Switching role is a UI choice.
- **Not built:**
  - mobile layout
  - a custom date range (shown as disabled)
  - L4 detail below the pyramid's L3s
  - a pyramid view inside the dashboard itself (today it is a separate file)
- **Email and meetings:** these only prepare drafts. The dashboard never sends anything.
