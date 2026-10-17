/* Kestrel Executive Pulse — application logic (views, exceptions engine, charts, drill panel). Synthetic data only. */
(function () {
'use strict';
const K = window.KD, CW = K.CW, NW = K.NW;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ================= formatting ================= */
const MINUS = '−';
const fmt$ = v => { const a = Math.abs(v), s = v < 0 ? MINUS : ''; if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M'; if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(0) + 'K'; return s + '$' + a.toFixed(0); };
const pct1 = v => (v * 100).toFixed(1) + '%';
const sgn = (v, txt) => '(' + (v >= 0 ? '+' : MINUS) + txt + ')';
const sPct = (v, d = 1) => sgn(v, (Math.abs(v) * 100).toFixed(d) + '%');
const sPts = v => sgn(v, Math.abs(v).toFixed(1) + ' pts');
const sBps = v => sgn(v, Math.round(Math.abs(v)) + ' bps');
const s$ = v => sgn(v, fmt$(Math.abs(v)));
function dv(v, kind, good, suffix) {   // ▲ (+x) / ▼ (−x), coloured by whether the move is good for the business
  if (v == null || !isFinite(v)) return '<span class="dv neu">—</span>';
  const up = v >= 0, a = Math.abs(v);
  const txt = kind === 'pct' ? (a * 100).toFixed(1) + '%' : kind === 'bps' ? Math.round(a) + ' bps' : kind === 'pts' ? a.toFixed(1) + ' pts' : kind === '$' ? fmt$(a) : kind === 'x' ? a.toFixed(2) + 'x' : kind === 'eps' ? '$' + a.toFixed(2) : a.toFixed(1);
  const cls = good === 0 || a < 1e-9 ? 'neu' : (up === (good > 0) ? 'fav' : 'unf');
  return `<span class="dv ${cls}">${up ? '▲' : '▼'} (${up ? '+' : MINUS}${txt})${suffix ? ` <small>${suffix}</small>` : ''}</span>`;
}
const SEV = { good: 'On track', warn: 'At risk', crit: 'Off track', opp: 'Opportunity' };
const sevPill = s => `<span class="pill sev ${s}">${SEV[s]}</span>`;
const dirPill = d => d === 'worse' ? '<span class="pill dir worse">↓ Worsening</span>' : d === 'better' ? '<span class="pill dir better">↑ Improving</span>' : '';
const metaPill = t => `<span class="pill meta">${esc(t)}</span>`;
const aiTag = '<span class="pill ai" data-def="AI" tabindex="0">AI</span>';
const vr = (a, c) => c === 0 ? 0 : (a - c) / Math.abs(c);
function sevOf(fav, kind) {
  if (kind === 'pct') return fav >= -.005 ? 'good' : fav >= -.02 ? 'warn' : 'crit';
  if (kind === 'bps') return fav >= -10 ? 'good' : fav >= -60 ? 'warn' : 'crit';
  if (kind === 'pts') return fav >= -.1 ? 'good' : fav >= -1 ? 'warn' : 'crit';
  return 'good';
}

/* ================= periods & state ================= */
const monthOf = w => K.weekEnd(w).getUTCMonth();
const weeksIn = m => { const r = []; for (let w = 1; w <= CW; w++) if (monthOf(w) === m) r.push(w); return r; };
const mtd = weeksIn(monthOf(CW)), lastM = weeksIn(monthOf(CW) - 1);
const FISCAL_START = (() => { for (let w = 1; w <= 52; w++) if (monthOf(w) === 3) return w; return 14; })();
const PERIODS = {
  LW: { label: 'Last week', w0: CW, w1: CW, desc: 'Wk ' + CW },
  MTD: { label: 'MTD', w0: mtd[0], w1: CW, desc: 'Oct to date · Wk ' + mtd[0] + '–' + CW },
  LM: { label: 'Last month', w0: lastM[0], w1: lastM[lastM.length - 1], desc: 'Sep · Wk ' + lastM[0] + '–' + lastM[lastM.length - 1] },
  R4W: { label: '4 weeks', w0: CW - 3, w1: CW, desc: 'Wk ' + (CW - 3) + '–' + CW },
  QTD: { label: 'QTD', w0: 40, w1: CW, desc: 'Q4 to date · Wk 40–' + CW },
  YTD: { label: 'YTD', w0: 1, w1: CW, desc: 'Wk 1–' + CW },
  FY: { label: 'FY outlook', w0: 1, w1: 52, desc: 'Wk 1–' + CW + ' actual + Wk ' + (CW + 1) + '–52 forecast' },
};
const ROLES = {
  CEO: { label: 'CEO', period: 'YTD' }, CFO: { label: 'CFO', period: 'LM' }, CMO: { label: 'CMO', period: 'R4W' },
  CSO: { label: 'Sales', period: 'MTD' }, COO: { label: 'COO', period: 'MTD' }, FH: { label: 'Function health', period: 'YTD' },
};
const state = { role: 'CEO', period: 'YTD', year: 'CAL', comp: 'T', geo: 'all', brand: 'all', ch: 'all' };
try { const r = localStorage.getItem('kp-role'); if (r && ROLES[r]) { state.role = r; state.period = ROLES[r].period; } } catch (e) { }
function win() {
  const P = { ...PERIODS[state.period] };
  if (state.year === 'FISCAL') {
    if (state.period === 'YTD') { P.w0 = FISCAL_START; P.desc = 'Fiscal YTD from Apr · Wk ' + FISCAL_START + '–' + CW; }
    if (state.period === 'QTD') P.desc = 'Fiscal Q3 to date · Wk 40–' + CW;
    if (state.period === 'FY') P.desc = 'Fiscal year Apr–Mar · actual + forecast';
  }
  P.wa = Math.min(P.w1, CW);   // last actual week in window
  return P;
}
const compShort = () => ({ T: 'vs target', L: 'vs LY', M: 'vs last month' })[state.comp];
const compName = () => ({ T: 'target', L: 'last year', M: 'last month' })[state.comp];
function filter() {
  const f = {};
  if (state.geo.startsWith('r:')) f.c = K.REGIONS.find(r => r.id === state.geo.slice(2)).countries;
  else if (state.geo.startsWith('c:')) f.c = [state.geo.slice(2)];
  if (state.brand.startsWith('k:')) f.b = K.BRANDS.filter(b => b.cat === state.brand.slice(2)).map(b => b.id);
  else if (state.brand.startsWith('b:')) f.b = [state.brand.slice(2)];
  if (state.ch !== 'all') f.ch = [state.ch];
  return f;
}
const inter = (a, b) => !a ? b : !b ? a : a.filter(x => b.includes(x));
const sub = (f, o) => ({ c: inter(f.c, o.c), b: inter(f.b, o.b), ch: inter(f.ch, o.ch) });
const countriesOf = f => f.c || K.COUNTRIES.map(c => c.id);
const brandsOf = f => f.b || K.BRANDS.map(b => b.id);
const channelsOf = f => (f.ch || K.CHANNELS.map(c => c.id)).filter(ch => K.SERIES.some(s => K.match(s, { ...f, ch: [ch] })));
const has = f => K.SERIES.some(s => K.match(s, f));
function nameOf(f) {
  const p = [];
  const bs = f.b, cs = f.c;
  p.push(bs && bs.length === 1 ? K.BMAP[bs[0]].name : bs && bs.length < K.BRANDS.length ? (new Set(bs.map(b => K.BMAP[b].cat)).size === 1 ? K.BMAP[bs[0]].cat : bs.length + ' brands') : 'All brands');
  p.push(cs && cs.length === 1 ? K.CMAP[cs[0]].name : cs && cs.length < K.COUNTRIES.length ? (K.REGIONS.find(r => r.countries.length === cs.length && r.countries.every(x => cs.includes(x))) || { id: cs.length + ' countries' }).id : 'All markets');
  if (f.ch && f.ch.length === 1) p.push(K.CHMAP[f.ch[0]].name);
  return p.join(' · ');
}

/* ================= calculations ================= */
const agg = (f, sc, w0, w1) => K.agg(f, sc, w0, w1);
function compAgg(f, P) {   // comparator sums for the window
  if (state.comp === 'M') return agg(f, 'A', Math.max(1, P.w0 - 4), Math.max(1, P.wa - 4));
  return agg(f, state.comp, P.w0, P.w1);
}
function sumS(s, sc, w0, w1) { const o = {}; for (const k of K.FIELDS) { let t = 0; const X = s[sc][k]; for (let w = w0; w <= w1; w++) t += X[w]; o[k] = t; } o.ns = o.gs - o.tr - o.ret; o.cogs = o.mat + o.pack + o.conv + o.inb; o.dist = o.wh + o.fr + o.hd; o.ap = o.apTv + o.apDig + o.apOth; return o; }
// additive bridge from comparator to actual; kind 'ns' or 'cm'
function bridge(f, P, kind) {
  let vol = 0, price = 0, trade = 0, cogs = 0, dist = 0, ap = 0, Ua = 0, Uc = 0, Cc = 0, start = 0, end = 0;
  for (const s of K.SERIES) {
    if (!K.match(s, f)) continue;
    const a = sumS(s, 'A', P.w0, P.w1);
    const c = state.comp === 'M' ? sumS(s, 'A', Math.max(1, P.w0 - 4), Math.max(1, P.wa - 4)) : sumS(s, state.comp, P.w0, P.w1);
    if (c.vol <= 0 || a.vol <= 0) continue;
    const lpa = a.gs / a.vol, lpc = c.gs / c.vol, dedc = (c.tr + c.ret) / c.gs, ucc = c.cogs / c.vol, dcc = c.dist / c.vol;
    const unit = kind === 'ns' ? lpc * (1 - dedc) : kind === 'gm' ? lpc * (1 - dedc) - ucc : lpc * (1 - dedc) - ucc - dcc;
    Ua += a.vol; Uc += c.vol; Cc += c.vol * unit; vol += (a.vol - c.vol) * unit;
    price += a.vol * (lpa - lpc) * (1 - dedc); trade += -((a.tr + a.ret) - a.gs * dedc);
    if (kind === 'gm') cogs += -(a.cogs - a.vol * ucc);
    if (kind === 'cm') { cogs += -(a.cogs - a.vol * ucc); dist += -(a.dist - a.vol * dcc); ap += -(a.ap - c.ap); }
    start += kind === 'ns' ? c.ns : kind === 'gm' ? c.ns - c.cogs : c.ns - c.cogs - c.dist - c.ap; end += kind === 'ns' ? a.ns : kind === 'gm' ? a.ns - a.cogs : a.ns - a.cogs - a.dist - a.ap;
  }
  const aggVol = Uc ? (Ua - Uc) * (Cc / Uc) : 0;
  const items = [['Volume', aggVol, 'vol'], ['Mix', vol - aggVol, 'mix'], ['Price', price, 'price'], ['Trade & promo', trade, 'trade']];
  if (kind === 'gm') items.push(['Cost of goods', cogs, 'cogs']);
  if (kind === 'cm') items.push(['Cost of goods', cogs, 'cogs'], ['Distribution', dist, 'dist'], ['A&P', ap, 'ap']);
  return { kind, start, end, items, perSeriesVol: vol };
}
function shareWin(P) { const w1 = Math.min(P.wa, K.MKT_LAST), w0 = Math.min(P.w0, w1 - 3); return [Math.max(1, w0), w1]; }
function slice(f, P) {
  const A = agg(f, 'A', P.w0, P.w1), C = compAgg(f, P), L = agg(f, 'L', P.w0, P.w1), T = agg(f, 'T', P.w0, P.w1);
  const FA = agg(f, 'A', 1, NW), FT = agg(f, 'T', 1, NW);
  const R4 = agg(f, 'A', CW - 3, CW), R4c = state.comp === 'L' ? agg(f, 'L', CW - 3, CW) : agg(f, 'T', CW - 3, CW);
  const P4 = agg(f, 'A', CW - 7, CW - 4), P4c = state.comp === 'L' ? agg(f, 'L', CW - 7, CW - 4) : agg(f, 'T', CW - 7, CW - 4);
  const [s0, s1] = shareWin(P); const sh = K.share(f, s0, s1);
  return { f, A, C, L, T, FA, FT, R4, R4c, P4, P4c, sh, shWin: [s0, s1] };
}
const signalsFor = f => K.SIGNALS.filter(x => (x.c === '*' || !f.c || f.c.includes(x.c)) && (!x.b || !f.b || f.b.includes(x.b)) && (!x.ch || !f.ch || f.ch.includes(x.ch)));
const retailersOf = (c, ch) => K.RETAILERS.filter(r => r.c === c && (!ch || r.ch === ch));

/* ================= exceptions engine (simulated AI: rules on synthetic data) ================= */
// role weighting of the shared exception ranking (decision 6.14)
const ROLE_BOOST = { CEO: { competitor: 1.5 }, CFO: { buying: 2, cost: 1.6 }, CMO: { competitor: 2, opportunity: 1.5, market: 1.3 }, CSO: { loading: 2, volume: 1.5, supply: 1.3, competitor: 1.3 }, COO: { supply: 3, loading: 1.3, cost: 1.3 } };
const OWNED = { 'bolt|UK': { status: 'Owned', note: 'Action due Wk 44' } };
function diagnose(f, S, P) {
  const nsV = vr(S.A.ns, S.C.ns), cmV = vr(S.A.ns - S.A.cogs - S.A.dist - S.A.ap, S.C.ns - S.C.cogs - S.C.dist - S.C.ap);
  const br = bridge(f, P, 'cm'), get = k => br.items.find(i => i[2] === k)[1];
  const fill4 = S.R4.fill, shChg = S.sh.chg * 100, mktG = S.sh.mktGrowth;
  const b = f.b && f.b.length === 1 ? f.b[0] : null, c = f.c && f.c.length === 1 ? f.c[0] : null;
  const sub_ = b ? K.BMAP[b].sub : null, cpi = c && sub_ ? K.compPriceIdx(c, sub_, CW) : 1;
  // dominant channel behind the gap (parent shown with child as cause)
  let child = null;
  if (!(f.ch && f.ch.length === 1)) for (const ch of channelsOf(f)) {
    const ff = { ...f, ch: [ch] }, a = agg(ff, 'A', P.w0, P.w1), cc = compAgg(ff, P), g = a.ns - cc.ns, va = a.vol / (state.comp === 'L' ? agg(ff, 'L', P.w0, P.w1).vol : cc.vol) - 1;
    if (!child || Math.abs(g) > Math.abs(child.g)) child = { ch, g, va, r4: agg(ff, 'A', CW - 3, CW).vol / agg(ff, 'L', CW - 3, CW).vol - 1 };
  }
  const chName = child ? K.CHMAP[child.ch].name : '';
  let cls = null;
  if (fill4 < .92) cls = 'supply';
  else if (vr(S.A.ns, S.L.ns) > .01 && cmV < -.02 && get('trade') < 0 && Math.abs(get('trade')) > Math.abs(br.end - br.start) * .5) cls = 'buying';
  else if (nsV < -.015 && shChg < -.5 && cpi < .95) cls = 'competitor';
  else if (nsV < -.02 && mktG < 0 && shChg >= 0) cls = 'market';
  else if (cmV < -.03 && Math.min(...br.items.map(i => i[1])) === get('cogs')) cls = 'cost';
  else if (nsV > .03 && cmV >= 0) cls = 'opportunity';
  else if (nsV < -.03) cls = 'volume';
  if (!cls) return null;
  const d = { cls, nsV, cmV, nsGap: S.A.ns - S.C.ns, cmGap: br.end - br.start, fyNs: S.FA.ns - S.FT.ns, fyCm: (S.FA.ns - S.FA.cogs - S.FA.dist - S.FA.ap) - (S.FT.ns - S.FT.cogs - S.FT.dist - S.FT.ap), shChg, br, child };
  const r4v = vr(S.R4.ns, S.R4c.ns), p4v = vr(S.P4.ns, S.P4c.ns);
  d.dir = r4v < p4v - .01 ? 'worse' : r4v > p4v + .01 ? 'better' : null;
  const B = b ? K.BMAP[b].name : nameOf(f);
  switch (cls) {
    case 'competitor': {
      const comp = K.COMPETITORS[sub_][0];
      d.label = 'Competitor action'; d.owner = 'CMO + ' + (c ? K.CMAP[c].name : '') + ' Sales';
      d.chain = [`${comp} price ${sPct(cpi - 1, 0)}`, `our ${chName.toLowerCase()} volume ${sPct(child.r4, 0)}`, `share ${sPts(shChg)}`, `net sales ${s$(d.nsGap)}`];
      d.cause = `Likely driver: ${comp} cut prices in ${chName.toLowerCase()} while the category grew ${sPct(mktG)}, so the loss appears to be share, not market.`;
      d.action = `Counter ${comp} in ${chName.toLowerCase()} with a price-pack at parity and stronger visibility, rather than a blanket price cut.`;
      d.value = Math.abs(d.fyCm) * .5; break;
    }
    case 'buying': {
      const trA = S.A.tr / S.A.gs, trC = S.C.tr / S.C.gs, gmA = (S.A.ns - S.A.cogs) / S.A.ns, gmL = (S.L.ns - S.L.cogs) / S.L.ns;
      const promo = K.PROMOS.filter(p => p.b === b && p.c === c && p.roi != null).sort((x, y) => x.roi - y.roi)[0];
      d.label = 'Promotion-funded growth'; d.owner = 'CFO (RGM)';
      d.chain = [`trade spend ${pct1(trA)} vs ${pct1(trC)} plan`, `volume ${sPct(S.A.vol / S.L.vol - 1, 0)} vs LY`, `net sales ${sPct(vr(S.A.ns, S.L.ns))} vs LY`, `gross margin ${sBps((gmA - gmL) * 1e4)} vs LY`];
      d.cause = `Likely driver: deep promotions${promo ? ` (worst: "${promo.name}", ROI ${promo.roi.toFixed(2)}x)` : ''} are buying volume at the expense of margin.`;
      d.action = `Cap promotion depth back to plan and stop events below 0.8x ROI; move spend to multibuy and display mechanics.`;
      d.value = Math.abs(get('trade')) * .6; break;
    }
    case 'cost': {
      d.label = 'Input-cost inflation'; d.owner = 'CFO + Procurement';
      const cc = S.A.cogs / S.A.vol / (S.C.cogs / S.C.vol) - 1;
      d.chain = [`${K.BMAP[b || 'oats'].mat.toLowerCase()} cost ${sPct(.18, 0)}`, `cost per case ${sPct(cc, 0)} vs ${compName()}`, `price increase delayed at key retailers`, `contribution margin ${s$(d.cmGap)}`];
      d.cause = `Likely driver: commodity inflation has not yet been recovered through price; retailer delays held back the planned increase.`;
      d.action = `Complete the price increase at the delayed retailers and extend hedge cover into H1; review pack-size options.`;
      d.value = Math.abs(d.fyCm) * .5; break;
    }
    case 'supply': {
      const breach = c ? retailersOf(c).filter(r => r.c === 'ID' && b === 'orchard' && (r.id === 'pp' || r.id === 'hn')) : [];
      d.label = 'Supply constraint'; d.owner = 'COO';
      d.chain = [`port disruption`, `fill rate ${pct1(fill4).replace('.0', '')}`, `lost sales ${fmt$(agg(f, 'A', 35, CW).lost)}`, `${breach.length} retailers below OTIF threshold`];
      d.cause = `Likely driver: inbound supply delays; demand is intact, so the gap appears to be lost sales rather than weaker consumers.`;
      d.action = `Expedite inbound supply, protect ${breach.map(r => r.name).join(' and ') || 'key accounts'}, and restore 95% fill within 3 weeks.`;
      d.value = agg(f, 'A', 35, CW).lost * 1.5; break;
    }
    case 'market': {
      d.label = 'Market decline'; d.owner = 'CFO + ' + (c ? K.CMAP[c].name : '') + ' GM';
      d.chain = [`category ${sPct(mktG)}`, `${B} ${sPct(vr(S.A.ns, S.L.ns))} vs LY`, `share ${sPts(shChg)}`, `market-driven miss`];
      d.cause = `Likely driver: the category itself is shrinking; we are holding or gaining share, so execution does not appear to be the issue.`;
      d.action = `Re-base the target for this market and protect share without deeper promotions.`;
      d.value = 0; break;
    }
    case 'opportunity': {
      const s0 = K.SERIES.find(s => s.b === b && s.c === c && s.ch === (child && child.ch)), days = b && c ? K.invDays(c, b, CW) : null;
      d.label = 'Opportunity'; d.owner = 'CMO + COO';
      d.chain = [`${chName.toLowerCase()} ${sPct(child.r4, 0)} vs LY`, s0 ? `marketing ROI ${s0.romi.toFixed(1)}x` : `share ${sPts(shChg)}`, days ? `inventory ${days.toFixed(0)} days vs ${K.INV_TARGET_DAYS} target` : `FY ${s$(d.fyNs)}`];
      d.cause = `Likely driver: strong ${chName.toLowerCase()} demand with high marketing returns; supply cover may limit the upside.`;
      d.action = `Shift A&P toward ${chName.toLowerCase()} and secure supply ahead of the seasonal peak.`;
      d.value = Math.abs(d.fyNs) * .3; break;
    }
    default: {
      d.label = 'Volume shortfall'; d.owner = 'Chief Sales Officer';
      d.chain = [`volume ${sPct(S.A.vol / S.C.vol - 1)}`, `share ${sPts(shChg)}`, `net sales ${s$(d.nsGap)}`];
      d.cause = `Likely driver: weaker distribution or execution; check availability and promotion compliance.`;
      d.action = `Review distribution, out-of-stocks and in-store execution with the country team.`;
      d.value = Math.abs(d.fyNs) * .3;
    }
  }
  const worst = Math.min(nsV, cmV);
  d.sev = cls === 'opportunity' ? 'opp' : cls === 'market' ? 'warn' : worst <= -.06 || (cls === 'supply' && worst <= -.04) ? 'crit' : 'warn';
  return d;
}
function exceptions(base, P) {
  const out = [];
  for (const b of brandsOf(base)) for (const c of countriesOf(base)) {
    const f = sub(base, { b: [b], c: [c] }); if (!has(f)) continue;
    const S = slice(f, P); if (S.C.ns <= 0) continue;
    const d = diagnose(f, S, P); if (!d) continue;
    if (Math.abs(d.nsGap) < 5e5 && Math.abs(d.cmGap) < 5e5 && d.cls !== 'supply') continue;
    out.push({ id: b + '|' + c, f, S, d, title: K.BMAP[b].name + ' · ' + K.CMAP[c].name });
  }
  // merge the same cause on the same brand across countries into one parent (e.g. oat inflation)
  const merged = [];
  for (const e of out) {
    const twin = merged.find(m => m.d.cls === e.d.cls && e.d.cls === 'cost' && m.f.b[0] === e.f.b[0]);
    if (twin) { twin.children = (twin.children || [twin.f.c[0]]).concat(e.f.c[0]); continue; }
    merged.push(e);
  }
  for (const m of merged) if (m.children) {
    m.f = sub(base, { b: m.f.b, c: m.children }); m.S = slice(m.f, P); const d = diagnose(m.f, m.S, P) || m.d; d.label = m.d.label; m.d = { ...m.d, ...d, cls: 'cost', label: 'Input-cost inflation', owner: 'CFO + Procurement', chain: m.d.chain.map((x, i) => i === 3 ? `contribution margin ${s$(d.cmGap)}` : x), sev: d.sev === 'opp' ? 'warn' : m.d.sev };
    m.title = K.BMAP[m.f.b[0]].name + ' · ' + (m.children.length === countriesOf(base).length && m.children.length > 2 ? 'all markets' : m.children.map(c => K.CMAP[c].name).join(' & ')); m.id = m.f.b[0] + '|' + m.children.join('+');
  }
  // channel loading: country x channel where channel cover is well above normal
  for (const c of countriesOf(base)) for (const ch of channelsOf(sub(base, { c: [c] }))) {
    const f = sub(base, { c: [c], ch: [ch] }), w = agg(f, 'A', CW, CW), cover = w.stock / w.cons, normal = K.CHMAP[ch].cover;
    if (cover > normal * 1.3) {
      const S = slice(f, P), r4 = agg(f, 'A', CW - 3, CW);
      out.length; merged.push({ id: c + '|' + ch, f, S, title: K.CMAP[c].name + ' · ' + K.CHMAP[ch].name, d: {
        cls: 'loading', label: 'Channel loading', owner: 'Chief Sales Officer', sev: 'warn', dir: 'worse', nsGap: S.A.ns - S.C.ns, cmGap: 0, fyNs: S.FA.ns - S.FT.ns, fyCm: 0, br: bridge(f, P, 'cm'),
        chain: [`shipments ${sPct(r4.vol / r4.cons - 1, 0)} above shopper purchases`, `channel cover ${cover.toFixed(1)} weeks vs ${normal} normal`, `near-expiry stock ${fmt$(K.NEAR_EXPIRY.channel[c] || 0)}`],
        cause: 'Likely driver: a distributor incentive pushed stock ahead of demand; expect lower orders and higher returns in the coming weeks.',
        action: 'Stop the distributor push, let cover return to normal and pre-empt near-expiry returns with targeted sell-out support.',
        value: K.NEAR_EXPIRY.channel[c] || 0 } });
    }
  }
  const boost = ROLE_BOOST[state.role] || {};
  for (const e of merged) {
    const wNs = state.role === 'CFO' ? .5 : 1, wCm = state.role === 'CFO' ? 2 : 1.5;
    e.score = Math.abs(e.d.fyNs) * wNs + Math.abs(e.d.fyCm) * wCm + (e.d.cls === 'loading' ? e.d.value * 2 : 0) + (e.d.cls === 'supply' ? e.d.value * 2 : 0);
    if (e.d.dir === 'worse') e.score *= 1.3;
    e.score *= boost[e.d.cls] || 1;
    e.owned = OWNED[e.id];
  }
  return merged.sort((a, b) => b.score - a.score);
}

/* ================= charts (inline SVG, theme tokens) ================= */
const NS_ = 'http://www.w3.org/2000/svg';
function ticks(lo, hi, n = 4) { const span = hi - lo || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))); const st = [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => span / x <= n) || mag * 10; const t = []; for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) t.push(v); return t; }
const tip = () => $('#tip');
function showTip(e, html) { const t = tip(); t.innerHTML = html; t.hidden = false; const r = t.getBoundingClientRect(); let x = e.clientX + 14, y = e.clientY + 14; if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14; if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14; t.style.left = Math.max(8, x) + 'px'; t.style.top = Math.max(8, y) + 'px'; }
const hideTip = () => { tip().hidden = true; };
function lineChart(el, o) {
  if (!el) return;
  const W = Math.max(280, el.clientWidth || 520), H = o.h || 200, M = { l: 54, r: 14, t: 12, b: 24 }, pw = W - M.l - M.r, ph = H - M.t - M.b;
  let lo = Infinity, hi = -Infinity; o.series.forEach(s => { for (let w = s.from; w <= s.to; w++) { const v = s.vals[w]; if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } } });
  if (o.zero) lo = Math.min(0, lo); const pad = (hi - lo) * .1 || 1; if (!o.zero) lo -= pad; hi += pad;
  const X = w => M.l + (w - o.x0) / (o.x1 - o.x0) * pw, Y = v => M.t + (1 - (v - lo) / (hi - lo)) * ph;
  let g = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(o.aria || 'trend')}">`;
  if (o.band) g += `<rect x="${X(o.band[0] - .5)}" y="${M.t}" width="${Math.max(3, X(o.band[1] + .5) - X(o.band[0] - .5))}" height="${ph}" fill="var(--accent)" opacity=".06"/>`;
  ticks(lo, hi, 4).forEach(t => { g += `<line x1="${M.l}" x2="${W - M.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)"/><text x="${M.l - 8}" y="${Y(t) + 3.5}" text-anchor="end" class="ax">${o.yfmt(t)}</text>`; });
  let last = -1; for (let w = o.x0; w <= o.x1; w++) { const mo = monthOf(w); if (mo !== last) { last = mo; if (X(w) < W - M.r - 16) g += `<text x="${X(w)}" y="${H - 6}" class="ax">${K.weekEnd(w).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}</text>`; } }
  if (o.today && o.today < o.x1) g += `<line x1="${X(o.today)}" x2="${X(o.today)}" y1="${M.t}" y2="${M.t + ph}" stroke="var(--line-2)" stroke-dasharray="2 3"/><text x="${X(o.today) + 4}" y="${M.t + 10}" class="ax">Forecast →</text>`;
  (o.markers || []).forEach(m => { g += `<line x1="${X(m.w)}" x2="${X(m.w)}" y1="${M.t}" y2="${M.t + ph}" stroke="var(--opp)" stroke-dasharray="3 3" opacity=".7"/><circle cx="${X(m.w)}" cy="${M.t + 4}" r="4" fill="var(--opp)"><title>${esc(m.text)}</title></circle>`; });
  o.series.forEach(s => {
    if (s.range) { let up = '', dn = ''; for (let w = s.from; w <= s.to; w++) { up += (w === s.from ? 'M' : 'L') + X(w) + ' ' + Y(s.range[1][w]); } for (let w = s.to; w >= s.from; w--) dn += 'L' + X(w) + ' ' + Y(s.range[0][w]); g += `<path d="${up}${dn}Z" fill="${s.color}" opacity=".12"/>`; }
    let d = ''; for (let w = s.from; w <= s.to; w++) if (isFinite(s.vals[w])) d += (d ? 'L' : 'M') + X(w).toFixed(1) + ' ' + Y(s.vals[w]).toFixed(1);
    if (s.area) g += `<path d="${d} L${X(s.to)} ${M.t + ph} L${X(s.from)} ${M.t + ph}Z" fill="${s.color}" opacity=".07"/>`;
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.w || 2}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    if (s.end) g += `<circle cx="${X(s.to)}" cy="${Y(s.vals[s.to])}" r="3.5" fill="${s.color}" stroke="#fff" stroke-width="2"/>`;
    if (s.label) g += `<text x="${Math.min(X(s.to) + 6, W - M.r - 2)}" y="${Y(s.vals[s.to]) + 3.5}" class="ax lbl" text-anchor="${X(s.to) + 60 > W ? 'end' : 'start'}">${esc(s.label)}</text>`;
  });
  g += `<line class="xh" x1="0" x2="0" y1="${M.t}" y2="${M.t + ph}" stroke="var(--ink-2)" opacity="0"/><rect class="hit" x="${M.l}" y="${M.t}" width="${pw}" height="${ph}" fill="transparent"/></svg>`;
  el.innerHTML = g;
  const svg = el.querySelector('svg'), xh = svg.querySelector('.xh'), hit = svg.querySelector('.hit');
  if (o.tip) { hit.addEventListener('mousemove', e => { const r = svg.getBoundingClientRect(); let w = Math.round(o.x0 + ((e.clientX - r.left) * W / r.width - M.l) / pw * (o.x1 - o.x0)); w = Math.max(o.x0, Math.min(o.x1, w)); xh.setAttribute('x1', X(w)); xh.setAttribute('x2', X(w)); xh.setAttribute('opacity', .4); showTip(e, o.tip(w)); }); hit.addEventListener('mouseleave', () => { xh.setAttribute('opacity', 0); hideTip(); }); }
}
function waterfall(el, br, opts = {}) {
  if (!el) return;
  const W = Math.max(300, el.clientWidth || 460), H = opts.h || 230, M = { l: 6, r: 6, t: 22, b: 30 };
  const its = [{ l: opts.startLabel || ({ T: 'Target', L: 'Last year', M: 'Last month' })[state.comp], v: br.start, t: 'tot' }]; let run = br.start; const lv = [run];
  br.items.forEach(([l, v, k]) => { its.push({ l: l.replace('Trade & promo', 'Trade').replace('Cost of goods', 'COGS').replace('Distribution', 'Distrib.'), v, t: 'd', from: run, to: run + v, k, full: l }); run += v; lv.push(run); });
  its.push({ l: opts.endLabel || 'Actual', v: br.end, t: 'tot' }); lv.push(br.end);
  const F = opts.fmt || fmt$, SF = opts.sfmt || (v => (v >= 0 ? '+' : MINUS) + fmt$(Math.abs(v))), upBad = !!opts.costUp;
  let lo = Math.min(...lv), hi = Math.max(...lv); const rg = (hi - lo) || Math.abs(hi) * .1 || 1; lo -= rg * .5; hi += rg * .25;
  const pw = W - M.l - M.r, ph = H - M.t - M.b, bw = pw / its.length, Y = v => M.t + (1 - (v - lo) / (hi - lo)) * ph;
  let g = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Variance bridge"><line x1="${M.l}" x2="${W - M.r}" y1="${M.t + ph}" y2="${M.t + ph}" stroke="var(--line-2)"/>`;
  its.forEach((it, i) => {
    const cx = M.l + bw * i + bw / 2, w = Math.min(40, bw * .6), x = cx - w / 2; let y0, y1, fill, lab;
    if (it.t === 'tot') { y0 = Y(it.v); y1 = M.t + ph; fill = i === 0 ? '#b9bfc7' : 'var(--ink)'; lab = F(it.v); } else { y0 = Y(Math.max(it.from, it.to)); y1 = Y(Math.min(it.from, it.to)); fill = (it.v >= 0) !== upBad ? 'var(--s1)' : 'var(--neg)'; lab = SF(it.v); }
    const fs = bw < 46 ? 9.5 : 10.5;
    g += `<g class="wf" data-i="${i}" ${it.t === 'd' && opts.onClick ? 'tabindex="0" role="button" style="cursor:pointer"' : ''}><rect x="${cx - bw / 2}" y="${M.t}" width="${bw}" height="${ph}" fill="transparent"/><rect x="${x}" y="${y0}" width="${w}" height="${Math.max(1.5, y1 - y0)}" rx="3" fill="${fill}"/><text x="${cx}" y="${y0 - 6}" text-anchor="middle" class="ax ${it.t === 'tot' ? 'strong' : 'lbl'}" style="font-size:${fs}px">${lab}</text><text x="${cx}" y="${H - 10}" text-anchor="middle" class="ax" style="font-size:${fs}px">${esc(it.l)}</text></g>`;
    if (i < its.length - 1) { const yy = Y(it.t === 'tot' ? it.v : it.to); g += `<line x1="${x + w}" x2="${M.l + bw * (i + 1) + bw / 2 - w / 2}" y1="${yy}" y2="${yy}" stroke="var(--line-2)" stroke-dasharray="2 2"/>`; }
  });
  g += `<path d="M${M.l + bw / 2 - 9} ${M.t + ph - 8} l4.5 -4 l4.5 4 l4.5 -4 l4.5 4" stroke="#fff" stroke-width="3" fill="none"/></svg>`;
  el.innerHTML = g;
  el.querySelectorAll('.wf').forEach(n => { const it = its[+n.dataset.i];
    n.addEventListener('mousemove', e => showTip(e, `<div class="th">${esc(it.t === 'tot' ? it.l : it.full + ' effect')}</div><div class="num">${it.t === 'tot' ? F(it.v) : SF(it.v)}</div>${it.t === 'd' && opts.onClick ? '<div class="f">Click to see contributors</div>' : ''}`));
    n.addEventListener('mouseleave', hideTip);
    if (it.t === 'd' && opts.onClick) { const go = () => { hideTip(); opts.onClick(it); }; n.addEventListener('click', go); n.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); } });
}
function divBars(rows, fmt, opts = {}) {   // sorted diverging horizontal bars (HTML)
  const mx = Math.max(...rows.map(r => Math.abs(r.v)), 1e-9);
  return `<div class="dbars">${rows.map((r, i) => `<div class="dbar ${opts.click ? 'click' : ''}" data-i="${i}" ${opts.click ? 'tabindex="0" role="button"' : ''}><span class="dl">${esc(r.label)}</span><span class="dt"><span class="mid"></span><span class="b ${r.v >= 0 ? 'pos' : 'neg'}" style="${r.v >= 0 ? 'left:50%' : 'right:50%'};width:${Math.abs(r.v) / mx * 48}%"></span></span><span class="dvv num ${r.v >= 0 ? 'fav' : 'unf'}">${fmt(r.v)}</span></div>`).join('')}</div>`;
}
function dumbbell(rows, opts = {}) {   // market (ring) vs us (dot); value labels on the right
  const vals = rows.flatMap(r => [r.a, r.b]); let lo = Math.min(-.02, ...vals) - .01, hi = Math.max(.06, ...vals) + .01;
  const W = opts.W || 300, rh = opts.rh || 24, H = rows.length * rh + 18, L = 84, Rr = 56, X = v => L + (v - lo) / (hi - lo) * (W - L - Rr);
  let g = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="fx" role="img" aria-label="Our growth vs market growth">`;
  ticks(lo, hi, 3).forEach(t => g += `<line x1="${X(t)}" x2="${X(t)}" y1="2" y2="${H - 16}" stroke="${Math.abs(t) < 1e-9 ? 'var(--line-2)' : 'var(--line)'}"/><text x="${X(t)}" y="${H - 4}" text-anchor="middle" class="ax">${(t * 100).toFixed(0)}%</text>`);
  rows.forEach((r, i) => { const y = 4 + i * rh + rh / 2, gain = r.b >= r.a; g += `<g class="dbr" data-i="${i}" ${opts.click ? 'style="cursor:pointer" tabindex="0" role="button"' : ''}><rect x="0" y="${y - rh / 2}" width="${W}" height="${rh}" fill="transparent"/><text x="${L - 8}" y="${y + 3.5}" text-anchor="end" class="ax lbl">${esc(r.label)}</text><line x1="${X(r.a)}" x2="${X(r.b)}" y1="${y}" y2="${y}" stroke="var(--line-2)" stroke-width="2"/><circle cx="${X(r.a)}" cy="${y}" r="4.5" fill="#fff" stroke="var(--ink-2)" stroke-width="1.5"/><circle cx="${X(r.b)}" cy="${y}" r="5" fill="${gain ? 'var(--s1)' : 'var(--neg)'}" stroke="#fff" stroke-width="1.5"/><text x="${W - 2}" y="${y + 3.5}" text-anchor="end" class="ax" style="font-weight:600;fill:${gain ? 'var(--good-t)' : 'var(--crit-t)'}">${r.note}</text></g>`; });
  return g + '</svg>';
}
function rangePlot(lo, hi, cons, est, fmt, Wd) {   // guidance band, consensus tick, estimate dot
  const W = Wd || 300, H = 46, a = Math.min(lo, est, cons) * .985, b = Math.max(hi, est, cons) * 1.012, X = v => 10 + (v - a) / (b - a) * (W - 20);
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="fx" role="img" aria-label="Estimate vs guidance and consensus"><rect x="${X(lo)}" y="14" width="${X(hi) - X(lo)}" height="12" rx="6" fill="var(--surface-3)"/><text x="${(X(lo) + X(hi)) / 2}" y="10" text-anchor="middle" class="ax">Guidance ${fmt(lo)}–${fmt(hi)}</text><line x1="${X(cons)}" x2="${X(cons)}" y1="10" y2="30" stroke="var(--ink-2)" stroke-width="2"/><text x="${X(cons)}" y="42" text-anchor="middle" class="ax">Consensus ${fmt(cons)}</text><circle cx="${X(est)}" cy="20" r="6" fill="var(--crit)" stroke="#fff" stroke-width="2"/><text x="${X(est)}" y="42" text-anchor="${X(est) < 60 ? 'start' : 'middle'}" class="ax strong">Ours ${fmt(est)}</text></svg>`;
}
function spark(a, c) {
  const all = a.concat(c || []).filter(isFinite); let lo = Math.min(...all), hi = Math.max(...all); if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const X = i => 2 + i / (a.length - 1) * 196, Y = v => 26 - (v - lo) / (hi - lo) * 22, p = arr => arr.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join('');
  return `<svg class="spark" viewBox="0 0 200 28" preserveAspectRatio="none" aria-hidden="true">${c ? `<path d="${p(c)}" fill="none" stroke="#9aa1aa" stroke-width="1.2" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>` : ''}<path d="${p(a)} L${X(a.length - 1)} 28 L2 28Z" fill="var(--s1)" opacity=".08"/><path d="${p(a)}" fill="none" stroke="var(--s1)" stroke-width="1.8" vector-effect="non-scaling-stroke"/></svg>`;
}

