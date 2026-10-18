# Pulse: executive dashboard handover

Pulse is a single-page executive dashboard prototype for **Northstar Consumer Goods**, a fictional multinational consumer goods (CPG) company. It was built as an interview piece for a Revenue Growth Management (RGM) role. It shows how a CEO, CFO, CMO, Chief Sales Officer and COO could run the business day to day from one page.

- **Live:** `/experiments/executive-pulse/` on this site (the write-up is at `/projects/executive-dashboard`).
- **Code:** `public/experiments/executive-pulse/` (three files, no build step, no dependencies).
- **Data:** entirely synthetic and generated in the browser. Every company, brand, retailer, person and number is fictional.

This document explains what the dashboard does, how the code is organised, the decisions behind it, and how to change it safely.

---

## 1. What it does

**Who it's for:** the five executives below. Pick a role on first load ("Who are you today?") or from the role chip in the header. In a role, you *are* that executive: the summary, metrics, actions and watchlist are theirs.

**The product principle**, taken from the original brief: business health → deviation → drivers → implications → action. The page is exception-led and uses progressive disclosure. You see the few things that are off, why, and what to do. Detail opens in place only when you ask for it.

### Page anatomy (top to bottom)

| Area | What it shows |
|---|---|
| **Header** | Role chip · period and comparison (YTD/QTD/MTD/…; Plan / Latest estimate / Last year / Last month; calendar or fiscal year) · **Ask** box (press `/`) · **Demo** button · **Watchlist** button (badge = items changed since saved). |
| **Summary card** | AI summary headline (each sentence is clickable and opens the metric behind it; key figures are highlighted). Optional EPS strip for the CEO. **Other issues**: each row reads *by how much → is that bad → why*, with the $ at stake; top 3, expandable to 6. **Next steps**: the top 3 open actions, each with *why* and where it came from (suggested by Pulse / you assigned it / you created it); clicking one opens that action in My actions. |
| **My core metrics** | Four cards in the same slot order in every role: *Sales · Profit & cost · Market & outside view · Cash, stock & buyers*. Each card shows: value + period tag, delta vs the chosen comparison, a 13-week trend with the comparison line, "vs last week", a reference line with its source system, and a one-line insight. Status pill and colours follow good/bad, not up/down. |
| **Panel** (opens under the cards) | A conclusion headline, the panel's own Ask box, its own filters (country, brand, channel; they don't reset other panels), and chart/table cards whose titles state the conclusion. Deeper levels swap in place with breadcrumbs. Tools: RGM check (where relevant), add to watchlist, create action, copy link to this exact view, export/print. |
| **My watchlist** | Saved views for this role only. Each shows the live value, the change since you saved it, and a "Was On track" flag if the status flipped. Opening one restores the exact view: filters, period, comparison, drill level and chart. |
| **My actions** | Open / Overdue / Done tabs, 5 per page (max 20). Each row has one state-based button (Assign → Email → Book meeting), a ⋯ menu and an expandable *why + progress* row. Email and meeting buttons only **prepare drafts. Nothing is ever sent.** |

### Core metrics by role

| Role | Sales | Profit & cost | Market & outside view | Cash, stock & buyers |
|---|---|---|---|---|
| CEO | Organic sales growth | Operating margin | Market share | Free cash flow |
| CFO | Organic sales growth | Gross margin (after trade) | Earnings per share | Free cash flow |
| CMO | Shopper sales growth (sell-out vs category) | A&P return (with spend vs budget) | Market share (+ share of voice, brand health) | Buyers & frequency |
| CSO | Net sales vs sales target (incentive basis) | Trade spend | Store distribution | Channel inventory |
| COO | Service level (OTIF, lost sales) | Cost per case (+ savings delivered) | Safety & quality (safety first) | Supply risk · 13 weeks |

Metric names follow what listed CPG companies report to shareholders (organic growth, gross/operating margin, EPS, free cash flow), so an executive recognises them.

### Signature features