/* ================= definitions (i) ================= */
const DEF = {
  AI: ['AI-generated', 'Written by rules from the numbers on this page (simulated AI in this prototype). Causes are likely drivers, not proven facts. In production: a language model grounded on the same metrics.', ''],
  Sh1: ['Net sales', 'Revenue kept after trade spend, discounts and returns (primary sales, our P&L top line).', 'Gross sales − trade spend − returns'],
  Sh2: ['Organic growth', 'Growth of the existing business vs last year, excluding currency and acquisitions. Split into volume and price/mix.', 'Net sales ÷ net sales LY − 1 = volume growth + price/mix'],
  Sh3: ['Operating profit', 'Profit after all operating costs, company total. Cannot be split by brand, country or channel without allocating overheads.', 'Contribution margin − overheads'],
  Sh4: ['Contribution margin', 'Profit each brand and market contributes before shared overheads. The profit number that follows the filters.', 'Gross margin − A&P − distribution costs'],
  Sh5: ['FY outlook', 'Where the full year is expected to land: actuals so far plus forecast for the remaining weeks.', 'YTD actual + forecast (Wk 42–52)'],
  Sh6: ['Value market share', 'Our share of category sales value from syndicated retail data (measured channels), with rank and change vs last year.', 'Our consumption value ÷ category value'],
  Sh7: ['Share price vs peers', 'Year-to-date change in our share price compared with a peer index of consumer goods companies. Company level only.', 'Our % change − peer index % change'],
  C1: ['Contribution to growth', 'How much each brand and market added to, or took from, total growth vs last year. Contributions add up to total growth.', 'Change in net sales of the slice ÷ total net sales LY'],
  C2: ['Growth vs market', 'Our consumption growth compared with category growth in each country. Ahead of the market means we are gaining share.', 'Our consumption growth − market growth'],
  C15: ['EPS outlook', 'Full-year earnings per share expected (actual + forecast), against our plan, our public guidance and analyst consensus.', '(Operating profit − interest) × (1 − tax rate) ÷ shares'],
  C4: ['Total shareholder return', 'Share price change plus dividends, year to date, compared with the peer group. Company level only.', '(Price change + dividends) ÷ starting price'],
};

/* ================= shared strip ================= */
function stripTile(id, label, value, delta, sev, sub_, tagTxt) {
  return `<button class="st" data-open="${id}" aria-label="${label}: open detail">
    <span class="l"><span>${label}</span><span class="info" data-def="${id}" aria-hidden="true">i</span></span>
    <span class="v num">${value}</span><span class="d num">${delta}</span>
    <span class="pills">${sevPill(sev)}${tagTxt ? metaPill(tagTxt) : ''}</span>
    <span class="s num">${sub_}</span></button>`;
}
function rankText(f) {
  let lead = 0, n = 0, single = null;
  for (const c of countriesOf(f)) for (const b of brandsOf(f)) {
    const m = K.MKT[c + '|' + K.BMAP[b].sub], sh = K.share({ c: [c], b: [b] }, K.MKT_LAST - 3, K.MKT_LAST).now;
    const others = [m.comp1A[K.MKT_LAST], m.shareLY[2], m.shareLY[3]], rank = 1 + others.filter(x => x > sh).length; n++; if (rank === 1) lead++;
    single = { rank, leader: Math.max(...others), sh };
  }
  if (n === 1) return single.rank === 1 ? `#1 · ${(single.sh / single.leader).toFixed(1)}x next brand` : `#${single.rank} · leader at ${pct1(single.leader)}`;
  return `#1 in ${lead} of ${n} category-markets`;
}
function stripData() {
  const f = filter(), P = win(), A = agg(f, 'A', P.w0, P.w1), C = compAgg(f, P), L = agg(f, 'L', P.w0, P.w1), T = agg(f, 'T', P.w0, P.w1);
  const opW1 = P.w1 > CW ? 52 : P.w1;
  const opA = K.finance({}, 'A', P.w0, opW1), opC = state.comp === 'M' ? K.finance({}, 'A', Math.max(1, P.w0 - 4), Math.max(1, P.wa - 4)) : K.finance({}, state.comp, P.w0, opW1);
  const FA = agg(f, 'A', 1, NW), FT = agg(f, 'T', 1, NW), fyA = K.finance({}, 'A', 1, NW), fyT = K.finance({}, 'T', 1, NW);
  const sh = K.share(f, K.MKT_LAST - 3, K.MKT_LAST), sp = K.SHARE_PRICE, us = sp.us[CW] / sp.start - 1, peer = sp.peer[CW] / 100 - 1;
  return { f, P, A, C, L, T, opA, opC, FA, FT, fyA, fyT, sh, us, peer, cmA: A.cm, cmC: C.cm };
}
function renderStrip() {
  const D = stripData(), { A, C, L, T, P } = D, tiles = [];
  const v1 = vr(A.ns, C.ns);
  tiles.push(stripTile('Sh1', 'Net sales', fmt$(A.ns), dv(v1, 'pct', 1, compShort()), sevOf(v1, 'pct'), state.comp === 'L' ? 'vs target ' + sPct(vr(A.ns, T.ns)) : 'vs LY ' + sPct(vr(A.ns, L.ns))));
  const g = A.ns / L.ns - 1, gPlan = T.ns / L.ns - 1, volG = A.vol / L.vol - 1;
  tiles.push(stripTile('Sh2', 'Organic growth', sPct(g), dv((g - gPlan) * 100, 'pts', 1, 'vs plan'), sevOf((g - gPlan) * 100, 'pts'), 'Volume ' + sPct(volG) + ' · price/mix ' + sPct(g - volG)));
  const v3 = vr(D.opA.op, D.opC.op);
  tiles.push(stripTile('Sh3', 'Operating profit', fmt$(D.opA.op), dv(v3, 'pct', 1, compShort()), sevOf(v3, 'pct'), 'Margin ' + pct1(D.opA.op / D.opA.ns), P.wa > 39 && P.w1 <= CW ? 'Company · Sep close + Oct est.' : 'Company total'));
  const v4 = vr(A.cm, C.cm);
  tiles.push(stripTile('Sh4', 'Contribution margin', fmt$(A.cm), dv(v4, 'pct', 1, compShort()), sevOf(v4, 'pct'), 'Margin ' + pct1(A.cm / A.ns) + ' of net sales'));
  const v5 = vr(D.FA.ns, D.FT.ns), eps = D.fyA.eps, g5 = K.FIN.guidance.eps, guide = eps < g5[0] ? 'Below guidance' : eps > g5[1] ? 'Above guidance' : 'Within guidance';
  tiles.push(stripTile('Sh5', 'FY outlook', fmt$(D.FA.ns), dv(v5, 'pct', 1, 'vs FY target'), sevOf(v5, 'pct'), 'EPS $' + eps.toFixed(2) + ' · guidance $' + g5[0].toFixed(2) + '–' + g5[1].toFixed(2), guide));
  const chg = D.sh.chg * 100;
  tiles.push(stripTile('Sh6', 'Market share', pct1(D.sh.now), dv(chg, 'pts', 1, 'vs LY'), sevOf(chg, 'pts'), rankText(D.f), '4 wks to 20 Sep'));
  const d7 = (D.us - D.peer) * 100;
  tiles.push(stripTile('Sh7', 'Share price vs peers', '$' + K.SHARE_PRICE.us[CW].toFixed(2), dv(d7, 'pts', 1, 'vs peers YTD'), d7 >= -2 ? 'good' : d7 >= -5 ? 'warn' : 'crit', 'Us ' + sPct(D.us) + ' · peers ' + sPct(D.peer), 'Company · as of 11 Oct'));
  $('#strip').innerHTML = tiles.join('');
}