- **Ask:** a plain-English question becomes panel filters. Example: "gross margin for Sunrise Oats in India" opens Gross margin filtered to India · Sunrise Oats. Any metric is reachable from any role; Pulse says which view it normally lives in.
- **Ask demo** (header "Demo" button): a guided 4-step walkthrough, identical for every role.
  1. A question is typed.
  2. Pulse "builds" a custom view with the filters it applied.
  3. The results are emailed (draft only).
  4. The view is saved to the watchlist.
- **RGM checks:** "Re-check price & promo plan" (CMO/CEO share), "Re-check promo plan" (CSO) and "Review promo results" (CFO/CSO trade). Each opens one scenario table from the (illustrative) RGM tool, plus a **"Why the RGM tool recommends…"** card: the rule, the evidence, and what has to hold true. "Open in RGM tool" is deliberately non-clickable.
- **Watchlist** = the reason to come back tomorrow: live value + change since saved.
- **Share link / export:** a URL that rebuilds the exact view (`#v=…`), and a print stylesheet that exports only the open panel, stamped with scope and data date.

### Planted data stories (what each role should find)

| Story | Where it shows |
|---|---|
| Volt Coffee cuts its UK convenience price 12% in Wk 34 → Bolt Brew loses 2.4 share pts and 0.9M buyers | CMO share, Ask demo |
| Crunch Chips USA growth bought with deep promotions (ROI 0.55x) | CFO/CSO trade, promotion results |
| Oat cost +18%, price increase delayed at retailers (inflation recovery ~53%) | CFO gross margin, COO cost |
| Indonesia port disruption → Orchard Juice fill rate ~82%, 2 retailers below contract | COO service, supply risk |
| UK haircare category −7% but Silk gains share | CMO shopper sales grid |
| Glow Skincare India e-commerce +42%, ROMI 4.6x, thin stock before Diwali | CMO, COO supply risk |
| India general trade loaded: 5.3 weeks of cover vs 3.5 normal | CSO channel inventory, CFO cash |
| EPS outlook $3.05 vs consensus $3.18 and guidance $3.10–3.20 | CEO strip, CFO EPS |
| New forward risk: Sunrise Oats USA runs short in early December | COO supply risk · 13 weeks |

---

## 2. Files

```
public/experiments/executive-pulse/
  index.html          markup, all CSS (design tokens on :root), header, overlays
  data/pulse-data.js  synthetic data model, exposed as window.KD
  app/pulse.js        all application logic (single IIFE, no framework)
```

- Plain HTML/CSS/JS, served as-is from `public/`. Astro doesn't process these files, and the site's dark theme does **not** apply. The page is deliberately light-only, with a white background.
- Fonts: Archivo (display, width 112) and IBM Plex Sans (text) from Google Fonts. No other external resources.
- Desktop only (`min-width: 1280px`), tuned for 1440×900. Mobile is on the roadmap.
- Script tags carry a `?v=NN` query to bust browser caches. **Bump it whenever you change a JS file.**

### Running locally

Any static server works. You don't need the Astro dev server:

```bash
cd public/experiments/executive-pulse
python3 -m http.server 8766        # open http://localhost:8766/
```

Or run `npm run dev` at the repo root and open `http://localhost:4321/experiments/executive-pulse/`.