/* ================= CEO view ================= */
function ceoTiles(f, P) {
  const tiles = [], TW = TWid();
  // C2 growth vs market by country (outside-in first)
  const [s0, s1] = shareWin(P);
  const rows = countriesOf(f).filter(c => has(sub(f, { c: [c] }))).map(c => { const sh = K.share(sub(f, { c: [c] }), s0, s1); return { c, label: K.CMAP[c].name, a: sh.mktGrowth, b: sh.ourGrowth, chg: sh.chg * 100, note: sPts(sh.chg * 100).replace(' pts', '') }; }).sort((a, b) => a.chg - b.chg);
  const ahead = rows.filter(r => r.chg >= 0).length, worstR = rows[0];
  tiles.push({ id: 'C2', label: 'Growth vs market', value: `Ahead in ${ahead} of ${rows.length}`, sev: ahead >= rows.length / 2 ? (ahead === rows.length ? 'good' : 'warn') : 'crit',
    delta: `<span class="dv neu">Share by country</span> <small class="muted">· Wk ${s0}–${s1}</small>`,
    cause: worstR && worstR.chg < 0 ? `Weakest: ${worstR.label} share ${sPts(worstR.chg)} while its market grew ${sPct(worstR.a)}.` : 'Gaining or holding share in every country.',
    body: dumbbell(rows, { rh: 22, W: TW }) + '<div class="legend"><span><i class="ring"></i>Market growth</span><span><i class="dot" style="background:var(--s1)"></i>Us, gaining share</span><span><i class="dot" style="background:var(--neg)"></i>Us, losing share</span><span>Right: share change, pts</span></div>' });
  // C1 contribution to growth
  const Ltot = agg(f, 'L', P.w0, P.w1).ns, Atot = agg(f, 'A', P.w0, P.w1).ns, contrib = [];
  for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const ff = sub(f, { b: [b], c: [c] }); if (!has(ff)) continue; contrib.push({ b, c, label: K.BMAP[b].name.split(' ')[0] + ' · ' + c, v: (agg(ff, 'A', P.w0, P.w1).ns - agg(ff, 'L', P.w0, P.w1).ns) / Ltot }); }
  contrib.sort((a, b) => b.v - a.v); const top = contrib.slice(0, 3).concat(contrib.slice(-2).reverse().filter(x => !contrib.slice(0, 3).includes(x)));
  const growth = Atot / Ltot - 1, plan = agg(f, 'T', P.w0, P.w1).ns / Ltot - 1;
  tiles.push({ id: 'C1', label: 'Contribution to growth', value: sPct(growth), sev: sevOf((growth - plan) * 100, 'pts'), delta: dv((growth - plan) * 100, 'pts', 1, 'vs plan growth'),
    cause: `${K.BMAP[contrib[0].b].name} ${K.CMAP[contrib[0].c].name} adds most ${sPts(contrib[0].v * 100)}; ${K.BMAP[contrib[contrib.length - 1].b].name} ${K.CMAP[contrib[contrib.length - 1].c].name} subtracts most ${sPts(contrib[contrib.length - 1].v * 100)}.`,
    body: divBars(top.map(t => ({ label: t.label, v: t.v * 100 })), v => sPts(v).replace(' pts', ''), {}) + '<div class="legend"><span>Top adders and subtractors · pts of growth vs LY</span></div>' });
  // C15 EPS outlook vs plan / guidance / consensus (company level)
  const fyA = K.finance({}, 'A', 1, NW), fyT = K.finance({}, 'T', 1, NW), ytdA = K.finance({}, 'A', 1, Math.min(39, CW)), ytdT = K.finance({}, 'T', 1, Math.min(39, CW)), g = K.FIN.guidance.eps, cons = K.FIN.consensus.eps;
  tiles.push({ id: 'C15', label: 'Net profit · EPS outlook', value: '$' + fyA.eps.toFixed(2), sev: sevOf(vr(fyA.eps, fyT.eps), 'pct'), delta: dv(fyA.eps - fyT.eps, 'eps', 1, 'vs plan $' + fyT.eps.toFixed(2)),
    tag: fyA.eps < g[0] ? 'Below guidance' : 'Within guidance',
    cause: `$${(cons - fyA.eps).toFixed(2)} below consensus and $${(g[0] - fyA.eps).toFixed(2)} below the bottom of guidance. Net profit YTD ${fmt$(ytdA.np)} ${sPct(vr(ytdA.np, ytdT.np))} vs target.`,
    body: rangePlot(g[0], g[1], cons, fyA.eps, v => '$' + v.toFixed(2), TW) });
  // C4 TSR vs peers
  const sp = K.SHARE_PRICE, yld = K.FIN.dividendYield * CW / 52, tsr = sp.us[CW] / sp.start - 1 + yld, ptsr = sp.peer[CW] / 100 - 1 + .028 * CW / 52;
  const ia = [], ip = []; for (let w = CW - 12; w <= CW; w++) { ia.push(sp.us[w] / sp.start * 100); ip.push(sp.peer[w]); }
  tiles.push({ id: 'C4', label: 'Total shareholder return', value: sPct(tsr), sev: (tsr - ptsr) * 100 >= -2 ? 'good' : (tsr - ptsr) * 100 >= -5 ? 'warn' : 'crit', delta: dv((tsr - ptsr) * 100, 'pts', 1, 'vs peers ' + sPct(ptsr)), tag: 'Company · YTD',
    cause: 'The gap opened after the Q2 results (Wk 30) as margin worries grew; it has not closed since.',
    body: spark(ia, ip) + '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>Us (indexed)</span><span><i class="dash"></i>Peer index</span><span>Last 13 weeks</span></div>' });
  return tiles;
}
function tileHtml(t) {
  return `<button class="t1" data-open="${t.id}" aria-label="${esc(t.label)}: open detail">
    <span class="l"><span>${esc(t.label)}</span><span class="info" data-def="${t.id}" aria-hidden="true">i</span></span>
    <span class="row"><span class="v num">${t.value}</span><span class="pills">${sevPill(t.sev)}${t.dir ? dirPill(t.dir) : ''}${t.tag ? metaPill(t.tag) : ''}</span></span>
    <span class="d num">${t.delta}</span>
    <span class="cause">${aiTag} ${esc(t.cause)}</span>
    <span class="body">${t.body}</span></button>`;
}
function briefing(ex, D) {
  const nsV = vr(D.A.ns, D.C.ns), cmV = vr(D.A.cm, D.C.cm), eps = D.fyA.eps, g = K.FIN.guidance.eps;
  const st = Math.min(nsV, cmV) < -.03 || eps < g[0] ? (Math.min(nsV, cmV) < -.05 ? 'crit' : 'warn') : 'good';
  const neg = ex.filter(e => e.d.sev !== 'opp').slice(0, 3), opp = ex.find(e => e.d.sev === 'opp');
  const l1 = `${D.P.label} net sales ${dvTxt(nsV)} ${compShort()} and contribution margin ${dvTxt(cmV)}; FY EPS outlook $${eps.toFixed(2)} is ${eps < g[0] ? 'below' : 'within'} guidance.`;
  const l2 = neg.length ? `Likely drivers: ${neg.map(e => `${e.d.label.toLowerCase()} in ${e.title}`).join('; ')}.` : 'No material negative drivers in this scope.';
  const l3 = `Focus: ${neg.slice(0, 2).map(e => `${e.d.owner} on ${e.title.split(' · ')[0]}`).join('; ')}${opp ? `; scale ${opp.title}` : ''}.`;
  return `<div class="brief-h">${sevPill(st)} ${aiTag}<span class="muted">Briefing for ${ROLES[state.role].label}</span></div>
    <ol class="brief"><li><b>Status</b><span>${esc(l1)}</span></li><li><b>Why</b><span>${esc(l2)}</span></li><li><b>Action</b><span>${esc(l3)}</span></li></ol>
    <div class="fb"><button class="link" data-fb="brief">Not useful</button></div>`;
}
const dvTxt = v => sPct(v);
function exRow(e, i) {
  return `<li><button class="ex" data-ex="${esc(e.id)}"><span class="rk num">${i + 1}</span>
    <span class="et"><b>${esc(e.title)}</b><span class="pills">${sevPill(e.d.sev)}${dirPill(e.d.dir)}</span></span>
    <span class="eg num">${dv(e.d.nsGap, '$', 1, 'net sales')} · ${dv(e.d.cmGap, '$', 1, 'margin')} · FY ${s$(e.d.fyNs)}</span>
    <span class="ec">${e.d.chain.map(esc).join(' <i>→</i> ')}</span>
    <span class="eo"><span>${esc(e.d.label)} · Owner: ${esc(e.d.owner)}</span>${e.owned ? `<span class="pill own">● ${e.owned.status} · ${e.owned.note}</span>` : '<span class="pill new">New</span>'}</span></button></li>`;
}
const ACT = {};
function actionsHtml(ex) {
  const due = { crit: 'This week', warn: 'Next 2 weeks', opp: 'This month' };
  const rows = ex.slice(0, 5);
  return `<div class="tbl-wrap"><table class="t"><thead><tr><th>#</th><th>Recommended action</th><th>Why</th><th>Owner</th><th class="r">Value at stake</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${rows.map((e, i) => {
    const st = ACT[e.id] || (e.owned ? 'Assigned' : 'Open');
    return `<tr><td class="num">${i + 1}</td><td style="min-width:260px">${aiTag} ${esc(e.d.action)}</td><td style="min-width:150px"><button class="link" data-ex="${esc(e.id)}">${esc(e.title)}</button><br>${sevPill(e.d.sev)}</td><td>${esc(e.d.owner)}</td><td class="r num"><b>${e.d.value ? fmt$(e.d.value) : 'Re-base'}</b></td><td>${due[e.d.sev]}</td><td><button class="status" data-act="${esc(e.id)}" data-s="${st}">${st}</button></td><td><button class="link muted" data-fb="${esc(e.id)}">Not useful</button></td></tr>`; }).join('')}</tbody></table></div>`;
}
function renderRole() {
  const f = filter(), P = win(), D = stripData(), ex = exceptions(f, P);
  window.__ex = ex;
  $('#brief').innerHTML = state.role === 'CFO' ? cfoBriefing(ex, D, f, P) : briefing(ex, D);
  const showAll = state.exAll;
  $('#exlist').innerHTML = (ex.slice(0, showAll ? ex.length : 5).map(exRow).join('') || '<li class="muted" style="padding:12px">No material exceptions in this scope.</li>')
    + (ex.length > 5 ? `<li class="more"><button class="link" id="ex-more">${showAll ? 'Show top 5 only' : 'See all ' + ex.length + ' exceptions'}</button></li>` : '');
  const mb = $('#ex-more'); if (mb) mb.onclick = () => { state.exAll = !state.exAll; renderRole(); };
  $('#ex-sub').textContent = state.role === 'CFO' ? 'Largest full-year margin impact first' : 'Largest full-year impact first';
  const tiles = state.role === 'CFO' ? cfoTiles(f, P) : ceoTiles(f, P); window.__tiles = tiles;
  $('#tiles').className = state.role === 'CFO' ? 'tiles three' : 'tiles two';
  $('#tiles').innerHTML = tiles.map(tileHtml).join('');
  $('#actions').innerHTML = actionsHtml(ex);
}
function renderPlaceholder() {
  const T = { CFO: 4, CMO: 5, CSO: 6, COO: 7, FH: 8 }[state.role];
  $('#brief').innerHTML = `<div class="ph"><b>AI briefing</b>${ROLES[state.role].label} briefing is built in step ${T}.</div>`;
  $('#exlist').innerHTML = `<li class="ph"><b>Exceptions</b>Role-weighted exceptions for ${ROLES[state.role].label} come in step ${T}.</li>`;
  $('#tiles').className = 'tiles'; $('#tiles').innerHTML = `<div class="ph" style="grid-column:1/-1;min-height:200px"><b>${ROLES[state.role].label} tier-1 tiles</b>Built in step ${T}.</div>`;
  $('#actions').innerHTML = `<div class="ph">Actions for ${ROLES[state.role].label} come in step ${T}.</div>`;
}