Useful deep links:
- `#cfo`, `#cmo-SSG`, `#coo-RISK`: open a role, optionally with a card's panel open (card ids are in section 4).
- `#v=<base64>`: a saved view (produced by the panel's "copy link" button).

---

## 3. Data model (`data/pulse-data.js`)

- **Calendar:** weekly, 2026. `CW = 41` is the last week of actuals (w/e 11 Oct 2026). Market data runs to `MKT_LAST = 38` (w/e 20 Sep). Weeks 42–52 are forecast.
- **Dimensions:** 4 countries (India, Indonesia, UK, USA) in 3 regions · 6 brands in 3 categories · 5 channels (modern trade, large retail, convenience, e-commerce, general trade). Retailers, distributors, sales heads and people are all fictional.
- **Series:** one per brand × country × channel. Each has weekly arrays for five scenarios:
  - `A`: actual to week 41, then forecast
  - `T`: plan / target (from the "RGM tool")
  - `L`: last year
  - `E`: Sep latest estimate. Equal to A up to week 39, then a forecast that assumed 40% recovery to plan.
  - (last month is computed from `A` shifted by 4 weeks)
- **Fields per week:**
  - volume, orders, consumption (shopper purchases), channel stock
  - gross sales, trade, returns
  - materials, packaging, conversion, inbound freight
  - warehousing, freight, handling, rush shipments
  - A&P (TV/digital/other), retail sales value, incremental margin
- `K.agg(filter, scenario, w0, w1)` sums a slice and derives net sales, COGS, gross margin, distribution cost, A&P, contribution margin, fill rate and lost sales. **It is memoised.** The data is static, so results are cached by key and returned as copies.
- Other helpers:
  - `K.market` / `K.share`: syndicated market data
  - `K.finance`: company P&L below contribution margin (overheads, interest, tax, EPS; share count calibrated so plan EPS = $3.15 and outlook = $3.05)
  - `K.invDays` / `K.invProj`: days of cover, now and projected 13 weeks out, including confirmed recovery plans
- Reference tables:
  - `PROMOS`, `CAMPAIGNS`, `PENETRATION`, `FREQUENCY`, `SWITCHING`, `BRAND_HEALTH`, `SOV`, `LAUNCHES`, `INNOVATION`
  - `PLANTS`, `SAVINGS`, `SUPPLIERS`, `FORECAST_ACC`, `FORECAST_BIAS`, `COMMODITIES`, `SAFETY`, `QUALITY`, `CASH`, `LE_HISTORY`, `FIN`, `SIGNALS`, `REACH`, `LISTINGS`, `WAREHOUSES`, `SALES_HEADS`, `PEOPLE`
- The random generator is seeded, so numbers are identical on every load.

To plant a new story, adjust `storyFx(b, c, ch, w)` (which perturbs the actuals), or add a reference table and read it from a card or panel.

---

## 4. Application logic (`app/pulse.js`)

The file is one IIFE. The section banners (`/* ===== … ===== */` and `/* ----- … ----- */`) are in reading order. The pieces you'll touch most:

| Concept | Where / how |
|---|---|
| **State** | `state` = role, period, comparison (`T`/`E`/`L`/`M`), year (calendar/fiscal), actions paging. `PF` = the open panel's own filters. `OPEN` = the open card id. |
| **Periods** | `win()` → window `{w0, w1, wa, label}`. Windows are computed from `CW` via `perWin()`. Every role defaults to **YTD**, and each card shows its own period tag. |
| **As-of** | `asOf(s, fn)` temporarily moves `CW` back *s* weeks. This powers the 13-week trend and "vs last week" on every card, plus the watchlist's seeded "saved last week" values. |
| **Card registry** | `ROLE_CARDS` (role → 4 card ids), `CARD_DEF` (name, definition, formula; also feeds the (i) tooltips), `CARD_SLOT` (slot index). |
| **`card(id)`** | Returns `{value, raw, craw, rk, rg, delta, sev, per, ref, prov, insight, say}`. `raw`/`craw` are numbers for trends and the watchlist. `rk` = change unit (`pts`/`bps`/`pct`/`$`/`x`/…). `rg` = good direction (+1/−1/0). `say` = the summary sentence. |
| **Trends** | `trendOf(id)`: windowed cards use `asOf`; others use market, monthly or panel series. Rendered by `trendSvg`; `cardHtml` builds the card. |
| **Exceptions engine** | `exceptions()` + `diagnose()`: rule-based "AI" over the synthetic data. It classifies each brand × country gap (supply, buying, competitor, market, cost, opportunity, volume, loading), builds a cause chain, a recommended action and a value at stake, and ranks by full-year impact, weighted per role (`ROLE_BOOST`). |
| **Summary** | `summaryView(ex)`: headline from off-track cards, Other issues (core metrics + top exceptions), Next steps (top open actions). |
| **Panels** | `PANEL[id]()` opens a card's panel. Older panels are built by `band(...)`, `openTile(...)` and `openCFO(...)`; role-specific extras are added with `extendTop({pre, post, drop, after})`. New panels: `openSSG`, `openAP`, `openPENF`, `openSAFQ`, `openRISK`, `openAskView`. |
| **Drill levels** | `openLevel(level, reset)` pushes onto `drill.stack`; `paintBand()` renders it. Every drill function (`openSlice`, `openRgm`, `openContrib`, `band`, …) is wrapped so each level records a replayable `step`. That is how bookmarks and share links rebuild an exact view (`getView` / `restoreView`). |
| **Charts** | Hand-built SVG: `lineChart`, `waterfall` (supports subtotal bars and cascade mode), `divBars`, `dumbbell`, `bullet`. No chart library. |
| **Ask** | `METRIC_WORDS` (metric phrases → card id), `LEX` (countries/cities, brands, channels, periods), `parseAsk` (multi-word metric phrases first, then places/periods, then single words), `runAsk` (opens the metric's own panel; says which view it belongs to). The demo question is intercepted to open the custom Ask view. |
| **RGM** | `RGM` (scenario tables) and `RGM_WHY` (rule, reasons, what has to hold true). `openRgm(key)` renders both. |
| **Watchlist** | `BM` in `localStorage` (`pulse-bm2`). Per role. Seeded with example views "saved 5 Oct". `renderPins`, `openWatchAll`, `addBookmark`, `cardIn(view)` (computes a card under a saved view's filters and period). |
| **Actions** | `buildActions()` (from exceptions plus heads, stock risk, guidance, campaigns), user-created `NEWACTS` (`pulse-new-acts`), status overrides `ACTS` (`ns-actions`), `actionsView()`, draft modals (`mailModal`, `meetModal`, `assignModal`). |
| **Demo** | `ASKD`, `DEMO_STEPS`, `demoNext()`, coach card `#coach`. |

### Formatting rules (keep these)

- Falls show as **▼ (−22%)** and rises as **▲ (+22%)**, coloured by whether the move is *good for the business*. Higher cost is red even though it went up. Headline values are shown plain.
- Margins change in **bps**, growth and share in **pts**, money in `$` (USD at plan rates). Use the unicode minus `−`, not a hyphen.
- Status pill and bar/dot colours follow the same severity; there is one `sevOf` per unit.
- Comparison names are always **Plan / Latest estimate / Last year / Last month**. The CSO's sales target is labelled *incentive basis* because it differs from plan.
- Roles, not names, wherever the reader needs to know *who* (e.g. "Ask the India Sales Director to…").

### Design system (in `index.html`)

- Tokens are on `:root`: ink `#16191d`, one accent `#1f5bd6`, red `--neg`, good/warn/crit text and background pairs, radii 14/10/8, motion curves and durations (110/160/240/420 ms). There's a reduced-motion rule.
- Components: metric card, chart card (`.cc`: conclusion title → subtitle → chart → foot → source), action row, watchlist tile, issue row (`.iss`), filter box (`.fsel`).
- **CTAs** are accent blue (`.btn.primary`); row actions are blue-outlined (`.btn.cta`).
- **Form fields** have explicit white backgrounds and `color-scheme: light`, so a browser in dark mode can't render them black. Keep this on any new input.
- Contrast is checked to WCAG AA.

---

## 5. Common changes

- **Add or swap a core metric**
  1. Add the id to `ROLE_CARDS`, `CARD_DEF` and `CARD_SLOT`.
  2. Add a `case` in `card()` returning the fields above (set `raw`, `craw`, `rk`, `rg`, `per`).
  3. Add it to `WINDOWED` if it depends on the period; otherwise add a branch in `trendOf`.
  4. Add a `PANEL[id]` entry.
  5. Add phrases to `METRIC_WORDS` so Ask can find it.
- **Add a panel block:** build `{ h, sub, html | id, wide, src, foot }`. Charts render in `after()`, by id.
- **Add an RGM check:** add an entry to `RGM` (`label`, `scope`, `title`, `chip`, `cols`, `rows`, `head`) and to `RGM_WHY`. The panel button appears automatically for that card id.
- **Change a story or number:** edit `data/pulse-data.js`. Every view recomputes; there are no cached files.
- **After any change:**
  1. Bump `?v=` in `index.html`.
  2. Open each role and click every card.
  3. Run one Ask query, one bookmark restore, and the demo.
  4. Check the browser console for errors.

### Test checklist (what was verified before handover)

- All 5 roles × 4 cards open with no console errors. The country filter works in each panel. Deeper levels and breadcrumbs work.
- Comparison toggles (Plan / Latest estimate / Last year / Last month) and period changes flow through every card.
- Ask routing works across roles, e.g. "forecast accuracy in Indonesia" from the CFO opens the COO supply-risk panel.
- Watchlist restores the role, filters, period, drill level (including RGM checks) and chart highlight.
- Share-link round trip and print export work.
- The demo runs end to end in every role.
- Contrast audit passes. Form fields render white with the system in dark mode.
- Rendering performance: panels open in under ~400 ms, and a role switch renders in under ~10 ms after its loader.

---

## 6. How it got here (decision log)

1. **Framing.** Five C-suite roles; exception-led; four core metrics per role that cover the breadth of the business; everything else reachable through panels and Ask. Fictional company, light theme, desktop only.
2. **Visual direction "Instrument panel":** Apple/Linear-style restraint, wide display type, one blue accent, 1px borders, conclusion-titled charts.
3. **C-suite review** (CEO, CFO, CMO, CSO, COO lenses) led to:
   - one company default period (YTD) with a period tag on every card
   - bps for margins
   - plan / latest-estimate naming
   - colours that follow good/bad
   - 13-week trends
   - live watchlist with exact restore
   - share link and export
   - CFO gross-to-net and the risks & opportunities range
   - CSO run rate and key accounts
   - CMO rebuilt around shopper sales vs category, A&P return, brand health and buyers × frequency
   - COO rebuilt around service with lost sales, savings, safety first and 13-week supply risk
4. **Owner review in comments** led to:
   - the Ask demo
   - the summary as a compact card
   - simpler data-freshness line (detail in a tooltip)
   - clickable headline sentences (promotions open the promotion ROI deep dive)
   - roles instead of names
   - an issues list that reads *by how much → is that bad → why*
   - Next steps linked to My actions, with provenance
   - "Why the RGM tool recommends…" cards
   - key-figure highlighting
   - blue CTAs and dark-mode-proof form fields
   - per-role watchlists

## 7. Known limitations and roadmap

- **Prototype only.** The data is synthetic; the "AI" summaries and recommendations are rules; RGM, supply planner, panel and tracker integrations are illustrative.
- **Storage is local.** Watchlist, actions and the role choice live in this browser's `localStorage`. They are not shared between people or devices.
- **No access control.** Switching role is a UI choice, not a permission.
- **Production would need:**
  - single sign-on with role-based access
  - an audit log on actions
  - a shared system of record for actions and watchlists, or sync to the team's task tool
  - real data connections (ERP, retailer POS, syndicated market data, consumer panel, supply planner, RGM tool)
  - optional alerts and digests that deep-link back into a view
- **Not built yet:**
  - mobile layout
  - CEO portfolio view and 3-year plan
  - CFO working-capital days (DSO/DIO/DPO)
  - on-shelf availability
  - weighted distribution
- **Email and meeting features** only prepare drafts for the user to send from their own tools; the dashboard never sends anything.