/* ================= drill panel ================= */
const drill = { stack: [] };
function openLevel(level, reset) { if (reset) drill.stack = []; drill.stack.push(level); paintDrill(); }
function paintDrill() {
  const lv = drill.stack[drill.stack.length - 1];
  $('#dr-crumbs').innerHTML = drill.stack.map((l, i) => i < drill.stack.length - 1 ? `<button class="link" data-crumb="${i}">${esc(l.crumb)}</button><i>›</i>` : `<span>${esc(l.crumb)}</span>`).join('');
  $('#dr-title').textContent = lv.title;
  $('#dr-body').innerHTML = (lv.insight ? `<p class="insight">${aiTag} ${esc(lv.insight)}</p>` : '') + lv.blocks.map(b => `<section class="blk">${b.h ? `<h4>${esc(b.h)}</h4>` : ''}${b.html || ''}${b.id ? `<div class="chart" id="${b.id}"></div>` : ''}${b.foot ? `<p class="foot">${esc(b.foot)}</p>` : ''}</section>`).join('') + (lv.focus ? `<div class="dr-act"><button class="btn primary" id="dr-focus">Focus dashboard on this</button></div>` : '');
  const panel = $('#drawer'); if (panel.hidden) { panel.hidden = false; $('#scrim').hidden = false; $('#dr-close').focus(); }
  $('#dr-body').scrollTop = 0;
  requestAnimationFrame(() => { lv.after && lv.after(); bindDrillClicks(lv); });
}
function bindDrillClicks(lv) {
  $('#dr-crumbs').querySelectorAll('[data-crumb]').forEach(b => b.onclick = () => { drill.stack = drill.stack.slice(0, +b.dataset.crumb + 1); paintDrill(); });
  $('#dr-body').querySelectorAll('[data-slice]').forEach(r => { const go = () => openSlice(JSON.parse(r.dataset.slice)); r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter') go(); }; });
  const fb = $('#dr-focus'); if (fb) fb.onclick = () => { focusOn(lv.focus); closeDrawer(); };
}
function closeDrawer() { $('#drawer').hidden = true; $('#scrim').hidden = true; hideTip(); }
function stats(arr) { return `<div class="stats">${arr.map(s => `<div class="stat"><span class="l">${esc(s[0])}</span><span class="v num">${s[1]}</span><span class="d num">${s[2] || ''}</span></div>`).join('')}</div>`; }
function weeklyNs(f) { const a = new Float64Array(NW + 1), t = new Float64Array(NW + 1), l = new Float64Array(NW + 1); for (let w = 1; w <= NW; w++) { a[w] = agg(f, 'A', w, w).ns; t[w] = agg(f, 'T', w, w).ns; l[w] = agg(f, 'L', w, w).ns; } return { a, t, l }; }
function nsTrend(id, f, P, markers) {
  const W = weeklyNs(f);
  return () => lineChart($('#' + id), { x0: 1, x1: NW, h: 190, band: [P.w0, P.wa], today: CW + .5, yfmt: fmt$, markers,
    series: [{ vals: W.l, from: 1, to: NW, color: '#b9bfc7', w: 1.5, dash: '1 3' }, { vals: W.t, from: 1, to: NW, color: '#7b828b', w: 1.5, dash: '5 3' }, { vals: W.a, from: 1, to: CW, color: 'var(--s1)', area: true, end: true }, { vals: W.a, from: CW, to: NW, color: 'var(--s1)', dash: '4 3' }],
    tip: w => `<div class="th">Wk ${w}${w > CW ? ' · forecast' : ''}</div>${trow(w > CW ? 'Forecast' : 'Actual', fmt$(W.a[w]))}${trow('Target', fmt$(W.t[w]) + ' ' + sPct(vr(W.a[w], W.t[w])))}${trow('Last year', fmt$(W.l[w]) + ' ' + sPct(vr(W.a[w], W.l[w])))}` });
}
const trow = (a, b) => `<div class="tr"><span>${a}</span><b class="num">${b}</b></div>`;
const LEG_TREND = '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>Actual</span><span><i class="dash" style="border-color:var(--s1)"></i>Forecast</span><span><i class="dash"></i>Target</span><span><i class="dash light"></i>Last year</span><span><i class="dot" style="background:var(--opp)"></i>External signal</span></div>';
function breakdownTable(rows, dims) {
  return `<div class="tbl-wrap"><table class="t"><thead><tr><th>${dims}</th><th class="r">Net sales</th><th class="r">${compShort()}</th><th class="r">vs LY</th><th class="r">Margin ${compShort()}</th></tr></thead><tbody>${rows.map(r => `<tr ${r.slice ? `class="click" tabindex="0" data-slice='${JSON.stringify(r.slice)}'` : ''}><td>${esc(r.label)}</td><td class="r num">${fmt$(r.a.ns)}</td><td class="r num">${dv(vr(r.a.ns, r.c.ns), 'pct', 1)}</td><td class="r num">${sPct(vr(r.a.ns, r.l.ns))}</td><td class="r num">${r.c.cm != null ? dv(vr(r.a.cm, r.c.cm), 'pct', 1) : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
function rowsBy(f, P, dim) {
  const P_ = P; const list = dim === 'ch' ? channelsOf(f).map(ch => ({ label: K.CHMAP[ch].name, ff: sub(f, { ch: [ch] }) })) : dim === 'c' ? countriesOf(f).map(c => ({ label: K.CMAP[c].name, ff: sub(f, { c: [c] }) })) : brandsOf(f).map(b => ({ label: K.BMAP[b].name, ff: sub(f, { b: [b] }) }));
  return list.filter(x => has(x.ff)).map(x => ({ label: x.label, a: agg(x.ff, 'A', P_.w0, P_.w1), c: compAgg(x.ff, P_), l: agg(x.ff, 'L', P_.w0, P_.w1), slice: x.ff })).sort((a, b) => vr(a.a.ns, a.c.ns) - vr(b.a.ns, b.c.ns));
}
function splitRows(names, weights, key, a, c, l) {   // illustrative SKU / city / retailer split (synthetic)
  let h = 2166136261; for (const ch of key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const r = () => { h = Math.imul(h ^ h >>> 13, 1597334677); return ((h >>> 0) % 1000) / 1000; };
  const e = weights.map(w => w * (1 + (r() - .5) * .2)), se = e.reduce((x, y) => x + y, 0), sw = weights.reduce((x, y) => x + y, 0);
  return names.map((n, i) => ({ label: n, a: { ns: a.ns * e[i] / se, cm: a.cm * e[i] / se }, c: { ns: c.ns * weights[i] / sw, cm: c.cm * weights[i] / sw }, l: { ns: l.ns * weights[i] / sw } }));
}
function sliceBlocks(f, P, opts = {}) {
  const A = agg(f, 'A', P.w0, P.w1), C = compAgg(f, P), L = agg(f, 'L', P.w0, P.w1), blocks = [];
  const br = bridge(f, P, 'cm');
  blocks.push({ h: 'Contribution margin bridge · ' + compName() + ' → actual', id: 'b-wf', foot: 'Click a bar to see which brands and markets drive it. Axis is truncated to show movement.' });
  const sig = signalsFor(f);
  blocks.push({ h: 'Weekly net sales', id: 'b-tr', html: LEG_TREND });
  const tabs = [];
  if (!(f.ch && f.ch.length === 1) && channelsOf(f).length > 1) tabs.push(['By channel', breakdownTable(rowsBy(f, P, 'ch'), 'Channel')]);
  if (!(f.c && f.c.length === 1)) tabs.push(['By country', breakdownTable(rowsBy(f, P, 'c'), 'Country')]);
  if (!(f.b && f.b.length === 1)) tabs.push(['By brand', breakdownTable(rowsBy(f, P, 'b'), 'Brand')]);
  if (f.b && f.b.length === 1) { const B = K.BMAP[f.b[0]]; tabs.push(['By SKU', breakdownTable(splitRows(B.skus.map(s => s[0]), B.skus.map(s => s[1]), 'sku' + B.id + (f.c || []).join(), A, C, L), 'SKU') + '<p class="foot">SKU split is illustrative (synthetic).</p>']); }
  if (f.c && f.c.length === 1) { const Cc = K.CMAP[f.c[0]]; tabs.push(['By city', breakdownTable(splitRows(Cc.cities, Cc.cityW, 'city' + Cc.id + (f.b || []).join(), A, C, L), 'City') + '<p class="foot">City split is illustrative (synthetic).</p>']);
    const rs = K.RETAILERS.filter(r => r.c === Cc.id && (!f.ch || f.ch.includes(r.ch)));
    if (rs.length) tabs.push(['By retailer', breakdownTable(rs.map(r => { const ff = sub(f, { ch: [r.ch] }), a = agg(ff, 'A', P.w0, P.w1), c = compAgg(ff, P), l = agg(ff, 'L', P.w0, P.w1), k = r.share; return { label: r.name + ' (' + K.CHMAP[r.ch].name.toLowerCase() + ')', a: { ns: a.ns * k, cm: a.cm * k }, c: { ns: c.ns * k, cm: c.cm * k }, l: { ns: l.ns * k } }; }), 'Retailer') + '<p class="foot">Retailer figures use each retailer\'s share of its channel (synthetic).</p>']); }
  if (tabs.length) blocks.push({ h: 'Breakdown', html: `<div class="seg sm" id="b-tabs">${tabs.map((t, i) => `<button type="button" data-i="${i}" aria-pressed="${i === 0}">${t[0]}</button>`).join('')}</div><div id="b-tab"></div>` });
  if (sig.length) blocks.push({ h: 'Related external signals', html: sig.map(x => `<div class="sig"><span class="wk num">Wk ${x.w}</span><span>${esc(x.text)}</span><span class="pill meta">${esc(x.type)}</span></div>`).join('') });
  const after = () => {
    waterfall($('#b-wf'), br, { onClick: it => openContrib(f, P, it.k, it.full) });
    nsTrend('b-tr', f, P, sig.map(s => ({ w: s.w, text: s.text })))();
    if (tabs.length) { const show = i => { $('#b-tab').innerHTML = tabs[i][1]; $('#b-tabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.i === i)); $('#b-tab').querySelectorAll('[data-slice]').forEach(r => { const go = () => openSlice(JSON.parse(r.dataset.slice)); r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter') go(); }; }); }; show(0); $('#b-tabs').onclick = e => { const b = e.target.closest('button'); if (b) show(+b.dataset.i); }; }
  };
  return { blocks, after, A, C, L, br };
}
function openSlice(f, reset) {
  const P = win(), S = slice(f, P), d = diagnose(f, S, P), sb = sliceBlocks(f, P);
  const cmA = S.A.cm, cmC = S.C.cm;
  const head = stats([['Net sales', fmt$(S.A.ns), dv(vr(S.A.ns, S.C.ns), 'pct', 1, compShort())], ['Contribution margin', fmt$(cmA), dv(vr(cmA, cmC), 'pct', 1, compShort())], ['Share', pct1(S.sh.now), dv(S.sh.chg * 100, 'pts', 1, 'vs LY')], ['Fill rate (4 wks)', pct1(S.R4.fill), S.R4.fill < .95 ? '<span class="dv unf">below 95%</span>' : '']]);
  const diag = d ? `<dl class="diag"><dt>Signal</dt><dd>${sevPill(d.sev)} ${dirPill(d.dir)} <b>${esc(d.label)}</b></dd><dt>Chain</dt><dd>${d.chain.map(esc).join(' <i>→</i> ')}</dd><dt>Why</dt><dd>${aiTag} ${esc(d.cause)}</dd><dt>Do next</dt><dd><b>${esc(d.action)}</b></dd><dt>Owner</dt><dd>${esc(d.owner)}${d.value ? ` · value at stake <b>${fmt$(d.value)}</b>` : ''}</dd></dl>` : '<p class="muted">No material deviation in this slice.</p>';
  openLevel({ crumb: nameOf(f), title: nameOf(f), insight: d ? d.chain.join(' → ') : null, blocks: [{ html: head }, { html: diag }, ...sb.blocks], after: sb.after, focus: f }, reset);
}
function openEx(id) {
  const e = (window.__ex || []).find(x => x.id === id); if (!e) return;
  const P = win(), d = e.d, sb = sliceBlocks(e.f, P);
  const head = stats([['Net sales gap', s$(d.nsGap), compShort()], ['Margin gap', s$(d.cmGap), compShort()], ['FY impact (net sales)', s$(d.fyNs), 'vs FY target'], ['Value at stake', d.value ? fmt$(d.value) : 'Re-base', 'if resolved']]);
  const diag = `<dl class="diag"><dt>Signal</dt><dd>${sevPill(d.sev)} ${dirPill(d.dir)} <b>${esc(d.label)}</b> ${e.owned ? `<span class="pill own">● ${e.owned.status} · ${e.owned.note}</span>` : '<span class="pill new">New</span>'}</dd><dt>Chain</dt><dd>${d.chain.map(esc).join(' <i>→</i> ')}</dd><dt>Why</dt><dd>${aiTag} ${esc(d.cause)}</dd><dt>Do next</dt><dd><b>${esc(d.action)}</b></dd><dt>Owner</dt><dd>${esc(d.owner)}</dd><dt>Why ranked here</dt><dd class="muted">Full-year impact ${s$(d.fyNs)} net sales${d.fyCm ? ', ' + s$(d.fyCm) + ' margin' : ''}${d.dir === 'worse' ? '; gap widened over the last 4 weeks' : ''}.</dd></dl>`;
  openLevel({ crumb: 'Exception', title: e.title, insight: null, blocks: [{ html: head }, { html: diag }, ...sb.blocks], after: sb.after, focus: e.f }, true);
}
function openContrib(f, P, key, label, kind) {
  kind = kind || 'cm';
  const rows = [];
  for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const ff = sub(f, { b: [b], c: [c] }); if (!has(ff)) continue; const br = bridge(ff, P, kind); const it = br.items.find(i => i[2] === key); if (!it) continue; rows.push({ label: K.BMAP[b].name + ' · ' + K.CMAP[c].name, v: key === 'mix' ? br.perSeriesVol - br.items[0][1] : it[1], slice: ff }); }
  rows.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)); const top = rows.slice(0, 8);
  const expl = { vol: 'Change in cases sold, valued at planned unit contribution.', mix: 'Shift between higher- and lower-margin channels within each brand and market.', price: 'List-price realization vs plan on actual volume.', trade: 'Trade spend, discounts and returns vs plan (negative = deeper discounting).', cogs: 'Cost of goods per case vs plan (commodities, packaging, conversion).', dist: 'Warehousing, freight and handling per case vs plan.', ap: 'A&P spend vs budget (negative = overspend).' }[key];
  openLevel({ crumb: label, title: label + ' effect', insight: expl, blocks: [{ h: 'Largest contributors (brand × country)', html: divBars(top.map(r => ({ label: r.label, v: r.v })), v => s$(v), { click: true }) }], after: () => { $('#dr-body').querySelectorAll('.dbar.click').forEach(n => { const go = () => openSlice(top[+n.dataset.i].slice); n.onclick = go; n.onkeydown = e => { if (e.key === 'Enter') go(); }; }); } });
}
function openTile(id) {
  if (/^F\d/.test(id)) return openCFO(id);
  const f = filter(), P = win(), D = stripData();
  if (id === 'Sh1' || id === 'C1') {
    const rows = []; const Ltot = agg(f, 'L', P.w0, P.w1).ns;
    for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const ff = sub(f, { b: [b], c: [c] }); if (!has(ff)) continue; const a = agg(ff, 'A', P.w0, P.w1), cc = compAgg(ff, P), l = agg(ff, 'L', P.w0, P.w1); rows.push({ label: K.BMAP[b].name + ' · ' + K.CMAP[c].name, gap: a.ns - cc.ns, contrib: (a.ns - l.ns) / Ltot * 100, slice: ff }); }
    const isGap = id === 'Sh1'; rows.sort((a, b) => isGap ? a.gap - b.gap : b.contrib - a.contrib);
    const shown = isGap ? rows.slice(0, 4).concat(rows.slice(-3)) : rows.slice(0, 5).concat(rows.slice(-3));
    openLevel({ crumb: isGap ? 'Net sales' : 'Contribution to growth', title: isGap ? 'Net sales ' + compShort() : 'Contribution to growth vs LY', insight: isGap ? `${P.label} net sales ${fmt$(D.A.ns)}, ${sPct(vr(D.A.ns, D.C.ns))} ${compShort()}. Largest gap: ${rows[0].label} ${s$(rows[0].gap)}; largest beat: ${rows[rows.length - 1].label} ${s$(rows[rows.length - 1].gap)}.` : `Growth ${sPct(D.A.ns / D.L.ns - 1)} vs LY. ${rows[0].label} adds most; ${rows[rows.length - 1].label} subtracts most.`,
      blocks: [{ h: 'Weekly net sales', id: 'b-tr', html: LEG_TREND }, { h: isGap ? 'Where the gap sits · brand × country' : 'Who adds and who subtracts · pts of growth', html: divBars(shown.map(r => ({ label: r.label, v: isGap ? r.gap : r.contrib })), isGap ? (v => s$(v)) : (v => sPts(v).replace(' pts', '')), { click: true }), foot: 'Click a bar to diagnose that slice.' }],
      after: () => { nsTrend('b-tr', f, P)(); $('#dr-body').querySelectorAll('.dbar.click').forEach(n => { const go = () => openSlice(shown[+n.dataset.i].slice); n.onclick = go; n.onkeydown = e => { if (e.key === 'Enter') go(); }; }); } }, true);
  } else if (id === 'Sh2') {
    const br = bridge(f, { ...P, w0: P.w0, w1: P.w1, wa: P.wa }, 'ns');
    const saved = state.comp; state.comp = 'L'; const brL = bridge(f, P, 'ns'); state.comp = saved;
    openLevel({ crumb: 'Organic growth', title: 'Organic growth: volume, price and mix', insight: `Growth vs LY splits into volume ${s$(brL.items[0][1])}, mix ${s$(brL.items[1][1])}, price ${s$(brL.items[2][1])} and trade & promo ${s$(brL.items[3][1])}.`,
      blocks: [{ h: 'Net sales bridge · last year → actual', id: 'b-wf' }, { h: 'Net sales bridge · ' + compName() + ' → actual', id: 'b-wf2' }], after: () => { waterfall($('#b-wf'), brL, { startLabel: 'Last year', onClick: it => openContrib(f, P, it.k, it.full) }); waterfall($('#b-wf2'), br, { onClick: it => openContrib(f, P, it.k, it.full) }); } }, true);
  } else if (id === 'Sh3' || id === 'Sh4' || id === 'C15') {
    const w1 = P.w1 > CW ? NW : P.w1, A = K.finance({}, 'A', P.w0, w1), T = K.finance({}, 'T', P.w0, w1), L = K.finance({}, 'L', P.w0, w1);
    const lines = [['Net sales', 'ns'], ['Gross margin', 'gm'], ['Contribution margin', 'cm'], ['Overheads', 'overhead', -1], ['Operating profit', 'op'], ['Net profit', 'np']];
    const cascade = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Company P&amp;L · ${P.label}</th><th class="r">Actual</th><th class="r">vs target</th><th class="r">vs LY</th></tr></thead><tbody>${lines.map(([l, k, g]) => `<tr><td>${l}</td><td class="r num"><b>${fmt$(A[k])}</b></td><td class="r num">${dv(vr(A[k], T[k]), 'pct', g || 1)}</td><td class="r num">${sPct(vr(A[k], L[k]))}</td></tr>`).join('')}<tr><td>EPS (FY outlook)</td><td class="r num"><b>$${D.fyA.eps.toFixed(2)}</b></td><td class="r num">${dv(D.fyA.eps - D.fyT.eps, 'eps', 1)}</td><td class="r num">${sPct(vr(D.fyA.eps, K.finance({}, 'L', 1, NW).eps))}</td></tr></tbody></table></div>`;
    const br = bridge(f, P, 'cm');
    openLevel({ crumb: 'Profit', title: id === 'C15' ? 'Net profit and EPS' : id === 'Sh3' ? 'Operating profit' : 'Contribution margin', insight: `Contribution margin ${sPct(vr(D.A.cm, D.C.cm))} ${compShort()}; overhead savings ${sPct(vr(A.overhead, T.overhead))} vs plan cushion operating profit to ${sPct(vr(A.op, T.op))}. Cost savings are masking margin pressure.`,
      blocks: [{ h: 'P&L cascade (company)', html: cascade }, ...(id === 'C15' ? [{ h: 'EPS outlook vs guidance and consensus', html: rangePlot(K.FIN.guidance.eps[0], K.FIN.guidance.eps[1], K.FIN.consensus.eps, D.fyA.eps, v => '$' + v.toFixed(2), Math.min(DW(), 420)) + `<p class="foot">Ours $${D.fyA.eps.toFixed(2)}: $${(K.FIN.consensus.eps - D.fyA.eps).toFixed(2)} below consensus, $${(K.FIN.guidance.eps[0] - D.fyA.eps).toFixed(2)} below guidance. Organic growth outlook ${sPct(D.FA.ns / agg({}, 'L', 1, NW).ns - 1)} vs consensus ${sPct(K.FIN.consensus.organic)} ${sPts(((D.FA.ns / agg({}, 'L', 1, NW).ns - 1) - K.FIN.consensus.organic) * 100)}.</p>` }] : []), { h: 'Contribution margin bridge · ' + compName() + ' → actual (follows filters)', id: 'b-wf', foot: 'Click a bar to see contributors.' }],
      after: () => waterfall($('#b-wf'), br, { onClick: it => openContrib(f, P, it.k, it.full) }) }, true);
  } else if (id === 'Sh5') {
    const cumA = new Float64Array(NW + 1), cumT = new Float64Array(NW + 1), cumL = new Float64Array(NW + 1), lo = new Float64Array(NW + 1), hi = new Float64Array(NW + 1); let a = 0, t = 0, l = 0;
    for (let w = 1; w <= NW; w++) { a += agg(f, 'A', w, w).ns; t += agg(f, 'T', w, w).ns; l += agg(f, 'L', w, w).ns; cumA[w] = a; cumT[w] = t; cumL[w] = l; const u = w > CW ? (w - CW) / (NW - CW) * .02 : 0; lo[w] = a * (1 - u); hi[w] = a * (1 + u); }
    const ytdA = cumA[CW], fyT = cumT[NW], remain = NW - CW, need = (fyT - ytdA) / remain, cur = agg(f, 'A', CW - 3, CW).ns / 4;
    const rows = []; for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const ff = sub(f, { b: [b], c: [c] }); if (!has(ff)) continue; const FA = agg(ff, 'A', 1, NW), FT = agg(ff, 'T', 1, NW), sh = K.share(ff, K.MKT_LAST - 3, K.MKT_LAST), s0 = K.SERIES.filter(s => s.b === b && s.c === c), romi = s0.reduce((x, s) => x + s.romi, 0) / s0.length, days = K.invDays(c, b, CW); rows.push({ label: K.BMAP[b].name.split(' ')[0] + ' · ' + K.CMAP[c].name, gap: FA.ns - FT.ns, mom: sh.ourGrowth - sh.mktGrowth, romi, days, slice: ff }); }
    rows.sort((x, y) => x.gap - y.gap); rows.splice(5, Math.max(0, rows.length - 10));
    const icon = (ok, t) => `<span class="hr ${ok ? 'ok' : 'no'}" title="${t}">${ok ? '●' : '○'}</span>`;
    const catch_ = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Brand · country</th><th class="r">FY gap</th><th class="c">Momentum</th><th class="c">Marketing ROI</th><th class="c">Supply cover</th></tr></thead><tbody>${rows.map(r => `<tr class="click" tabindex="0" data-slice='${JSON.stringify(r.slice)}'><td>${esc(r.label)}</td><td class="r num">${dv(r.gap, '$', 1)}</td><td class="c">${icon(r.mom > 0, 'Growing faster than market')}</td><td class="c">${icon(r.romi >= 1.5, 'ROMI ' + r.romi.toFixed(1) + 'x')}</td><td class="c">${icon(r.days >= 15, r.days.toFixed(0) + ' days')}</td></tr>`).join('')}</tbody></table></div><p class="foot">Showing the 5 biggest gaps and 5 biggest beats. ● headroom to deliver more · ○ constraint. Momentum = growing faster than the market; ROMI ≥ 1.5x; supply cover ≥ 15 days.</p>`;
    openLevel({ crumb: 'FY outlook', title: 'Full-year outlook and catch-up', insight: `To hit the FY target we need ${fmt$(need)} a week for the remaining ${remain} weeks vs ${fmt$(cur)} now: a ${sPct(need / cur - 1)} uplift on current pace.`,
      blocks: [{ h: 'Cumulative net sales · actual + forecast range vs target', id: 'b-cum', html: '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>Actual + forecast (range)</span><span><i class="dash"></i>Target</span><span><i class="dash light"></i>Last year</span></div>' },
        { h: 'Run rate required vs current', html: bullet(cur, need, fmt$) }, { h: 'Catch-up map · who must deliver more, and who has headroom', html: catch_ }],
      after: () => lineChart($('#b-cum'), { x0: 1, x1: NW, h: 190, zero: true, today: CW + .5, yfmt: fmt$, series: [{ vals: cumL, from: 1, to: NW, color: '#b9bfc7', w: 1.5, dash: '1 3' }, { vals: cumT, from: 1, to: NW, color: '#7b828b', w: 1.5, dash: '5 3' }, { vals: cumA, from: 1, to: CW, color: 'var(--s1)', end: true }, { vals: cumA, from: CW, to: NW, color: 'var(--s1)', dash: '4 3', range: [lo, hi] }], tip: w => `<div class="th">Wk ${w}</div>${trow('Actual/forecast', fmt$(cumA[w]))}${trow('Target', fmt$(cumT[w]))}` }) }, true);
  } else if (id === 'Sh6' || id === 'C2') {
    const rows = []; for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const ff = sub(f, { b: [b], c: [c] }); if (!has(ff)) continue; const sh = K.share(ff, K.MKT_LAST - 3, K.MKT_LAST), m = K.MKT[c + '|' + K.BMAP[b].sub], others = [m.comp1A[K.MKT_LAST], m.shareLY[2], m.shareLY[3]], rank = 1 + others.filter(x => x > sh.now).length, lead = Math.max(...others); rows.push({ label: K.BMAP[b].name + ' · ' + K.CMAP[c].name, sh, rank, rel: sh.now / lead, top3: [sh.now, ...others].sort((x, y) => y - x).slice(0, 3).reduce((x, y) => x + y, 0), slice: ff }); }
    rows.sort((x, y) => x.sh.chg - y.sh.chg);
    const tbl = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Brand · country</th><th class="r">Share</th><th class="r">vs LY</th><th class="r">Rank</th><th class="r">vs leader</th><th class="r">Market</th><th class="r">Top-3 hold</th></tr></thead><tbody>${rows.map(r => `<tr class="click" tabindex="0" data-slice='${JSON.stringify(r.slice)}'><td>${esc(r.label)}</td><td class="r num">${pct1(r.sh.now)}</td><td class="r num">${dv(r.sh.chg * 100, 'pts', 1)}</td><td class="r num">#${r.rank}</td><td class="r num">${r.rel.toFixed(2)}x</td><td class="r num">${sPct(r.sh.mktGrowth)}</td><td class="r num">${pct1(r.top3)}</td></tr>`).join('')}</tbody></table></div><p class="foot">Market data: 4 weeks ending 20 Sep 2026 · measured channels (coverage ${countriesOf(f).map(c => K.CMAP[c].name + ' ' + Math.round(K.CMAP[c].coverage * 100) + '%').join(', ')}). "vs leader" above 1.0x means we lead. Channel filter is not applied to market data.</p>`;
    const crow = countriesOf(f).filter(c => has(sub(f, { c: [c] }))).map(c => { const sh = K.share(sub(f, { c: [c] }), K.MKT_LAST - 3, K.MKT_LAST); return { label: K.CMAP[c].name, a: sh.mktGrowth, b: sh.ourGrowth, note: sPts(sh.chg * 100).replace(' pts', '') }; });
    openLevel({ crumb: 'Market share', title: 'Market share and growth vs market', insight: `Share ${pct1(D.sh.now)} ${sPts(D.sh.chg * 100)} vs LY. Biggest loss: ${rows[0].label} ${sPts(rows[0].sh.chg * 100)}; biggest gain: ${rows[rows.length - 1].label} ${sPts(rows[rows.length - 1].sh.chg * 100)}.`,
      blocks: [{ h: 'Our growth vs market growth, by country', html: dumbbell(crow, { W: DW() }) }, { h: 'Share by brand × country (worst first)', html: tbl }] }, true);
  } else if (id === 'Sh7' || id === 'C4') {
    const sp = K.SHARE_PRICE, us = new Float64Array(CW + 1), pe = new Float64Array(CW + 1); for (let w = 1; w <= CW; w++) { us[w] = sp.us[w] / sp.start * 100; pe[w] = sp.peer[w]; }
    openLevel({ crumb: 'Shareholder value', title: 'Share price and TSR vs peers', insight: `Our shares ${sPct(D.us)} YTD vs peers ${sPct(D.peer)}. The gap opened after the Q2 results (Wk 30); the drivers investors watch are on this page: organic growth, margin and the EPS outlook below guidance.`,
      blocks: [{ h: 'Indexed share price (start of year = 100)', id: 'b-sp', html: '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>Kestrel</span><span><i class="dash"></i>Peer index</span></div>' }, { h: 'What investors are reacting to', html: stats([['Organic growth (FY)', sPct(D.FA.ns / agg({}, 'L', 1, NW).ns - 1), 'consensus ' + sPct(K.FIN.consensus.organic)], ['EPS (FY outlook)', '$' + D.fyA.eps.toFixed(2), 'consensus $' + K.FIN.consensus.eps.toFixed(2)], ['Contribution margin', sPct(vr(D.A.cm, D.C.cm)), compShort()], ['Market share', pct1(D.sh.now), sPts(D.sh.chg * 100) + ' vs LY']]) }],
      after: () => lineChart($('#b-sp'), { x0: 1, x1: CW, h: 180, yfmt: v => v.toFixed(0), series: [{ vals: pe, from: 1, to: CW, color: '#7b828b', w: 1.5, dash: '5 3', label: 'Peers' }, { vals: us, from: 1, to: CW, color: 'var(--s1)', end: true, label: 'Kestrel' }], markers: [{ w: 30, text: 'Q2 results' }], tip: w => `<div class="th">Wk ${w}</div>${trow('Kestrel', us[w].toFixed(1))}${trow('Peers', pe[w].toFixed(1))}` }) }, true);
  }
}
const DW = () => Math.min(640, innerWidth) - 42;
const TWid = () => { const t = $('#tiles'); const w = t ? t.clientWidth : 700; return Math.max(240, (innerWidth <= 640 ? w : (w - 10) / 2) - 34); };
function bullet(actual, target, fmt) {
  const mx = Math.max(actual, target) * 1.15, W = DW();
  return `<svg viewBox="0 0 ${W} 44" width="${W}" height="44" class="fx" role="img" aria-label="Current vs required"><rect x="0" y="12" width="${W}" height="14" rx="4" fill="var(--surface-3)"/><rect x="0" y="15" width="${actual / mx * W}" height="8" rx="3" fill="var(--s1)"/><line x1="${target / mx * W}" x2="${target / mx * W}" y1="6" y2="32" stroke="var(--ink)" stroke-width="2.5"/><text x="2" y="42" class="ax">Current ${fmt(actual)} / wk</text><text x="${W - 2}" y="42" text-anchor="end" class="ax strong">Required ${fmt(target)} / wk</text></svg>`;
}
function focusOn(f) {
  state.brand = f.b && f.b.length === 1 ? 'b:' + f.b[0] : 'all';
  const reg = f.c && K.REGIONS.find(r => r.countries.length === f.c.length && r.countries.every(x => f.c.includes(x)) && r.countries.length > 1);
  state.geo = f.c && f.c.length === 1 ? 'c:' + f.c[0] : reg ? 'r:' + reg.id : 'all';
  state.ch = f.ch && f.ch.length === 1 ? f.ch[0] : 'all';
  render(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ================= CFO view (includes revenue growth management) ================= */
function seriesP(f, P) { const out = []; for (const s of K.SERIES) if (K.match(s, f)) out.push({ s, a: sumS(s, 'A', P.w0, P.w1), t: sumS(s, 'T', P.w0, P.w1), l: sumS(s, 'L', P.w0, P.w1) }); return out; }
function pricing(f, P) {
  let pa = 0, pl = 0, pt = 0, pr = 0, ci = 0;
  for (const { a, t, l } of seriesP(f, P)) { if (!a.vol || !l.vol || !t.vol) continue; pa += a.gs; pl += a.vol * l.gs / l.vol; pt += a.vol * t.gs / t.vol; pr += a.vol * (a.ns / a.vol - l.ns / l.vol); ci += a.vol * (a.cogs / a.vol - l.cogs / l.vol); }
  return { real: pa / pl - 1, plan: pt / pl - 1, recovery: ci > 0 ? pr / ci : NaN, price$: pr, cost$: ci, short$: pa - pt };
}
const promosIn = f => K.PROMOS.filter(p => (!f.b || f.b.includes(p.b)) && (!f.c || f.c.includes(p.c)) && (!f.ch || f.ch.includes(p.ch)));
const verdict = r => r >= 1.2 ? ['good', 'Repeat'] : r >= .8 ? ['warn', 'Optimise'] : ['crit', 'Stop'];
function weekly(f, sc, w0, w1, fn) { const out = []; for (let w = w0; w <= w1; w++) out.push(fn(agg(f, sc, w, w))); return out; }
function topContrib(f, P, key, kind) {
  let best = null;
  for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const ff = sub(f, { b: [b], c: [c] }); if (!has(ff)) continue; const it = bridge(ff, P, kind).items.find(i => i[2] === key); if (it && (!best || it[1] < best.v)) best = { v: it[1], label: K.BMAP[b].name + ' ' + K.CMAP[c].name }; }
  return best;
}
function cfoTiles(f, P) {
  const A = agg(f, 'A', P.w0, P.w1), C = compAgg(f, P), L = agg(f, 'L', P.w0, P.w1), tiles = [], TW = TWid3();
  const scC = state.comp === 'L' ? 'L' : 'T', w0 = CW - 12;
  // F1 gross margin %
  const gm = x => (x.ns - x.cogs) / x.ns, d1 = (gm(A) - gm(C)) * 1e4, brg = bridge(f, P, 'gm');
  const negs = brg.items.filter(i => i[1] < 0).sort((a, b) => a[1] - b[1]).slice(0, 2);
  const cause1 = negs.map(i => { const t = topContrib(f, P, i[2], 'gm'); return `${i[0].toLowerCase()} ${sBps(i[1] / A.ns * 1e4)}${t ? ' (led by ' + t.label + ')' : ''}`; }).join(' and ');
  tiles.push({ id: 'F1', label: 'Gross margin %', value: pct1(gm(A)), sev: sevOf(d1, 'bps'), delta: dv(d1, 'bps', 1, compShort()) + ' · ' + sBps((gm(A) - gm(L)) * 1e4) + ' vs LY',
    cause: negs.length ? `Likely drivers: ${cause1}.` : 'No material margin drag.', body: spark(weekly(f, 'A', w0, CW, gm), weekly(f, scC, w0, CW, gm)) });
  // F2 trade spend % of gross sales
  const tr = x => x.tr / x.gs, d2 = (tr(A) - tr(C)) * 1e4, tw = topContrib(f, P, 'trade', 'ns');
  tiles.push({ id: 'F2', label: 'Trade spend % gross sales', value: pct1(tr(A)), sev: sevOf(-d2, 'bps'), delta: dv(d2, 'bps', -1, compShort()) + ' · ' + fmt$(A.tr) + ' spent',
    cause: tw && tw.v < 0 ? `Likely driver: deeper promotions in ${tw.label} ${s$(tw.v)} vs plan.` : 'Trade spend in line with plan.', body: spark(weekly(f, 'A', w0, CW, tr), weekly(f, scC, w0, CW, tr)) });
  // F3 price realization vs RGM plan
  const pz = pricing(f, P), d3 = (pz.real - pz.plan) * 100, pw = topContrib(f, P, 'price', 'ns');
  tiles.push({ id: 'F3', label: 'Price realization vs RGM plan', value: sPct(pz.real), sev: sevOf(d3, 'pts'), delta: dv(d3, 'pts', 1, 'vs plan ' + sPct(pz.plan)) + ' · ≈ ' + s$(pz.short$),
    cause: d3 < -.1 ? `Likely driver: planned increases landed late at key retailers${pw ? ', largest shortfall ' + pw.label + ' ' + s$(pw.v) : ''}.` : 'Price increases landed as planned.', body: bulletMini(pz.real * 100, pz.plan * 100, v => sPct(v / 100), TW, 'Actual', 'Plan') });
  // F4 inflation recovery
  const rec = pz.recovery, d4 = (rec - 1) * 100;
  tiles.push({ id: 'F4', label: 'Inflation recovery', value: isFinite(rec) ? (rec * 100).toFixed(0) + '%' : '—', sev: rec >= .95 ? 'good' : rec >= .8 ? 'warn' : 'crit', delta: dv(d4, 'pts', 1, 'vs 100% coverage') + ' · cost ' + s$(-pz.cost$),
    cause: `Price increases cover ${isFinite(rec) ? (rec * 100).toFixed(0) : '—'}% of cost inflation vs LY; oat costs ${sPct(.18, 0)} vs budget are the main gap.`, body: bulletMini(rec * 100, 100, v => v.toFixed(0) + '%', TW, 'Recovered', 'Full recovery') });
  // F5 promotion ROI
  const ev = promosIn(f).filter(p => p.roi != null), roi = ev.length ? ev.reduce((x, p) => x + p.incGM, 0) / ev.reduce((x, p) => x + p.spend, 0) : NaN, worst = ev.slice().sort((a, b) => a.roi - b.roi);
  tiles.push({ id: 'F5', label: 'Promotion ROI', value: isFinite(roi) ? roi.toFixed(2) + 'x' : '—', sev: !isFinite(roi) ? 'good' : roi >= 1.2 ? 'good' : roi >= 1.0 ? 'warn' : 'crit', delta: isFinite(roi) ? dv(roi - 1.2, 'x', 1, 'vs 1.20x plan') + ' · ' + ev.length + ' events YTD' : '<span class="dv neu">No evaluated events in scope</span>',
    cause: worst.length ? `Lowest: "${worst[0].name}" (${K.BMAP[worst[0].b].name}, ${K.CMAP[worst[0].c].name}) at ${worst[0].roi.toFixed(2)}x; ${ev.filter(p => p.roi < .8).length} events below 0.8x.` : 'No evaluated promotions in this scope.',
    body: worst.length ? divBars(worst.slice(0, 3).map(p => ({ label: K.BMAP[p.b].name.split(' ')[0] + ' · ' + p.c + ' · ' + p.name, v: p.roi - 1.0 })), v => (v + 1).toFixed(2) + 'x') + '<div class="legend"><span>Lowest-ROI events · centre line = 1.0x break-even</span></div>' : '' });
  // F6 outlook vs guidance and consensus (company level)
  const fyA = K.finance({}, 'A', 1, NW), g = K.FIN.guidance, cons = K.FIN.consensus, org = agg({}, 'A', 1, NW).ns / agg({}, 'L', 1, NW).ns - 1;
  tiles.push({ id: 'F6', label: 'Outlook vs guidance & consensus', value: 'EPS $' + fyA.eps.toFixed(2), sev: fyA.eps < g.eps[0] ? 'crit' : fyA.eps < cons.eps ? 'warn' : 'good', tag: fyA.eps < g.eps[0] ? 'Below guidance' : 'Within guidance',
    delta: dv(fyA.eps - cons.eps, 'eps', 1, 'vs consensus') + ' · ' + dv(fyA.eps - g.eps[0], 'eps', 1, 'vs guidance low'),
    cause: `Organic growth ${sPct(org)}: ${sPts((org - cons.organic) * 100)} vs consensus ${sPct(cons.organic)}; within guidance ${pct1(g.organic[0]).replace('.0', '')}–${pct1(g.organic[1]).replace('.0', '')}, only ${sPts((org - g.organic[0]) * 100)} above the low end.`,
    body: rangePlot(g.eps[0], g.eps[1], cons.eps, fyA.eps, v => '$' + v.toFixed(2), TW) });
  return tiles;
}
const TWid3 = () => { const t = $('#tiles'); const w = t ? t.clientWidth : 700; const n = innerWidth <= 640 ? 1 : innerWidth <= 1100 ? 2 : 3; return Math.max(200, (w - 10 * (n - 1)) / n - 34); };
function bulletMini(actual, target, fmt, Wd, la, lt) {
  const W = Wd || 260, lo = Math.min(0, actual, target), mx = Math.max(actual, target) * 1.18 || 1, X = v => (v - lo) / (mx - lo) * W;
  return `<svg viewBox="0 0 ${W} 40" width="${W}" height="40" class="fx" role="img" aria-label="${la} ${fmt(actual)} vs ${lt} ${fmt(target)}"><rect x="0" y="8" width="${W}" height="12" rx="4" fill="var(--surface-3)"/><rect x="${X(Math.min(0, actual))}" y="10.5" width="${Math.abs(X(actual) - X(0))}" height="7" rx="3" fill="${actual >= target ? 'var(--s1)' : 'var(--neg)'}"/><line x1="${X(target)}" x2="${X(target)}" y1="3" y2="25" stroke="var(--ink)" stroke-width="2"/><text x="0" y="37" class="ax">${la} ${fmt(actual)}</text><text x="${W}" y="37" text-anchor="end" class="ax strong">${lt} ${fmt(target)}</text></svg>`;
}
function cfoBriefing(ex, D, f, P) {
  const A = D.A, C = D.C, gm = x => (x.ns - x.cogs) / x.ns, eps = D.fyA.eps, g = K.FIN.guidance.eps, cons = K.FIN.consensus.eps, pz = pricing(f, P);
  const st = eps < g[0] || (gm(A) - gm(C)) * 1e4 < -60 ? 'crit' : (gm(A) - gm(C)) * 1e4 < -10 ? 'warn' : 'good';
  const neg = ex.filter(e => e.d.sev !== 'opp').slice(0, 3);
  const l1 = `${P.label} gross margin ${pct1(gm(A))} ${sBps((gm(A) - gm(C)) * 1e4)} ${compShort()}, contribution margin ${sPct(vr(A.cm, C.cm))}; FY EPS outlook $${eps.toFixed(2)} is $${(cons - eps).toFixed(2)} below consensus and ${eps < g[0] ? '$' + (g[0] - eps).toFixed(2) + ' below' : 'within'} guidance.`;
  const l2 = `Likely drivers: ${neg.map(e => e.d.label.toLowerCase() + ' in ' + e.title).join('; ')}; price increases recover ${isFinite(pz.recovery) ? (pz.recovery * 100).toFixed(0) : '—'}% of cost inflation.`;
  const l3 = `Focus: ${neg.slice(0, 2).map(e => e.d.action.split(';')[0].split(',')[0].replace(/\.$/, '')).join('; ')}.`;
  return briefHtml(st, l1, l2, l3);
}
function briefHtml(st, l1, l2, l3) {
  return `<div class="brief-h">${sevPill(st)} ${aiTag}<span class="muted">Briefing for ${ROLES[state.role].label}</span></div>
    <ol class="brief"><li><b>Status</b><span>${esc(l1)}</span></li><li><b>Why</b><span>${esc(l2)}</span></li><li><b>Action</b><span>${esc(l3)}</span></li></ol>
    <div class="fb"><button class="link" data-fb="brief">Not useful</button></div>`;
}
function openCFO(id) {
  const f = filter(), P = win(), A = agg(f, 'A', P.w0, P.w1), C = compAgg(f, P), D = stripData();
  if (id === 'F1') {
    const brg = bridge(f, P, 'gm');
    // cost-of-goods per case bridge: comparator cost per case -> materials, packaging, conversion, inbound freight -> actual
    const pc = (x, k) => x[k] / x.vol, comps = [['Materials', 'mat'], ['Packaging', 'pack'], ['Conversion', 'conv'], ['Inbound freight', 'inb']];
    const cb = { kind: 'cpc', start: C.cogs / C.vol, end: A.cogs / A.vol, items: comps.map(([l, k]) => [l, pc(A, k) - pc(C, k), k]) };
    openLevel({ crumb: 'Gross margin', title: 'Gross margin %', insight: `Gross margin ${pct1((A.ns - A.cogs) / A.ns)} ${sBps(((A.ns - A.cogs) / A.ns - (C.ns - C.cogs) / C.ns) * 1e4)} ${compShort()}. Cost per case ${sPct(cb.end / cb.start - 1)}, mostly materials.`,
      blocks: [{ h: 'Gross margin bridge · ' + compName() + ' → actual', id: 'b-wf', foot: 'Click a bar to see which brands and markets drive it.' }, { h: 'Cost per case bridge · ' + compName() + ' → actual', id: 'b-wf2', foot: 'Per standard case. Materials carry commodity inflation; conversion rises when volume falls (fixed costs spread over fewer cases).' }, { h: 'A&P spend vs budget', html: stats([['A&P spend', fmt$(A.ap), dv(vr(A.ap, C.ap), 'pct', -1, compShort())], ['A&P % net sales', pct1(A.ap / A.ns), ''], ['Distribution % net sales', pct1(A.dist / A.ns), dv(vr(A.dist / A.vol, C.dist / C.vol), 'pct', -1, 'per case')], ['Flow-through', isFinite((A.cm - C.cm) / (A.ns - C.ns)) ? pct1((A.cm - C.cm) / (A.ns - C.ns)) : '—', 'Δ margin ÷ Δ sales']]) }],
      after: () => { waterfall($('#b-wf'), brg, { onClick: it => openContrib(f, P, it.k, it.full, 'gm') }); waterfall($('#b-wf2'), cb, { fmt: v => '$' + v.toFixed(2), sfmt: v => (v >= 0 ? '+' : MINUS) + '$' + Math.abs(v).toFixed(2), costUp: true }); } }, true);
  } else if (id === 'F2') {
    const rows = [];
    for (const c of countriesOf(f)) for (const r of K.RETAILERS.filter(x => x.c === c && (!f.ch || f.ch.includes(x.ch)))) { const ff = sub(f, { c: [c], ch: [r.ch] }); if (!has(ff)) continue; const a = agg(ff, 'A', P.w0, P.w1), cc = compAgg(ff, P); rows.push({ label: r.name + ' · ' + K.CMAP[c].name, ch: K.CHMAP[r.ch].name, tr: a.tr * r.share, rate: a.tr / a.gs, plan: cc.tr / cc.gs }); }
    rows.sort((x, y) => (y.rate - y.plan) - (x.rate - x.plan));
    const tbl = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Key account</th><th>Channel</th><th class="r">Trade spend</th><th class="r">% gross sales</th><th class="r">${compShort()}</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td><td>${esc(r.ch)}</td><td class="r num">${fmt$(r.tr)}</td><td class="r num">${pct1(r.rate)}</td><td class="r num">${dv((r.rate - r.plan) * 1e4, 'bps', -1)}</td></tr>`).join('')}</tbody></table></div><p class="foot">Key-account figures use each account's share of its channel (synthetic).</p>`;
    let pv = 0, tv = 0; for (const p of promosIn(f)) { if (p.upcoming) continue; const ff = { b: [p.b], c: [p.c], ch: [p.ch] }; const w0 = Math.max(p.w0, P.w0), w1 = Math.min(p.w1, P.wa); if (w1 >= w0) pv += agg(ff, 'A', w0, w1).vol; } tv = A.vol;
    const ret = countriesOf(f).filter(c => has(sub(f, { c: [c] }))).map(c => { const ff = sub(f, { c: [c] }), a = agg(ff, 'A', P.w0, P.w1), t = agg(ff, 'T', P.w0, P.w1); return { label: K.CMAP[c].name, ret: a.ret, prov: a.gs * t.ret / t.gs }; });
    const rq = []; for (const c of countriesOf(f)) for (const ch of channelsOf(sub(f, { c: [c] }))) { const ff = sub(f, { c: [c], ch: [ch] }), r4 = agg(ff, 'A', CW - 3, CW), w = agg(ff, 'A', CW, CW); rq.push({ label: K.CMAP[c].name + ' · ' + K.CHMAP[ch].name, gap: r4.vol / r4.cons - 1, cover: w.stock / w.cons, normal: K.CHMAP[ch].cover }); }
    rq.sort((x, y) => y.gap - x.gap);
    openLevel({ crumb: 'Trade spend', title: 'Trade spend and gross-to-net', insight: `Trade spend ${pct1(A.tr / A.gs)} of gross sales ${sBps((A.tr / A.gs - C.tr / C.gs) * 1e4)} ${compShort()} (${fmt$(A.tr)}). ${pct1(pv / tv)} of volume was sold on promotion in this period.`,
      blocks: [{ h: 'Trade spend by key account (largest overspend first)', html: tbl }, { h: 'Returns vs provision', html: `<div class="tbl-wrap"><table class="t"><thead><tr><th>Country</th><th class="r">Returns</th><th class="r">Provision</th><th class="r">Gap</th></tr></thead><tbody>${ret.map(r => `<tr><td>${r.label}</td><td class="r num">${fmt$(r.ret)}</td><td class="r num">${fmt$(r.prov)}</td><td class="r num">${dv(r.ret - r.prov, '$', -1)}</td></tr>`).join('')}</tbody></table></div>` },
        { h: 'Revenue quality: shipments vs shopper purchases (last 4 weeks)', html: `<div class="tbl-wrap"><table class="t"><thead><tr><th>Country · channel</th><th class="r">Shipments vs purchases</th><th class="r">Channel cover</th></tr></thead><tbody>${rq.slice(0, 6).map(r => `<tr><td>${r.label}</td><td class="r num">${dv(r.gap, 'pct', -1)}</td><td class="r num">${r.cover.toFixed(1)} wks <span class="muted">(normal ${r.normal})</span></td></tr>`).join('')}</tbody></table></div><p class="foot">Shipping well ahead of shopper purchases pulls revenue forward and raises future returns.</p>` }] }, true);
  } else if (id === 'F3') {
    const byC = countriesOf(f).filter(c => has(sub(f, { c: [c] }))).map(c => { const p = pricing(sub(f, { c: [c] }), P); return { label: K.CMAP[c].name, ...p }; });
    const byB = brandsOf(f).filter(b => has(sub(f, { b: [b] }))).map(b => { const ff = sub(f, { b: [b] }), p = pricing(ff, P), a = agg(ff, 'A', P.w0, P.w1), l = agg(ff, 'L', P.w0, P.w1); return { label: K.BMAP[b].name, ...p, volG: a.vol / l.vol - 1 }; });
    const nb = bridge(f, P, 'ns'), pz = pricing(f, P), ev = promosIn(f).filter(p => p.roi != null), roi = ev.length ? ev.reduce((x, p) => x + p.incGM, 0) / ev.reduce((x, p) => x + p.spend, 0) : NaN;
    const g = k => nb.items.find(i => i[2] === k)[1];
    const lever = [['Pricing', sPct(pz.plan), sPct(pz.real), (pz.real - pz.plan) * 100, g('price')], ['Promotions & trade terms', pct1(C.tr / C.gs) + ' of gross sales', pct1(A.tr / A.gs), -(A.tr / A.gs - C.tr / C.gs) * 100, g('trade')], ['Mix', 'neutral', s$(g('mix')), g('mix') / C.ns * 100, g('mix')], ['Promotion ROI', '1.20x', isFinite(roi) ? roi.toFixed(2) + 'x' : '—', isFinite(roi) ? (roi - 1.2) * 10 : 0, null], ['Pack-price architecture', 'new packs (+0.4%)', '(+0.2%)', -.2, -.002 * C.ns]];
    const sc = `<div class="tbl-wrap"><table class="t"><thead><tr><th>RGM lever</th><th class="r">Plan</th><th class="r">Actual</th><th class="r">$ impact ${compShort()}</th><th class="r">Status</th></tr></thead><tbody>${lever.map(r => { const st = r[3] >= -.1 ? 'good' : r[3] >= -1 ? 'warn' : 'crit'; return `<tr><td>${r[0]}</td><td class="r num">${r[1]}</td><td class="r num"><b>${r[2]}</b></td><td class="r num">${r[4] == null ? '—' : dv(r[4], '$', 1)}</td><td class="r">${sevPill(st)}</td></tr>`; }).join('')}</tbody></table></div><p class="foot">Pack-price architecture figures are illustrative (synthetic).</p>`;
    const pt = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Country</th><th class="r">Actual vs LY</th><th class="r">Plan</th><th class="r">Gap</th><th class="r">≈ $</th></tr></thead><tbody>${byC.map(r => `<tr><td>${r.label}</td><td class="r num">${sPct(r.real)}</td><td class="r num">${sPct(r.plan)}</td><td class="r num">${dv((r.real - r.plan) * 100, 'pts', 1)}</td><td class="r num">${s$(r.short$)}</td></tr>`).join('')}</tbody></table></div>`;
    const sig = K.SIGNALS.filter(x => x.type === 'Pricing');
    openLevel({ crumb: 'Price realization', title: 'Price realization and RGM plan', insight: `Price realization ${sPct(pz.real)} vs plan ${sPct(pz.plan)} ${sPts((pz.real - pz.plan) * 100)}, worth about ${s$(pz.short$)} of gross sales. ${sig.length ? sig[0].text : ''}`,
      blocks: [{ h: 'RGM scorecard · plan vs actual', html: sc }, { h: 'Price realization by country', html: pt }, { h: 'Price vs volume response, by brand (price elasticity)', html: elasticity(byB, DW()) + '<p class="foot">Each dot: list-price change vs LY (x) against volume change vs LY (y). Brands lower-right lost volume after pricing.</p>' }] }, true);
  } else if (id === 'F4') {
    const b = 'oats', ff = sub(f, { b: [b] }), fa = agg(ff, 'A', P.w0, P.w1), fl = agg(ff, 'L', P.w0, P.w1), pz = pricing(ff, P);
    const steps = has(ff) ? [['Oat cost vs budget', sPct(.18, 0)], ['Cost per case vs LY', sPct(fa.cogs / fa.vol / (fl.cogs / fl.vol) - 1)], ['Net price per case vs LY', sPct(fa.ns / fa.vol / (fl.ns / fl.vol) - 1)], ['Volume vs LY', sPct(fa.vol / fl.vol - 1)], ['Gross margin vs LY', sBps(((fa.ns - fa.cogs) / fa.ns - (fl.ns - fl.cogs) / fl.ns) * 1e4)], ['Inflation recovery', isFinite(pz.recovery) ? (pz.recovery * 100).toFixed(0) + '%' : '—']] : [];
    const byB = brandsOf(f).filter(x => has(sub(f, { b: [x] }))).map(x => ({ label: K.BMAP[x].name, ...pricing(sub(f, { b: [x] }), P) })).sort((a, c) => (a.recovery || 9) - (c.recovery || 9));
    openLevel({ crumb: 'Inflation recovery', title: 'Inflation chain: costs, prices and demand', insight: `Across ${nameOf(f)}, price increases recover ${(pricing(f, P).recovery * 100).toFixed(0)}% of cost inflation vs LY. Sunrise Oats is the main gap: oat costs ${sPct(.18, 0)} vs budget with only 40% hedged.`,
      blocks: [{ h: 'Sunrise Oats · inflation chain', html: steps.length ? `<div class="chain">${steps.map((s, i) => `<div class="step"><span>${s[0]}</span><b class="num">${s[1]}</b></div>${i < steps.length - 1 ? '<i>→</i>' : ''}`).join('')}</div>` : '<p class="muted">Sunrise Oats is outside the current filter.</p>' },
        { h: 'Recovery by brand (worst first)', html: `<div class="tbl-wrap"><table class="t"><thead><tr><th>Brand</th><th class="r">Price $ vs LY</th><th class="r">Cost inflation $</th><th class="r">Recovery</th></tr></thead><tbody>${byB.map(r => `<tr><td>${r.label}</td><td class="r num">${s$(r.price$)}</td><td class="r num">${s$(r.cost$)}</td><td class="r num"><b>${isFinite(r.recovery) ? (r.recovery * 100).toFixed(0) + '%' : '—'}</b></td></tr>`).join('')}</tbody></table></div>` },
        { h: 'Commodity prices vs budget and hedge cover', html: `<div class="tbl-wrap"><table class="t"><thead><tr><th>Commodity</th><th class="r">vs budget</th><th class="r">Hedge cover</th></tr></thead><tbody>${K.COMMODITIES.map(x => `<tr><td>${x.name}</td><td class="r num">${dv(x.vsBudget, 'pct', -1)}</td><td class="r num">${pct1(x.hedge).replace('.0', '')}</td></tr>`).join('')}</tbody></table></div><p class="foot">Owned operationally by the COO (procurement); the same numbers appear in the COO view.</p>` }] }, true);
  } else if (id === 'F5') {
    const ev = promosIn(f).filter(p => p.roi != null).sort((a, b) => a.roi - b.roi);
    const tbl = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Promotion</th><th>Where</th><th class="r">Spend</th><th class="r">Lift vs plan</th><th class="r">ROI</th><th class="r">Call</th></tr></thead><tbody>${ev.map(p => { const v = verdict(p.roi), r = K.RETAILERS.find(x => x.id === p.ka); return `<tr class="click" tabindex="0" data-promo="${p.id}"><td><b>${esc(p.name)}</b><br><span class="muted">${esc(K.BMAP[p.b].name)} · Wk ${p.w0}–${p.w1}</span></td><td>${esc(K.CMAP[p.c].name)}${r ? ' · ' + esc(r.name) : ' · ' + esc(K.CHMAP[p.ch].name)}</td><td class="r num">${fmt$(p.spend)}</td><td class="r num">${sPct(p.lift, 0)} <span class="muted">vs ${sPct(p.planLift, 0)}</span></td><td class="r num"><b>${p.roi.toFixed(2)}x</b></td><td class="r">${sevPill(v[0]).replace(SEV[v[0]], v[1])}</td></tr>`; }).join('')}</tbody></table></div><p class="foot">ROI = incremental gross margin ÷ promotion cost, from post-event evaluation against a modelled baseline. Repeat ≥ 1.2x · Optimise 0.8–1.2x · Stop &lt; 0.8x.</p>`;
    openLevel({ crumb: 'Promotion ROI', title: 'Promotion results', insight: ev.length ? `${ev.filter(p => p.roi < .8).length} of ${ev.length} evaluated promotions destroyed value (below 0.8x). The two Crunch Chips USA events alone cost ${fmt$(ev.filter(p => p.b === 'crunch').reduce((x, p) => x + p.spend - p.incGM, 0))} more than they returned.` : 'No evaluated promotions in this scope.',
      blocks: [{ h: 'Events by ROI (lowest first) · click for detail', html: tbl }], after: () => $('#dr-body').querySelectorAll('[data-promo]').forEach(r => { const go = () => openPromo(r.dataset.promo); r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter') go(); }; }) }, true);
  } else if (id === 'F6') {
    const fyA = K.finance({}, 'A', 1, NW), fyT = K.finance({}, 'T', 1, NW), sh = K.FIN.shares, k = (1 - K.FIN.taxRate) / sh;
    const eb = { kind: 'eps', start: fyT.eps, end: fyA.eps, items: [['Contribution margin', (fyA.cm - fyT.cm) * k, 'cm'], ['Overhead savings', -(fyA.overhead - fyT.overhead) * k, 'oh'], ['Interest, tax, shares', 0, 'it']] };
    const g = K.FIN.guidance, cons = K.FIN.consensus, org = agg({}, 'A', 1, NW).ns / agg({}, 'L', 1, NW).ns - 1, pe = K.SHARE_PRICE.us[CW] / fyA.eps;
    const gapTxt = (v, lo, hi, c, f2, unit) => `<span class="pills">${v < lo ? `<span class="pill sev crit">${f2(lo - v)} below guidance</span>` : v > hi ? `<span class="pill sev good">${f2(v - hi)} above guidance</span>` : `<span class="pill sev warn">Within guidance, ${f2(v - lo)} above the low end</span>`}<span class="pill sev ${v < c ? 'crit' : 'good'}">${f2(Math.abs(c - v))} ${v < c ? 'below' : 'above'} consensus</span></span>`;
    const tbl = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Metric</th><th class="r">Our outlook</th><th class="r">Guidance</th><th class="r">Consensus</th><th>Gap</th></tr></thead><tbody>
      <tr><td>EPS</td><td class="r num"><b>$${fyA.eps.toFixed(2)}</b></td><td class="r num">$${g.eps[0].toFixed(2)}–${g.eps[1].toFixed(2)}</td><td class="r num">$${cons.eps.toFixed(2)}</td><td>${gapTxt(fyA.eps, g.eps[0], g.eps[1], cons.eps, v => '$' + v.toFixed(2))}</td></tr>
      <tr><td>Organic growth</td><td class="r num"><b>${sPct(org)}</b></td><td class="r num">${pct1(g.organic[0]).replace('.0', '')}–${pct1(g.organic[1]).replace('.0', '')}</td><td class="r num">${pct1(cons.organic)}</td><td>${gapTxt(org, g.organic[0], g.organic[1], cons.organic, v => (v * 100).toFixed(1) + ' pts')}</td></tr>
      <tr><td>Net sales</td><td class="r num"><b>${fmt$(D.FA.ns)}</b></td><td class="r num">—</td><td class="r num">${fmt$(cons.ns)}</td><td><span class="pill sev ${D.FA.ns < cons.ns ? 'crit' : 'good'}">${fmt$(Math.abs(cons.ns - D.FA.ns))} ${D.FA.ns < cons.ns ? 'below' : 'above'} consensus</span></td></tr></tbody></table></div>`;
    openLevel({ crumb: 'Outlook vs guidance', title: 'Outlook vs guidance and consensus', insight: `EPS outlook $${fyA.eps.toFixed(2)}: $${(cons.eps - fyA.eps).toFixed(2)} below consensus and $${(g.eps[0] - fyA.eps).toFixed(2)} below the bottom of guidance. Weaker contribution margin is only partly offset by overhead savings.`,
      blocks: [{ h: 'Expectations gap', html: tbl }, { h: 'EPS bridge · plan → outlook', id: 'b-eps', foot: 'Click Contribution margin to see which brands and markets drive it.' }, { h: 'Valuation', html: stats([['Our P/E (outlook EPS)', pe.toFixed(1) + 'x', ''], ['Peer P/E', K.FIN.peerPE.toFixed(1) + 'x', dv(pe - K.FIN.peerPE, 'x', 1, 'vs peers')], ['Share price YTD', sPct(D.us), 'peers ' + sPct(D.peer)], ['Shares', (sh / 1e6).toFixed(1) + 'M', '']]) }],
      after: () => waterfall($('#b-eps'), eb, { startLabel: 'Plan EPS', endLabel: 'Outlook', fmt: v => '$' + v.toFixed(2), sfmt: v => (v >= 0 ? '+' : MINUS) + '$' + Math.abs(v).toFixed(2), onClick: it => { if (it.k === 'cm') { const saved = state.period; state.period = 'FY'; openContrib({}, win(), 'cogs', 'Cost of goods'); state.period = saved; } } }) }, true);
  }
}
function elasticity(rows, Wd) {
  const W = Wd || 400, H = 200, M = { l: 40, r: 10, t: 10, b: 28 }, xs = rows.map(r => r.real), ys = rows.map(r => r.volG);
  const xl = Math.min(0, ...xs) - .01, xh = Math.max(.06, ...xs) + .01, yl = Math.min(-.08, ...ys) - .01, yh = Math.max(.08, ...ys) + .01;
  const X = v => M.l + (v - xl) / (xh - xl) * (W - M.l - M.r), Y = v => M.t + (1 - (v - yl) / (yh - yl)) * (H - M.t - M.b);
  let g = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="fx" role="img" aria-label="Price change vs volume change by brand">`;
  ticks(xl, xh, 4).forEach(t => g += `<line x1="${X(t)}" x2="${X(t)}" y1="${M.t}" y2="${H - M.b}" stroke="var(--line)"/><text x="${X(t)}" y="${H - 10}" text-anchor="middle" class="ax">${(t * 100).toFixed(0)}%</text>`);
  ticks(yl, yh, 4).forEach(t => g += `<line x1="${M.l}" x2="${W - M.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="${Math.abs(t) < 1e-9 ? 'var(--line-2)' : 'var(--line)'}"/><text x="${M.l - 6}" y="${Y(t) + 3.5}" text-anchor="end" class="ax">${(t * 100).toFixed(0)}%</text>`);
  rows.forEach(r => { g += `<circle cx="${X(r.real)}" cy="${Y(r.volG)}" r="6" fill="var(--s1)" fill-opacity=".8" stroke="#fff" stroke-width="1.5"/><text x="${X(r.real) + 9}" y="${Y(r.volG) + 3.5}" class="ax lbl">${esc(r.label.split(' ')[0])}</text>`; });
  return g + `<text x="${W - M.r}" y="${H - 1}" text-anchor="end" class="ax">Price change vs LY →</text></svg>`;
}
function openPromo(pid) {
  const p = K.PROMOS.find(x => x.id === pid); if (!p) return; const v = verdict(p.roi), r = K.RETAILERS.find(x => x.id === p.ka);
  const why = p.b === 'crunch' ? 'Deep discounts in a trading-down market pulled demand forward and subsidised shoppers who would have bought anyway; the extra margin does not cover the cost.' : p.b === 'bolt' ? 'The price-marked pack came after the competitor cut and was too shallow to win shoppers back; the mechanic needs redesign.' : p.roi >= 1.2 ? 'Strong extra volume with little subsidy of normal sales.' : 'Positive but below plan; refine depth, timing or retailer execution.';
  openLevel({ crumb: p.name, title: p.name, insight: `${K.BMAP[p.b].name} · ${K.CMAP[p.c].name}${r ? ' · ' + r.name : ''} · Wk ${p.w0}–${p.w1}`, blocks: [{ html: stats([['Spend', fmt$(p.spend), 'depth ' + pct1(p.depth).replace('.0', '')], ['Volume lift', sPct(p.lift, 0), 'plan ' + sPct(p.planLift, 0)], ['Extra gross margin', fmt$(p.incGM), ''], ['ROI', p.roi.toFixed(2) + 'x', sevPill(v[0]).replace(SEV[v[0]], v[1])]]) }, { html: `<dl class="diag"><dt>Why</dt><dd>${aiTag} ${esc('Likely: ' + why)}</dd><dt>Execution</dt><dd>Retailer compliance ${pct1(p.compliance).replace('.0', '')} · volume ${sPct(p.volVsPlan - 1, 0)} vs forecast (Sales view)</dd><dt>Method</dt><dd class="muted">Post-event evaluation vs a modelled baseline, net of cannibalisation and pantry loading (synthetic).</dd></dl>` }] });
}

/* ================= controls & render ================= */
function seg(el, opts, cur, on) { el.innerHTML = opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join(''); el.onclick = e => { const b = e.target.closest('button'); if (b) on(b.dataset.v); }; }
const ROLE_INFO = { CEO: 'Overall health, the few issues that move the year, how we compare with the market.', CFO: 'Margin, trade spend, pricing and promotions (RGM), outlook vs guidance.', CMO: 'Market share, competitors, marketing and promotion returns.', CSO: 'Sales vs target by channel and key account, distribution, channel stock.', COO: 'Service levels, stock-outs, inventory, unit costs, procurement, quality.', FH: 'One overview of every function, for board-style reviews.' };
function buildControls() {
  $('#f-geo').innerHTML = '<option value="all">All geographies</option>' + K.REGIONS.map(r => r.countries.length > 1 ? `<optgroup label="${r.id}"><option value="r:${r.id}">All ${r.id}</option>${r.countries.map(c => `<option value="c:${c}">${K.CMAP[c].name}</option>`).join('')}</optgroup>` : `<option value="c:${r.countries[0]}">${r.id} · ${K.CMAP[r.countries[0]].name}</option>`).join('');
  $('#f-brand').innerHTML = '<option value="all">All categories</option>' + K.CATS.map(k => `<optgroup label="${k}"><option value="k:${k}">All ${k}</option>${K.BRANDS.filter(b => b.cat === k).map(b => `<option value="b:${b.id}">${b.name}</option>`).join('')}</optgroup>`).join('');
  $('#f-ch').innerHTML = '<option value="all">All channels</option>' + K.CHANNELS.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  $('#f-geo').onchange = e => { state.geo = e.target.value; render(); };
  $('#f-brand').onchange = e => { state.brand = e.target.value; render(); };
  $('#f-ch').onchange = e => { state.ch = e.target.value; render(); };
  $('#f-clear').onclick = () => { state.geo = 'all'; state.brand = 'all'; state.ch = 'all'; render(); };
  const pop = (btn, el) => { $(btn).onclick = e => { e.stopPropagation(); const open = $(el).hidden; closePops(); $(el).hidden = !open; $(btn).setAttribute('aria-expanded', open); }; };
  pop('#filters-btn', '#filters-pop'); pop('#settings-btn', '#settings-pop');
  document.addEventListener('click', e => { if (!e.target.closest('.pop-wrap')) closePops(); });
  $('#view-btn').onclick = () => openPicker();
  $('#picks').innerHTML = Object.entries(ROLES).map(([k, v]) => `<button class="pick" data-role="${k}"><b>${v.label}${k === 'FH' ? '' : ' view'}</b><span>${ROLE_INFO[k]}</span></button>`).join('');
  $('#picks').onclick = e => { const b = e.target.closest('[data-role]'); if (b) chooseRole(b.dataset.role); };
}
const closePops = () => { ['#filters-pop', '#settings-pop'].forEach(p => $(p).hidden = true); ['#filters-btn', '#settings-btn'].forEach(b => $(b).setAttribute('aria-expanded', 'false')); };
function openPicker() { $('#picks').querySelectorAll('.pick').forEach(p => p.classList.toggle('cur', p.dataset.role === state.role && state.chosen)); $('#picker').hidden = false; ($('#picks .pick.cur') || $('#picks .pick')).focus(); }
function chooseRole(r) {
  $('#picker').hidden = true; state.chosen = true;
  if (r === state.role && $('#view-body').childElementCount && !$('#view-body').hidden && state.rendered) return;
  state.role = r; state.period = ROLES[r].period; state.exAll = false; if (!SHORT.includes(state.period) && state.comp === 'M') state.comp = 'T';
  try { localStorage.setItem('kp-role', r); } catch (e) { }
  // switching views pulls a different set of data: show a short loading state rather than pretending it is instant
  $('#view-body').hidden = true; $('#loading').hidden = false; $('#loading-txt').textContent = `Loading ${ROLES[r].label}${r === 'FH' ? '' : ' view'}…`;
  syncControls();
  setTimeout(() => { $('#loading').hidden = true; $('#view-body').hidden = false; render(); state.rendered = true; }, 650);
}
const SHORT = ['LW', 'MTD', 'LM', 'R4W'];
function syncControls() {
  $('#view-name').textContent = ROLES[state.role].label;
  seg($('#f-period'), Object.entries(PERIODS).map(([k, v]) => [k, v.label]), state.period, v => { state.period = v; if (!SHORT.includes(v) && state.comp === 'M') state.comp = 'T'; render(); });
  seg($('#f-year'), [['CAL', 'Calendar'], ['FISCAL', 'Fiscal (Apr–Mar)']], state.year, v => { state.year = v; render(); });
  const comps = [['T', 'vs Target'], ['L', 'vs Last year']].concat(SHORT.includes(state.period) ? [['M', 'vs Last month']] : []);
  seg($('#f-comp'), comps, state.comp, v => { state.comp = v; render(); });
  $('#f-geo').value = state.geo; $('#f-brand').value = state.brand; $('#f-ch').value = state.ch;
  const act = [];
  if (state.geo !== 'all') act.push(['geo', $('#f-geo').selectedOptions[0].textContent]);
  if (state.brand !== 'all') act.push(['brand', $('#f-brand').selectedOptions[0].textContent]);
  if (state.ch !== 'all') act.push(['ch', K.CHMAP[state.ch].name]);
  $('#f-count').hidden = !act.length; $('#f-count').textContent = act.length;
  $('#active-filters').innerHTML = act.length ? act.map(([k, t]) => `<span class="fchip">${esc(t)}<button aria-label="Remove ${esc(t)} filter" data-rm="${k}">×</button></span>`).join('') : '<span>All geographies · all categories · all channels</span>';
  $('#active-filters').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { state[b.dataset.rm] = 'all'; render(); });
  const P = win(); $('#asof').innerHTML = `${P.label}: ${P.desc} ${compShort()} · Data as of <b>Wk ${CW}, w/e 11 Oct 2026</b>${state.year === 'FISCAL' ? ' · Fiscal year' : ''} · Synthetic data`;
}
function render() { syncControls(); renderStrip(); if (state.role === 'CEO' || state.role === 'CFO') renderRole(); else renderPlaceholder(); }

/* ================= events ================= */
document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]'); if (o && !e.target.closest('#drawer')) { openTile(o.dataset.open); return; }
  const x = e.target.closest('[data-ex]'); if (x && !e.target.closest('#drawer')) { openEx(x.dataset.ex); return; }
  const a = e.target.closest('[data-act]'); if (a) { const n = { Open: 'Assigned', Assigned: 'Done', Done: 'Open' }[a.dataset.s]; ACT[a.dataset.act] = n; a.dataset.s = n; a.textContent = n; return; }
  const fbk = e.target.closest('[data-fb]'); if (fbk) { fbk.textContent = 'Thanks · noted for this session'; fbk.disabled = true; return; }
});
$('#dr-close').onclick = closeDrawer; $('#scrim').onclick = closeDrawer;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#drawer').hidden) closeDrawer(); });
document.addEventListener('mouseover', e => { const i = e.target.closest('[data-def]'); if (!i) return; const d = DEF[i.dataset.def]; if (!d) return; const t = tip(); t.innerHTML = `<div class="th">${d[0]}</div>${d[1]}${d[2] ? `<div class="f">Formula: ${d[2]}</div>` : ''}`; t.hidden = false; const r = i.getBoundingClientRect(); t.style.left = Math.max(8, Math.min(innerWidth - 310, r.left)) + 'px'; t.style.top = (r.bottom + 6) + 'px'; });
document.addEventListener('mouseout', e => { if (e.target.closest('[data-def]')) hideTip(); });
function setTab(t) { $('#tab-dash').setAttribute('aria-selected', t === 'dash'); $('#tab-approach').setAttribute('aria-selected', t !== 'dash'); $('#view-dash').hidden = t !== 'dash'; $('#view-approach').hidden = t === 'dash'; }
$('#tab-dash').onclick = () => setTab('dash'); $('#tab-approach').onclick = () => setTab('approach');
let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!$('#view-dash').hidden) render(); }, 200); });

buildControls(); render(); state.rendered = true;
let stored = null; try { stored = localStorage.getItem('kp-role'); } catch (e) { }
if (stored && ROLES[stored]) state.chosen = true; else openPicker();
})();
