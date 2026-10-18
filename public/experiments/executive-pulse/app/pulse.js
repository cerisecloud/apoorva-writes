/* Pulse — executive dashboard application logic (views, exceptions engine, charts, drill panel). Synthetic data only. */
(function () {
'use strict';
const K = window.KD, NW = K.NW;
let CW = K.CW;   // last week of actuals; shifted temporarily by asOf() to rebuild earlier readings
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// highlight the figures that carry the message (amounts, rates, changes) in headline sentences
const emph = t => esc(t).replace(/\([+−]?(?:[$£]\d[\d.,]*[MBK]?|\d[\d.,]*\s?(?:%|pts|bps|x|M|B|K|weeks|days|share points|points)(?![a-z]))\)|[+−]?(?:[$£]\d[\d.,]*[MBK]?|\d[\d.,]*\s?(?:%|pts|bps|x|M|B|K|weeks|days|share points|points)(?![a-z]))/g, m => `<mark class="kf">${m}</mark>`);

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
  CEO: { label: 'CEO', period: 'YTD' }, CFO: { label: 'CFO', period: 'YTD' }, CMO: { label: 'CMO', period: 'YTD' },
  CSO: { label: 'CSO', period: 'YTD' }, COO: { label: 'COO', period: 'YTD' },   // one company default; each card also shows its own period
};
const state = { role: 'CEO', period: 'YTD', year: 'CAL', comp: 'T', geo: 'all', brand: 'all', ch: 'all' };
function perWin(k) {   // window for a period, relative to the current last week of actuals
  const m = monthOf(CW), cur = [], lm = []; for (let w = 1; w <= CW; w++) { if (monthOf(w) === m) cur.push(w); }
  for (let w = 1; w < (cur[0] || CW + 1); w++) if (monthOf(w) === (m + 11) % 12) lm.push(w);
  let q0 = 1; for (let w = 1; w <= CW; w++) if (monthOf(w) === m - m % 3) { q0 = w; break; }
  return { LW: [CW, CW], MTD: [cur[0] || CW, CW], LM: lm.length ? [lm[0], lm[lm.length - 1]] : [CW - 4, CW - 1], R4W: [CW - 3, CW], QTD: [q0, CW], YTD: [1, CW], FY: [1, NW] }[k];
}
function win() {
  const P = { ...PERIODS[state.period] }; [P.w0, P.w1] = perWin(state.period);
  if (state.year === 'FISCAL') {
    if (state.period === 'YTD') { P.w0 = FISCAL_START; P.desc = 'Fiscal YTD from Apr · Wk ' + FISCAL_START + '–' + CW; }
    if (state.period === 'QTD') P.desc = 'Fiscal Q3 to date · Wk 40–' + CW;
    if (state.period === 'FY') P.desc = 'Fiscal year Apr–Mar · actual + forecast';
  }
  P.wa = Math.min(P.w1, CW);   // last actual week in window
  return P;
}
const compShort = () => ({ T: 'vs plan', E: 'vs latest estimate', L: 'vs LY', M: 'vs last month' })[state.comp];
const compName = () => ({ T: 'plan', E: 'latest estimate', L: 'last year', M: 'last month' })[state.comp];
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
  const items = [['Cases sold', aggVol, 'vol'], ['Mix', vol - aggVol, 'mix'], ['Price', price, 'price'], ['Discounts & promos', trade, 'trade']];
  if (kind === 'gm') items.push(['Product cost', cogs, 'cogs']);
  if (kind === 'cm') items.push(['Product cost', cogs, 'cogs'], ['Delivery cost', dist, 'dist'], ['Marketing spend', ap, 'ap']);
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
const OWNED = { 'bolt|UK': { status: 'Owned', note: 'Action due 30 Oct' } };
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
  if (!child) child = { ch: f.ch && f.ch.length === 1 ? f.ch[0] : null, g: 0, r4: agg(f, 'A', CW - 3, CW).vol / agg(f, 'L', CW - 3, CW).vol - 1 };
  const chName = child.ch ? K.CHMAP[child.ch].name : 'Total';
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
      d.cause = `Losing share, not market: ${comp} cut prices in ${chName.toLowerCase()} while the category grew ${sPct(mktG)}.`;
      d.action = `Counter ${comp} in ${chName.toLowerCase()} with a price-pack at parity and stronger visibility, rather than a blanket price cut.`;
      d.value = Math.abs(d.fyCm) * .5; break;
    }
    case 'buying': {
      const trA = S.A.tr / S.A.gs, trC = S.C.tr / S.C.gs, gmA = (S.A.ns - S.A.cogs) / S.A.ns, gmL = (S.L.ns - S.L.cogs) / S.L.ns;
      const promo = K.PROMOS.filter(p => p.b === b && p.c === c && p.roi != null).sort((x, y) => x.roi - y.roi)[0];
      d.label = 'Promotion-funded growth'; d.owner = 'CFO (RGM)';
      d.chain = [`trade spend ${pct1(trA)} vs ${pct1(trC)} plan`, `volume ${sPct(S.A.vol / S.L.vol - 1, 0)} vs LY`, `net sales ${sPct(vr(S.A.ns, S.L.ns))} vs LY`, `gross margin ${sBps((gmA - gmL) * 1e4)} vs LY`];
      d.cause = `Growth is being bought: deep promotions${promo ? ` (worst: "${promo.name}", ROI ${promo.roi.toFixed(2)}x)` : ''} add volume but cost more margin than they bring.`;
      d.action = `Cap promotion depth back to plan and stop events below 0.8x ROI; move spend to multibuy and display mechanics.`;
      d.value = Math.abs(get('trade')) * .6; break;
    }
    case 'cost': {
      d.label = 'Input-cost inflation'; d.owner = 'CFO + Procurement';
      const cc = S.A.cogs / S.A.vol / (S.C.cogs / S.C.vol) - 1;
      d.chain = [`${K.BMAP[b || 'oats'].mat.toLowerCase()} cost ${sPct(.18, 0)}`, `cost per case ${sPct(cc, 0)} vs ${compName()}`, `price increase delayed at key retailers`, `contribution margin ${s$(d.cmGap)}`];
      d.cause = `${nsV >= -.005 ? 'Sales are on plan, but' : 'Sales are below target and'} costs rose faster than prices, so margin is ${s$(d.cmGap)} ${compShort()}. Likely driver: oat inflation, with the planned price increase delayed at key retailers.`;
      d.action = `Complete the price increase at the delayed retailers and extend hedge cover into H1; review pack-size options.`;
      d.value = Math.abs(d.fyCm) * .5; break;
    }
    case 'supply': {
      const breach = c ? retailersOf(c).filter(r => r.c === 'ID' && b === 'orchard' && (r.id === 'pp' || r.id === 'hn')) : [];
      d.label = 'Supply constraint'; d.owner = 'COO';
      d.chain = [`port disruption`, `fill rate ${pct1(fill4).replace('.0', '')}`, `lost sales ${fmt$(agg(f, 'A', 35, CW).lost)}`, `${breach.length} retailers below OTIF threshold`];
      d.cause = `Demand is there but we cannot supply it: inbound delays are causing lost sales and retailer contract breaches.`;
      d.action = `Expedite inbound supply, protect ${breach.map(r => r.name).join(' and ') || 'key accounts'}, and restore 95% fill within 3 weeks.`;
      d.value = agg(f, 'A', 35, CW).lost * 1.5; break;
    }
    case 'market': {
      d.label = 'Market decline'; d.owner = 'CFO + ' + (c ? K.CMAP[c].name : '') + ' GM';
      d.chain = [`category ${sPct(mktG)}`, `${B} ${sPct(vr(S.A.ns, S.L.ns))} vs LY`, `share ${sPts(shChg)}`, `market-driven miss`];
      d.cause = `The category is shrinking, not us: we are holding or gaining share, so the target likely needs re-basing.`;
      d.action = `Re-base the target for this market and protect share without deeper promotions.`;
      d.value = 0; break;
    }
    case 'opportunity': {
      const s0 = K.SERIES.find(s => s.b === b && s.c === c && s.ch === (child && child.ch)), days = b && c ? K.invDays(c, b, CW) : null;
      d.label = 'Opportunity'; d.owner = 'CMO + COO';
      d.chain = [`${chName} sales ${sPct(child.r4, 0)} vs LY`, s0 ? `every $1 of marketing returns ${s0.romi.toFixed(1)}x` : `share ${sPts(shChg)}`, days ? `but only ${days.toFixed(0)} days of stock vs ${K.INV_TARGET_DAYS} target` : `FY ${s$(d.fyNs)}`];
      d.cause = `Strong ${chName.toLowerCase()} demand with high marketing returns; stock may run short before the seasonal peak, capping the upside.`;
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
        cause: 'Shipments are running ahead of what shoppers buy (a distributor incentive pushed stock); expect lower orders and more returns in the coming weeks.',
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
  if (o.today && o.today < o.x1) g += `<rect x="${X(o.today)}" y="${M.t}" width="${X(o.x1) - X(o.today)}" height="${ph}" fill="#f3f4f6"/><line x1="${X(o.today)}" x2="${X(o.today)}" y1="${M.t}" y2="${M.t + ph}" stroke="var(--line-2)" stroke-dasharray="2 3"/><text x="${X(o.today) + 5}" y="${M.t + 11}" class="ax" style="font-weight:600">Forecast</text>`;
  (o.markers || []).forEach((m, i) => { g += `<line x1="${X(m.w)}" x2="${X(m.w)}" y1="${M.t}" y2="${M.t + ph}" stroke="var(--opp)" stroke-dasharray="3 3" opacity=".7"/><g class="mk" data-mk="${i}" style="cursor:help"><circle cx="${X(m.w)}" cy="${M.t + 6}" r="9" fill="transparent"/><circle cx="${X(m.w)}" cy="${M.t + 6}" r="5" fill="var(--opp)" stroke="#fff" stroke-width="1.5"/><text x="${X(m.w)}" y="${M.t + 9}" text-anchor="middle" style="fill:#fff;font-size:8px;font-weight:700">!</text></g>`; });
  o.series.forEach(s => {
    if (s.range) { let up = '', dn = ''; for (let w = s.from; w <= s.to; w++) { up += (w === s.from ? 'M' : 'L') + X(w) + ' ' + Y(s.range[1][w]); } for (let w = s.to; w >= s.from; w--) dn += 'L' + X(w) + ' ' + Y(s.range[0][w]); g += `<path d="${up}${dn}Z" fill="${s.color}" opacity=".12"/>`; }
    let d = ''; for (let w = s.from; w <= s.to; w++) if (isFinite(s.vals[w])) d += (d ? 'L' : 'M') + X(w).toFixed(1) + ' ' + Y(s.vals[w]).toFixed(1);
    if (s.area) g += `<path d="${d} L${X(s.to)} ${M.t + ph} L${X(s.from)} ${M.t + ph}Z" fill="${s.color}" opacity=".07"/>`;
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.w || 2}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    if (s.end) g += `<circle cx="${X(s.to)}" cy="${Y(s.vals[s.to])}" r="3.5" fill="${s.color}" stroke="#fff" stroke-width="2"/>`;
    if (s.label) g += `<text x="${Math.min(X(s.to) + 6, W - M.r - 2)}" y="${Y(s.vals[s.to]) + 3.5}" class="ax lbl" text-anchor="${X(s.to) + 60 > W ? 'end' : 'start'}">${esc(s.label)}</text>`;
  });
  g += `<line class="xh" x1="0" x2="0" y1="${M.t}" y2="${M.t + ph}" stroke="var(--ink-2)" opacity="0"/><rect class="hit" x="${M.l}" y="${M.t + 16}" width="${pw}" height="${ph - 16}" fill="transparent"/></svg>`;
  el.innerHTML = g;
  const svg = el.querySelector('svg'), xh = svg.querySelector('.xh'), hit = svg.querySelector('.hit');
  svg.querySelectorAll('.mk').forEach(n => { const m = o.markers[+n.dataset.mk]; n.addEventListener('mousemove', e => showTip(e, `<div class="th">Wk ${m.w} · external signal</div>${esc(m.text)}`)); n.addEventListener('mouseleave', hideTip); });
  if (o.tip) { hit.addEventListener('mousemove', e => { const r = svg.getBoundingClientRect(); let w = Math.round(o.x0 + ((e.clientX - r.left) * W / r.width - M.l) / pw * (o.x1 - o.x0)); w = Math.max(o.x0, Math.min(o.x1, w)); xh.setAttribute('x1', X(w)); xh.setAttribute('x2', X(w)); xh.setAttribute('opacity', .4); showTip(e, o.tip(w)); }); hit.addEventListener('mouseleave', () => { xh.setAttribute('opacity', 0); hideTip(); }); }
}
function waterfall(el, br, opts = {}) {
  if (!el) return;
  const W = Math.max(300, el.clientWidth || 460), H = opts.h || 240, M = { l: 6, r: 6, t: 22, b: opts.pctBase ? 42 : 30 };
  const its = [{ l: opts.startLabel || ({ T: 'Plan', E: 'Latest est.', L: 'Last year', M: 'Last month' })[state.comp], v: br.start, t: 'tot' }]; let run = br.start; const lv = [run];
  br.items.forEach(([l, v, k, kind]) => { if (kind === 'sub') { its.push({ l, v: run, t: 'tot', sub: true }); lv.push(run); return; } its.push({ l: l.replace('Discounts & promos', 'Discounts').replace('Marketing spend', 'Marketing').replace('Delivery cost', 'Delivery').replace('Inbound freight', 'Inbound').replace('Rush shipments', 'Rush'), v, t: 'd', from: run, to: run + v, k, full: l }); run += v; lv.push(run); });
  its.push({ l: opts.endLabel || 'Actual', v: br.end, t: 'tot' }); lv.push(br.end);
  const F = opts.fmt || fmt$, SF = opts.sfmt || (v => (v >= 0 ? '+' : MINUS) + fmt$(Math.abs(v))), upBad = !!opts.costUp;
  let lo = Math.min(...lv), hi = Math.max(...lv); const rg = (hi - lo) || Math.abs(hi) * .1 || 1; lo -= rg * .5; hi += rg * .25; if (opts.cascade) lo = 0;
  const pw = W - M.l - M.r, ph = H - M.t - M.b, bw = pw / its.length, Y = v => M.t + (1 - (v - lo) / (hi - lo)) * ph;
  let g = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Variance bridge"><line x1="${M.l}" x2="${W - M.r}" y1="${M.t + ph}" y2="${M.t + ph}" stroke="var(--line-2)"/>`;
  its.forEach((it, i) => {
    const cx = M.l + bw * i + bw / 2, w = Math.min(40, bw * .6), x = cx - w / 2; let y0, y1, fill, lab;
    if (it.t === 'tot') { y0 = Y(it.v); y1 = M.t + ph; fill = i === 0 ? '#b9bfc7' : it.sub ? '#7b828b' : 'var(--ink)'; lab = F(it.v); } else { y0 = Y(Math.max(it.from, it.to)); y1 = Y(Math.min(it.from, it.to)); fill = opts.cascade ? '#c9ced5' : (it.v >= 0) !== upBad ? 'var(--s1)' : 'var(--neg)'; lab = Math.abs(it.v) < Math.abs(br.start) * .004 ? '' : SF(it.v); }
    const fs = bw < 46 ? 9.5 : 10.5;
    g += `<g class="wf" data-i="${i}" ${it.t === 'd' && opts.onClick ? 'tabindex="0" role="button" style="cursor:pointer"' : ''}><rect x="${cx - bw / 2}" y="${M.t}" width="${bw}" height="${ph}" fill="transparent"/><rect x="${x}" y="${y0}" width="${w}" height="${Math.max(1.5, y1 - y0)}" rx="3" fill="${fill}"/><text x="${cx}" y="${y0 - 6}" text-anchor="middle" class="ax ${it.t === 'tot' ? 'strong' : 'lbl'}" style="font-size:${fs}px">${lab}</text><text x="${cx}" y="${H - (opts.pctBase ? 22 : 10)}" text-anchor="middle" class="ax" style="font-size:${fs}px">${esc(it.l)}</text>${opts.pctBase && it.t === 'd' ? `<text x="${cx}" y="${H - 8}" text-anchor="middle" class="ax" style="font-size:${fs - .5}px">${(it.v >= 0 ? '+' : MINUS) + Math.abs(it.v / opts.pctBase * 100).toFixed(1)}%</text>` : ''}</g>`;
    if (i < its.length - 1) { const yy = Y(it.t === 'tot' ? it.v : it.to); g += `<line x1="${x + w}" x2="${M.l + bw * (i + 1) + bw / 2 - w / 2}" y1="${yy}" y2="${yy}" stroke="var(--line-2)" stroke-dasharray="2 2"/>`; }
  });
  g += '</svg>';
  el.innerHTML = g;
  el.querySelectorAll('.wf').forEach(n => { const it = its[+n.dataset.i];
    n.addEventListener('mousemove', e => showTip(e, `<div class="th">${esc(it.t === 'tot' ? it.l : it.full + ' effect')}</div><div class="num">${it.t === 'tot' ? F(it.v) : SF(it.v)}${opts.pctBase && it.t === 'd' ? ' · ' + (it.v >= 0 ? '+' : MINUS) + Math.abs(it.v / opts.pctBase * 100).toFixed(1) + '% ' + (opts.pctLabel || 'of net sales') : ''}</div>${it.t === 'd' && opts.onClick ? '<div class="f">Click to see contributors</div>' : ''}`));
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

/* ================= drill panel ================= */
const drill = { stack: [] };
function openLevel(level, reset) { level.step = level.step || STEP.cur; STEP.cur = null; if (reset && !drill.pushNext) drill.stack = []; drill.pushNext = false; if (!drill.stack.length) level.root = level.root || drill.root; drill.stack.push(level); paintBand(); }
function stats(arr) { return `<div class="stats">${arr.map(s => `<div class="stat"><span class="l">${esc(s[0])}</span><span class="v num">${s[1]}</span><span class="d num">${s[2] || ''}</span></div>`).join('')}</div>`; }
function weeklyNs(f) { const a = new Float64Array(NW + 1), t = new Float64Array(NW + 1), l = new Float64Array(NW + 1); for (let w = 1; w <= NW; w++) { a[w] = agg(f, 'A', w, w).ns; t[w] = agg(f, 'T', w, w).ns; l[w] = agg(f, 'L', w, w).ns; } return { a, t, l }; }
function nsTrend(id, f, P, markers) {
  const W = weeklyNs(f);
  return () => lineChart($('#' + id), { x0: 1, x1: NW, h: 190, band: [P.w0, P.wa], today: CW + .5, yfmt: fmt$, markers,
    series: [{ vals: W.l, from: 1, to: NW, color: '#b9bfc7', w: 1.5, dash: '1 3' }, { vals: W.t, from: 1, to: NW, color: '#7b828b', w: 1.5, dash: '5 3' }, { vals: W.a, from: 1, to: CW, color: 'var(--s1)', area: true, end: true }, { vals: W.a, from: CW, to: NW, color: 'var(--s1)', dash: '4 3' }],
    tip: w => `<div class="th">Wk ${w}${w > CW ? ' · forecast' : ''}</div>${trow(w > CW ? 'Forecast' : 'Actual', fmt$(W.a[w]))}${trow('Plan', fmt$(W.t[w]) + ' ' + sPct(vr(W.a[w], W.t[w])))}${trow('Last year', fmt$(W.l[w]) + ' ' + sPct(vr(W.a[w], W.l[w])))}` });
}
const trow = (a, b) => `<div class="tr"><span>${a}</span><b class="num">${b}</b></div>`;
const LEG_TREND = '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>Actual</span><span><i class="dash" style="border-color:var(--s1)"></i>Forecast</span><span><i class="dash"></i>Plan</span><span><i class="dash light"></i>Last year</span><span><i class="dot" style="background:var(--opp)"></i>External signal</span></div>';
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
function diagHtml(d, owned, rankNote) {
  if (!d) return '<p class="muted">No material deviation in this slice.</p>';
  return `<dl class="diag"><dt>What's happening</dt><dd>${sevPill(d.sev)} ${dirPill(d.dir)} ${aiTag} <b>${esc(d.cause)}</b></dd><dt>The numbers</dt><dd>${d.chain.map(esc).join(' <i>→</i> ')}</dd><dt>Do next</dt><dd>${esc(d.action)}</dd><dt>Owner</dt><dd>${esc(d.owner)}${owned ? ` <span class="pill own">● ${owned.status} · ${owned.note}</span>` : ''}</dd>${rankNote ? `<dt>Why it ranks here</dt><dd class="muted">${rankNote}</dd>` : ''}</dl>`;
}
function gapStats(S, d, P) {
  return stats([['Sales gap so far', s$(S.A.ns - S.C.ns), `${P.label} ${compShort()}`], ['Margin gap so far', s$(d ? d.cmGap : S.A.cm - S.C.cm), `${P.label} ${compShort()}`], ['Full-year sales gap', s$(S.FA.ns - S.FT.ns), 'vs plan, if nothing changes'], ['Recoverable if fixed', d && d.value ? '~' + fmt$(d.value) : d && d.cls === 'market' ? 'Re-base target' : '—', 'estimate: about half the gap']]);
}
function openSlice(f, reset) {
  const P = win(), S = slice(f, P), d = diagnose(f, S, P), sb = sliceBlocks(f, P);
  openLevel({ crumb: nameOf(f), title: nameOf(f), insight: null, blocks: [{ html: diagHtml(d) }, { html: gapStats(S, d, P) }, ...sb.blocks], after: sb.after, focus: f }, reset);
}
function openEx(id) {
  const e = (window.__ex || []).find(x => x.id === id); if (!e) return;
  const P = win(), d = e.d, sb = sliceBlocks(e.f, P);
  const note = `Ranked on the full-year gap vs plan if nothing changes: ${s$(d.fyNs)} sales${d.fyCm ? ', ' + s$(d.fyCm) + ' margin' : ''}${d.dir === 'worse' ? '; the gap widened over the last 4 weeks' : ''}.`;
  openLevel({ crumb: e.title, title: e.title, insight: null, blocks: [{ html: diagHtml(d, e.owned, note) }, { html: gapStats(e.S, d, P) }, ...sb.blocks], after: sb.after, focus: e.f }, true);
}
function openContrib(f, P, key, label, kind) {
  kind = kind || 'cm';
  const rows = [];
  for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const ff = sub(f, { b: [b], c: [c] }); if (!has(ff)) continue; const br = bridge(ff, P, kind); const it = br.items.find(i => i[2] === key); if (!it) continue; rows.push({ label: K.BMAP[b].name + ' · ' + K.CMAP[c].name, v: key === 'mix' ? br.perSeriesVol - br.items[0][1] : it[1], slice: ff }); }
  rows.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)); const top = rows.slice(0, 8);
  const expl = { vol: 'Change in cases sold, valued at planned unit contribution.', mix: 'Shift between higher- and lower-margin channels within each brand and market.', price: 'List-price realization vs plan on actual volume.', trade: 'Trade spend, discounts and returns vs plan (negative = deeper discounting).', cogs: 'Cost of goods per case vs plan (commodities, packaging, conversion).', dist: 'Warehousing, freight and handling per case vs plan.', ap: 'A&P spend vs budget (negative = overspend).' }[key];
  openLevel({ crumb: label, title: label + ' effect', insight: expl, blocks: [{ h: 'Largest contributors (brand × country)', html: divBars(top.map(r => ({ label: r.label, v: r.v })), v => s$(v), { click: true }) }], after: () => { $('#band-body').querySelectorAll('.dbar.click').forEach(n => { const go = () => openSlice(top[+n.dataset.i].slice); n.onclick = go; n.onkeydown = e => { if (e.key === 'Enter') go(); }; }); } });
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
      after: () => { nsTrend('b-tr', f, P)(); $('#band-body').querySelectorAll('.dbar.click').forEach(n => { const go = () => openSlice(shown[+n.dataset.i].slice); n.onclick = go; n.onkeydown = e => { if (e.key === 'Enter') go(); }; }); } }, true);
  } else if (id === 'Sh2') {
    const br = bridge(f, { ...P, w0: P.w0, w1: P.w1, wa: P.wa }, 'ns');
    const saved = state.comp; state.comp = 'L'; const brL = bridge(f, P, 'ns'); state.comp = saved;
    openLevel({ crumb: 'Organic growth', title: 'Organic growth: volume, price and mix', insight: `Growth vs LY splits into volume ${s$(brL.items[0][1])}, mix ${s$(brL.items[1][1])}, price ${s$(brL.items[2][1])} and trade & promo ${s$(brL.items[3][1])}.`,
      blocks: [{ h: 'Net sales bridge · last year → actual', id: 'b-wf' }, { h: 'Net sales bridge · ' + compName() + ' → actual', id: 'b-wf2' }], after: () => { waterfall($('#b-wf'), brL, { startLabel: 'Last year', onClick: it => openContrib(f, P, it.k, it.full) }); waterfall($('#b-wf2'), br, { onClick: it => openContrib(f, P, it.k, it.full) }); } }, true);
  } else if (id === 'Sh3' || id === 'Sh4' || id === 'C15') {
    const w1 = P.w1 > CW ? NW : P.w1, A = K.finance({}, 'A', P.w0, w1), T = K.finance({}, 'T', P.w0, w1), L = K.finance({}, 'L', P.w0, w1);
    const lines = [['Net sales', 'ns'], ['Gross margin', 'gm'], ['Contribution margin', 'cm'], ['Overheads', 'overhead', -1], ['Operating profit', 'op'], ['Net profit', 'np']];
    const cascade = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Company P&amp;L · ${P.label}</th><th class="r">Actual</th><th class="r">vs plan</th><th class="r">vs LY</th></tr></thead><tbody>${lines.map(([l, k, g]) => `<tr><td>${l}</td><td class="r num"><b>${fmt$(A[k])}</b></td><td class="r num">${dv(vr(A[k], T[k]), 'pct', g || 1)}</td><td class="r num">${sPct(vr(A[k], L[k]))}</td></tr>`).join('')}<tr><td>EPS (FY outlook)</td><td class="r num"><b>$${D.fyA.eps.toFixed(2)}</b></td><td class="r num">${dv(D.fyA.eps - D.fyT.eps, 'eps', 1)}</td><td class="r num">${sPct(vr(D.fyA.eps, K.finance({}, 'L', 1, NW).eps))}</td></tr></tbody></table></div>`;
    const br = bridge(f, P, 'cm');
    openLevel({ crumb: 'Profit', title: id === 'C15' ? 'Net profit and EPS' : id === 'Sh3' ? 'Operating profit' : 'Contribution margin', insight: `Operating profit is ${sPct(vr(A.op, T.op))} vs plan. Margin after direct costs is ${sPct(vr(D.A.cm, D.C.cm))} ${compShort()}; lower overheads ${sPct(-vr(A.overhead, T.overhead))} are covering part of the gap.`,
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
    openLevel({ crumb: 'FY outlook', title: 'Full-year outlook and catch-up', insight: `To hit the FY plan we need ${fmt$(need)} a week for the remaining ${remain} weeks vs ${fmt$(cur)} now: a ${sPct(need / cur - 1)} uplift on current pace.`,
      blocks: [{ h: 'Cumulative net sales · actual + forecast range vs plan', id: 'b-cum', html: '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>Actual + forecast (range)</span><span><i class="dash"></i>Plan</span><span><i class="dash light"></i>Last year</span></div>' },
        { h: 'Run rate required vs current', html: bullet(cur, need, fmt$) }, { h: 'Catch-up map · who must deliver more, and who has headroom', html: catch_ }],
      after: () => lineChart($('#b-cum'), { x0: 1, x1: NW, h: 190, zero: true, today: CW + .5, yfmt: fmt$, series: [{ vals: cumL, from: 1, to: NW, color: '#b9bfc7', w: 1.5, dash: '1 3' }, { vals: cumT, from: 1, to: NW, color: '#7b828b', w: 1.5, dash: '5 3' }, { vals: cumA, from: 1, to: CW, color: 'var(--s1)', end: true }, { vals: cumA, from: CW, to: NW, color: 'var(--s1)', dash: '4 3', range: [lo, hi] }], tip: w => `<div class="th">Wk ${w}</div>${trow('Actual/forecast', fmt$(cumA[w]))}${trow('Plan', fmt$(cumT[w]))}` }) }, true);
  } else if (id === 'Sh6' || id === 'C2') {
    const rows = []; for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const ff = sub(f, { b: [b], c: [c] }); if (!has(ff)) continue; const sh = K.share(ff, K.MKT_LAST - 3, K.MKT_LAST), m = K.MKT[c + '|' + K.BMAP[b].sub], others = [m.comp1A[K.MKT_LAST], m.shareLY[2], m.shareLY[3]], rank = 1 + others.filter(x => x > sh.now).length, lead = Math.max(...others); rows.push({ label: K.BMAP[b].name + ' · ' + K.CMAP[c].name, sh, rank, rel: sh.now / lead, top3: [sh.now, ...others].sort((x, y) => y - x).slice(0, 3).reduce((x, y) => x + y, 0), slice: ff }); }
    rows.sort((x, y) => x.sh.chg - y.sh.chg);
    const tbl = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Brand · country</th><th class="r">Share</th><th class="r">vs LY</th><th class="r">Rank</th><th class="r">vs leader</th><th class="r">Market</th><th class="r">Top-3 hold</th></tr></thead><tbody>${rows.map(r => `<tr class="click" tabindex="0" data-slice='${JSON.stringify(r.slice)}'><td>${esc(r.label)}</td><td class="r num">${pct1(r.sh.now)}</td><td class="r num">${dv(r.sh.chg * 100, 'pts', 1)}</td><td class="r num">#${r.rank}</td><td class="r num">${r.rel.toFixed(2)}x</td><td class="r num">${sPct(r.sh.mktGrowth)}</td><td class="r num">${pct1(r.top3)}</td></tr>`).join('')}</tbody></table></div><p class="foot">Market data: 4 weeks ending 20 Sep 2026 · measured channels (coverage ${countriesOf(f).map(c => K.CMAP[c].name + ' ' + Math.round(K.CMAP[c].coverage * 100) + '%').join(', ')}). "vs leader" above 1.0x means we lead. Channel filter is not applied to market data.</p>`;
    const crow = countriesOf(f).filter(c => has(sub(f, { c: [c] }))).map(c => { const sh = K.share(sub(f, { c: [c] }), K.MKT_LAST - 3, K.MKT_LAST); return { label: K.CMAP[c].name, a: sh.mktGrowth, b: sh.ourGrowth, note: sPts(sh.chg * 100).replace(' pts', '') }; });
    openLevel({ crumb: 'Market share', title: 'Market share and growth vs market', insight: `Share ${pct1(D.sh.now)} ${sPts(D.sh.chg * 100)} vs LY.${rows.length > 1 && rows[0].sh.chg < 0 ? ` Biggest loss: ${rows[0].label} ${sPts(rows[0].sh.chg * 100)}.` : ''}${rows.length > 1 && rows[rows.length - 1].sh.chg > 0 ? ` Biggest gain: ${rows[rows.length - 1].label} ${sPts(rows[rows.length - 1].sh.chg * 100)}.` : ''}`,
      blocks: [{ h: 'Our growth vs market growth, by country', html: dumbbell(crow, { W: DW() }) }, { h: 'Share by brand × country (worst first)', html: tbl }] }, true);
  } else if (id === 'Sh7' || id === 'C4') {
    const sp = K.SHARE_PRICE, us = new Float64Array(CW + 1), pe = new Float64Array(CW + 1); for (let w = 1; w <= CW; w++) { us[w] = sp.us[w] / sp.start * 100; pe[w] = sp.peer[w]; }
    openLevel({ crumb: 'Shareholder value', title: 'Share price and TSR vs peers', insight: `Our shares ${sPct(D.us)} YTD vs peers ${sPct(D.peer)}. The gap opened after the Q2 results (Wk 30); the drivers investors watch are on this page: organic growth, margin and the EPS outlook below guidance.`,
      blocks: [{ h: 'Indexed share price (start of year = 100)', id: 'b-sp', html: '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>Northstar</span><span><i class="dash"></i>Peer index</span></div>' }, { h: 'What investors are reacting to', html: stats([['Organic growth (FY)', sPct(D.FA.ns / agg({}, 'L', 1, NW).ns - 1), 'consensus ' + sPct(K.FIN.consensus.organic)], ['EPS (FY outlook)', '$' + D.fyA.eps.toFixed(2), 'consensus $' + K.FIN.consensus.eps.toFixed(2)], ['Contribution margin', sPct(vr(D.A.cm, D.C.cm)), compShort()], ['Market share', pct1(D.sh.now), sPts(D.sh.chg * 100) + ' vs LY']]) }],
      after: () => lineChart($('#b-sp'), { x0: 1, x1: CW, h: 180, yfmt: v => v.toFixed(0), series: [{ vals: pe, from: 1, to: CW, color: '#7b828b', w: 1.5, dash: '5 3', label: 'Peers' }, { vals: us, from: 1, to: CW, color: 'var(--s1)', end: true, label: 'Northstar' }], markers: [{ w: 30, text: 'Q2 results' }], tip: w => `<div class="th">Wk ${w}</div>${trow('Northstar', us[w].toFixed(1))}${trow('Peers', pe[w].toFixed(1))}` }) }, true);
  }
}
const DW = () => { const b = $('#band'); const w = (b && b.clientWidth) || Math.min(1400, innerWidth); return Math.max(260, Math.min(560, (innerWidth > 1000 ? w / 2 : w) - 70)); };
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
  rerender(); window.scrollTo({ top: 0, behavior: 'smooth' });
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
function bulletMini(actual, target, fmt, Wd, la, lt) {
  const W = Wd || 260, lo = Math.min(0, actual, target), mx = Math.max(actual, target) * 1.18 || 1, X = v => (v - lo) / (mx - lo) * W;
  return `<svg viewBox="0 0 ${W} 40" width="${W}" height="40" class="fx" role="img" aria-label="${la} ${fmt(actual)} vs ${lt} ${fmt(target)}"><rect x="0" y="8" width="${W}" height="12" rx="4" fill="var(--surface-3)"/><rect x="${X(Math.min(0, actual))}" y="10.5" width="${Math.abs(X(actual) - X(0))}" height="7" rx="3" fill="${actual >= target ? 'var(--s1)' : 'var(--neg)'}"/><line x1="${X(target)}" x2="${X(target)}" y1="3" y2="25" stroke="var(--ink)" stroke-width="2"/><text x="0" y="37" class="ax">${la} ${fmt(actual)}</text><text x="${W}" y="37" text-anchor="end" class="ax strong">${lt} ${fmt(target)}</text></svg>`;
}
function openCFO(id) {
  const f = filter(), P = win(), A = agg(f, 'A', P.w0, P.w1), C = compAgg(f, P), D = stripData();
  if (id === 'F1') {
    const brg = bridge(f, P, 'gm');
    // cost-of-goods per case bridge: comparator cost per case -> materials, packaging, conversion, inbound freight -> actual
    const pc = (x, k) => x[k] / x.vol, comps = [['Materials', 'mat'], ['Packaging', 'pack'], ['Conversion', 'conv'], ['Inbound freight', 'inb']];
    const cb = { kind: 'cpc', start: C.cogs / C.vol, end: A.cogs / A.vol, items: comps.map(([l, k]) => [l, pc(A, k) - pc(C, k), k]) };
    openLevel({ crumb: 'Gross margin', title: 'Gross margin %', insight: `Gross margin ${pct1((A.ns - A.cogs) / A.ns)} ${sBps(((A.ns - A.cogs) / A.ns - (C.ns - C.cogs) / C.ns) * 1e4)} ${compShort()}. Cost per case ${sPct(cb.end / cb.start - 1)}, mostly materials.`,
      blocks: [{ h: 'Gross margin bridge · ' + compName() + ' → actual', id: 'b-wf', foot: 'Click a bar to see which brands and markets drive it.' }, { h: 'Cost per case bridge · ' + compName() + ' → actual', id: 'b-wf2', foot: 'Per standard case. Materials carry commodity inflation; conversion rises when volume falls (fixed costs spread over fewer cases).' }, { h: 'A&P spend vs budget', html: stats([['A&P spend', fmt$(A.ap), dv(vr(A.ap, C.ap), 'pct', -1, compShort())], ['A&P % net sales', pct1(A.ap / A.ns), ''], ['Distribution % net sales', pct1(A.dist / A.ns), dv(vr(A.dist / A.vol, C.dist / C.vol), 'pct', -1, 'per case')], ['Flow-through', Math.abs(A.ns - C.ns) > Math.abs(C.ns) * .01 && Math.abs((A.cm - C.cm) / (A.ns - C.ns)) < 2 ? pct1((A.cm - C.cm) / (A.ns - C.ns)) : 'n/m', Math.abs(A.ns - C.ns) > Math.abs(C.ns) * .01 ? 'Share of the sales change that reached margin' : 'Not meaningful: sales are close to plan']]) }],
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
      blocks: [{ h: 'Promotion ROI', html: (() => { const ev = promosIn(f).filter(p => p.roi != null), roi = ev.length ? ev.reduce((x, p) => x + p.incGM, 0) / ev.reduce((x, p) => x + p.spend, 0) : NaN; return stats([['Promotion ROI', isFinite(roi) ? roi.toFixed(2) + 'x' : '—', 'plan 1.20x'], ['Events below 0.8x', String(ev.filter(p => p.roi < .8).length), 'of ' + ev.length], ['Volume on promotion', pct1(pv / tv), 'of volume']]) + '<button class="link go" data-go="F5">All promotion results ›</button>'; })() }, { h: 'Trade spend by key account (largest overspend first)', html: tbl }, { h: 'Returns vs provision', html: `<div class="tbl-wrap"><table class="t"><thead><tr><th>Country</th><th class="r">Returns</th><th class="r">Provision</th><th class="r">Gap</th></tr></thead><tbody>${ret.map(r => `<tr><td>${r.label}</td><td class="r num">${fmt$(r.ret)}</td><td class="r num">${fmt$(r.prov)}</td><td class="r num">${dv(r.ret - r.prov, '$', -1)}</td></tr>`).join('')}</tbody></table></div>` },
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
      blocks: [{ h: 'RGM scorecard · plan vs actual', html: sc }, { h: 'Price realization by country', html: pt }, { h: '', html: '<button class="link go" data-go="F4">Inflation chain: costs, prices and demand ›</button>' }, { h: 'Price vs volume response, by brand (price elasticity)', html: elasticity(byB, DW()) + '<p class="foot">Each dot: list-price change vs LY (x) against volume change vs LY (y). Brands lower-right lost volume after pricing.</p>' }] }, true);
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
      blocks: [{ h: 'Events by ROI (lowest first) · click for detail', html: tbl }], after: () => $('#band-body').querySelectorAll('[data-promo]').forEach(r => { const go = () => openPromo(r.dataset.promo); r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter') go(); }; }) }, true);
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


/* ================= shared calculations kept from the strip ================= */
function rankText(f) {
  let lead = 0, n = 0, single = null;
  for (const c of countriesOf(f)) for (const b of brandsOf(f)) {
    const m = K.MKT[c + '|' + K.BMAP[b].sub], sh = K.share({ c: [c], b: [b] }, K.MKT_LAST - 3, K.MKT_LAST).now;
    const others = [m.comp1A[K.MKT_LAST], m.shareLY[2], m.shareLY[3]], rank = 1 + others.filter(x => x > sh).length; n++; if (rank === 1) lead++;
    single = { rank, leader: Math.max(...others), sh };
  }
  if (n === 1) return single.rank === 1 ? `Market leader · ${(single.sh / single.leader).toFixed(1)}x the next brand` : `No. ${single.rank} in this market · leader has ${pct1(single.leader)}`;
  return `Market leader in ${lead} of ${n} markets`;
}
function stripData() {
  const f = filter(), P = win(), A = agg(f, 'A', P.w0, P.w1), C = compAgg(f, P), L = agg(f, 'L', P.w0, P.w1), T = agg(f, 'T', P.w0, P.w1);
  const opW1 = P.w1 > CW ? 52 : P.w1;
  const opA = K.finance({}, 'A', P.w0, opW1), opC = state.comp === 'M' ? K.finance({}, 'A', Math.max(1, P.w0 - 4), Math.max(1, P.wa - 4)) : K.finance({}, state.comp, P.w0, opW1);
  const FA = agg(f, 'A', 1, NW), FT = agg(f, 'T', 1, NW), fyA = K.finance({}, 'A', 1, NW), fyT = K.finance({}, 'T', 1, NW);
  const sh = K.share(f, K.MKT_LAST - 3, K.MKT_LAST), sp = K.SHARE_PRICE, us = sp.us[CW] / sp.start - 1, peer = sp.peer[CW] / 100 - 1;
  return { f, P, A, C, L, T, opA, opC, FA, FT, fyA, fyT, sh, us, peer };
}

/* ================= role home: data helpers ================= */
const monthWk = () => { const r = []; for (let w = 1; w <= NW; w++) if (monthOf(w) === monthOf(CW)) r.push(w); return r; };   // weeks of the current month
function headsData(f) {
  const cs = countriesOf(f), ff = { b: f.b, ch: f.ch }, out = [];
  const elapsed = monthWk().filter(w => w <= CW).length, total = monthWk().length;
  for (const c of cs) {
    const hs = K.SALES_HEADS.filter(h => h.c === c); if (!hs.length) continue;
    const fc = { ...ff, c: [c] }; if (!has(fc)) continue;
    const A = agg(fc, 'A', monthWk()[0], CW), T = agg(fc, 'T', monthWk()[0], CW), TM = agg(fc, 'T', monthWk()[0], monthWk()[total - 1]);
    const k = hs.map(h => h.w * (1 + h.perf)), sk = k.reduce((x, y) => x + y, 0), sw = hs.reduce((x, h) => x + h.w, 0);
    hs.forEach((h, i) => { const a = A.ns * k[i] / sk, t = T.ns * h.w / sw, tm = TM.ns * h.w / sw, proj = a / elapsed * total; out.push({ ...h, a, t, tm, proj, att: a / t, pv: proj / tm, slice: fc }); });
  }
  return out;
}
const headSev = h => h.pv >= 1 ? 'good' : h.pv >= .97 ? 'warn' : 'crit';
function accountsData(f, P) {
  const out = [];
  for (const r of K.RETAILERS) {
    if (f.c && !f.c.includes(r.c)) continue; if (f.ch && !f.ch.includes(r.ch)) continue;
    const ff = { b: f.b, c: [r.c], ch: [r.ch] }; if (!has(ff)) continue;
    const a = agg(ff, 'A', P.w0, P.w1), c = compAgg(ff, P), r4 = agg(ff, 'A', CW - 3, CW);
    const story = r.c === 'ID' && (r.id === 'pp' || r.id === 'hn');
    const otif = Math.min(.995, (story ? r4.fill - .015 : r4.fill + .005) - (r.id === 'cc' ? .006 : 0));
    const fines = otif < r.otif ? r4.ns * r.share * .03 * (1 - otif) * 13 : 0;   // quarter-run-rate estimate: 3% of non-compliant value
    const promo = K.PROMOS.filter(p => p.ka === r.id && p.compliance != null);
    out.push({ ...r, otifT: r.otif, a: a.ns * r.share, t: c.ns * r.share, gap: (a.ns - c.ns) * r.share, att: a.ns / c.ns, otif, fines, compliance: promo.length ? promo.reduce((x, p) => x + p.compliance, 0) / promo.length : null, slice: ff });
  }
  return out;
}
function channelStock(f) {
  const out = [];
  for (const c of countriesOf(f)) for (const ch of channelsOf({ ...f, c: [c] })) { const ff = { b: f.b, c: [c], ch: [ch] }, w = agg(ff, 'A', CW, CW), r4 = agg(ff, 'A', CW - 3, CW); out.push({ c, ch, label: K.CMAP[c].name + ' · ' + K.CHMAP[ch].name, cover: w.stock / w.cons, normal: K.CHMAP[ch].cover, gap: r4.vol / r4.cons - 1, slice: ff }); }
  return out.sort((a, b) => b.cover / b.normal - a.cover / a.normal);
}
function warehouseData(f) {
  const out = [];
  for (const wh of K.WAREHOUSES) {
    if (f.c && !f.c.includes(wh.c)) continue;
    const bs = brandsOf(f).filter(b => has({ b: [b], c: [wh.c] })); if (!bs.length) continue;
    const n = K.WAREHOUSES.filter(x => x.c === wh.c).length, j = K.WAREHOUSES.filter(x => x.c === wh.c).indexOf(wh);
    let wsum = 0, d = 0; for (const b of bs) { const ns = agg({ b: [b], c: [wh.c] }, 'A', CW - 3, CW).ns; wsum += ns; d += ns * K.invDays(wh.c, b, CW); }
    const days = d / wsum * (n > 1 ? (j ? 1.06 : .94) : 1);
    out.push({ ...wh, days, brands: bs });
  }
  return out;
}
function stockRisk(f) {
  const out = [];
  for (const c of countriesOf(f)) for (const b of brandsOf(f)) { if (!has({ b: [b], c: [c] })) continue; const d = K.invDays(c, b, CW), lead = K.CMAP[c].leadDays;
    if (d < lead + 4) K.BMAP[b].skus.forEach(([sku, w], i) => { const dd = d * (1 + (i - 1) * .12); if (dd < lead + 2) out.push({ c, b, sku, days: dd, lead, wh: K.WAREHOUSES.find(x => x.c === c).name }); }); }
  return out.sort((a, b) => a.days / a.lead - b.days / b.lead);
}
function lrpData(f) {
  const out = [], cats = [...new Set(brandsOf(f).map(b => K.BMAP[b].cat))];
  let t24 = 0, t26 = 0, tp = 0;
  for (const cat of cats) {
    const bs = brandsOf(f).filter(b => K.BMAP[b].cat === cat), ff = { ...f, b: bs }; if (!has(ff)) continue;
    const n25 = agg(ff, 'L', 1, NW).ns, n26 = agg(ff, 'A', 1, NW).ns, n24 = n25 / (1 + K.LRP.g2025[cat]);
    const act = Math.sqrt(n26 / n24) - 1, plan = K.LRP.planCagrCat[cat], ind = K.LRP.industryCagr[cat];
    out.push({ cat, n24, n25, n26, p27: n24 * Math.pow(1 + plan, 3), act, plan, ind }); t24 += n24; t26 += n26; tp += n24 * Math.pow(1 + plan, 3);
  }
  const act = Math.sqrt(t26 / t24) - 1, plan = Math.pow(tp / t24, 1 / 3) - 1, ind = out.reduce((x, r) => x + r.ind * r.n26, 0) / t26;
  return { rows: out, act, plan, ind, t24, t26, tp };
}

/* ================= core metrics per role ================= */
const tileW = () => { const t = $('#metrics'); return t ? Math.max(180, t.clientWidth / (CORE[state.role].length + 1) - 30) : 220; };
const CORE = {
  CEO: ['C1', 'C2', 'C3', 'C4'], CFO: ['F1', 'F2', 'F3', 'F4', 'F5'], CMO: ['M1', 'M2', 'M3', 'M4'], CSO: ['S1', 'S2', 'S3', 'S4'], COO: ['O1', 'O2', 'O3', 'O4', 'O5'],
};
function coreTile(id, f, P, D) {
  const A = D.A, C = D.C, L = D.L, T = D.T, w0 = Math.max(1, CW - 12), scC = state.comp === 'L' ? 'L' : 'T';
  const sp = (fn, cmp = true) => spark(weekly(f, 'A', w0, CW, fn), cmp ? weekly(f, scC, w0, CW, fn) : null);
  switch (id) {
    case 'C1': { const g = A.ns / L.ns - 1, gp = T.ns / L.ns - 1, d = (g - gp) * 100, fy = vr(D.FA.ns, D.FT.ns);
      return { label: 'Organic growth & FY outlook', value: sPct(g), sev: sevOf(Math.min(d, fy * 100), 'pts'), delta: dv(d, 'pts', 1, 'vs plan ' + sPct(gp)), sub: `FY outlook ${fmt$(D.FA.ns)} ${sPct(fy)} vs plan`, why: g < gp ? 'Growth is behind plan; the year is at risk unless the gap closes.' : 'Growth is on or ahead of plan.', spark: sp(x => x.ns) }; }
    case 'C2': { const v = vr(D.opA.op, D.opC.op);
      return { label: 'Operating profit', value: fmt$(D.opA.op), sev: sevOf(v, 'pct'), delta: dv(v, 'pct', 1, compShort()), sub: `Margin ${pct1(D.opA.op / D.opA.ns)} · company total`, why: `Contribution margin ${sPct(vr(A.cm, C.cm))}; overhead savings cushion the profit line.` }; }
    case 'C3': { const ch = D.sh.chg * 100, [s0, s1] = shareWin(P); let ahead = 0, n = 0; for (const c of countriesOf(f)) { if (!has({ ...f, c: [c] })) continue; n++; if (K.share({ ...f, c: [c] }, s0, s1).chg >= 0) ahead++; }
      return { label: 'Share: growth vs market', value: pct1(D.sh.now), sev: sevOf(ch, 'pts'), delta: dv(ch, 'pts', 1, 'vs LY'), sub: `Ahead of market in ${ahead} of ${n} countries · 4 wks to 20 Sep`, why: ahead < n / 2 ? 'Losing ground to the market in most countries.' : 'Holding or gaining share in most countries.' }; }
    case 'C4': { const l = lrpData(f), d = (l.act - l.plan) * 100;
      return { label: '3-year growth vs plan', value: sPct(l.act) + ' a year', sev: sevOf(d, 'pts'), delta: dv(d, 'pts', 1, 'vs plan ' + sPct(l.plan)), sub: `Industry ${sPct(l.ind)} a year · 2024–2026`, why: l.act < l.ind ? 'Growing slower than our categories: the portfolio is losing relevance.' : 'Growing faster than our categories.' }; }
    case 'F1': { const gm = x => (x.ns - x.cogs) / x.ns, d = (gm(A) - gm(C)) * 1e4;
      return { label: 'Gross margin %', value: pct1(gm(A)), sev: sevOf(d, 'bps'), delta: dv(d, 'bps', 1, compShort()), sub: `${sBps((gm(A) - gm(L)) * 1e4)} vs LY`, why: d < -10 ? 'Costs per case are rising faster than prices.' : 'Margin holding.', spark: sp(gm) }; }
    case 'F2': { const v = vr(A.cm, C.cm);
      return { label: 'Contribution margin', value: fmt$(A.cm), sev: sevOf(v, 'pct'), delta: dv(v, 'pct', 1, compShort()), sub: `${pct1(A.cm / A.ns)} of net sales`, why: v < -.005 ? 'Margin below plan: product cost and discounts are the main drags.' : 'On plan.', spark: sp(x => x.cm) }; }
    case 'F3': { const tr = x => x.tr / x.gs, d = (tr(A) - tr(C)) * 1e4, ev = promosIn(f).filter(p => p.roi != null), roi = ev.length ? ev.reduce((x, p) => x + p.incGM, 0) / ev.reduce((x, p) => x + p.spend, 0) : NaN;
      return { label: 'Trade spend & promo ROI', value: pct1(tr(A)), sev: d > 60 || roi < 1 ? 'crit' : d > 10 || roi < 1.2 ? 'warn' : 'good', delta: dv(d, 'bps', -1, compShort()) , sub: `Promotion ROI ${isFinite(roi) ? roi.toFixed(2) + 'x vs 1.20x plan' : '—'}`, why: roi < 1 ? 'Promotions are costing more margin than they return.' : 'Promotions returning above break-even.', spark: sp(tr) }; }
    case 'F4': { const pz = pricing(f, P), d = (pz.real - pz.plan) * 100;
      return { label: 'Pricing & inflation recovery', value: sPct(pz.real), sev: sevOf(Math.min(d, (pz.recovery - 1) * 10), 'pts'), delta: dv(d, 'pts', 1, 'vs plan ' + sPct(pz.plan)), sub: `Inflation recovery ${isFinite(pz.recovery) ? (pz.recovery * 100).toFixed(0) + '%' : '—'} of cost increase`, why: pz.recovery < .95 ? 'Price increases are not covering cost inflation.' : 'Prices cover cost inflation.' }; }
    case 'F5': { const e = D.fyA.eps, g = K.FIN.guidance.eps, cs = K.FIN.consensus.eps;
      return { label: 'FY outlook vs guidance', value: 'EPS $' + e.toFixed(2), sev: e < g[0] ? 'crit' : e < cs ? 'warn' : 'good', delta: dv(e - cs, 'eps', 1, 'vs consensus'), sub: e < g[0] ? `$${(g[0] - e).toFixed(2)} below guidance $${g[0].toFixed(2)}–${g[1].toFixed(2)}` : 'Within guidance', why: e < g[0] ? 'On course to miss guidance: expect a market reaction.' : 'In line with guidance.' }; }
    case 'M1': { const ch = D.sh.chg * 100; let lose = 0, n = 0; for (const b of brandsOf(f)) { if (!has({ ...f, b: [b] })) continue; n++; if (K.share({ ...f, b: [b] }, K.MKT_LAST - 3, K.MKT_LAST).chg < 0) lose++; }
      return { label: 'Brand growth vs market', value: pct1(D.sh.now), sev: sevOf(ch, 'pts'), delta: dv(ch, 'pts', 1, 'share vs LY'), sub: `${lose} of ${n} brands losing share · 4 wks to 20 Sep`, why: lose ? 'Competitors are gaining in some brands.' : 'Every brand holding share.' }; }
    case 'M2': { const r = A.inc / A.ap, rp = T.inc / T.ap;
      return { label: 'Marketing ROI', value: r.toFixed(2) + 'x', sev: r >= rp ? 'good' : r >= rp * .9 ? 'warn' : 'crit', delta: dv(r - rp, 'x', 1, 'vs plan ' + rp.toFixed(2) + 'x'), sub: 'Marketing mix model · as of Q2 refresh', why: 'Skincare e-commerce returns most; UK coffee TV least.' }; }
    case 'M3': { const v = vr(A.ap, C.ap);
      return { label: 'A&P spend vs budget', value: fmt$(A.ap), sev: Math.abs(v) <= .03 ? 'good' : Math.abs(v) <= .08 ? 'warn' : 'crit', delta: dv(v, 'pct', -1, compShort()), sub: `${pct1(A.ap / A.ns)} of net sales`, why: v > .03 ? 'Overspending, mostly on Glow Skincare in India (deliberate push).' : 'Spending to budget.', spark: sp(x => x.ap) }; }
    case 'M4': { const live = K.CAMPAIGNS.filter(c => (!f.c || f.c.includes(c.c)) && (!f.b || f.b.includes(c.b)) && c.w1 >= CW - 3 && c.w0 <= CW), ok = live.filter(c => c.lift >= c.planLift).length;
      return { label: 'Live campaigns', value: `${ok} of ${live.length}`, sev: live.length && ok < live.length ? 'warn' : 'good', delta: '<span class="dv neu">at or above planned lift</span>', sub: live.filter(c => c.lift < c.planLift).map(c => K.BMAP[c.b].name.split(' ')[0] + ' ' + c.c + ' below plan').join(' · ') || 'All on plan', why: live.some(c => c.lift < c.planLift) ? 'One campaign is underdelivering and needs a decision.' : 'Campaigns performing.' }; }
    case 'S1': { const hs = headsData(f), ok = hs.filter(h => h.pv >= 1).length, a = hs.reduce((x, h) => x + h.a, 0), t = hs.reduce((x, h) => x + h.t, 0);
      return { label: 'Sales heads on track for October', value: `${ok} of ${hs.length}`, sev: ok === hs.length ? 'good' : ok >= hs.length * .7 ? 'warn' : 'crit', delta: dv(a / t - 1, 'pct', 1, 'MTD vs target'), sub: `Month-to-date ${fmt$(a)} · ${monthWk().filter(w => w <= CW).length} of ${monthWk().length} weeks`, why: ok < hs.length ? `${hs.length - ok} heads are projected to miss the month at current pace.` : 'All heads projected to make the month.' }; }
    case 'S2': { const hs = K.SALES_HEADS.filter(h => !f.c || f.c.includes(h.c)), R = hs.map(h => K.REACH[h.id]), out = R.reduce((x, r) => x + r.outlets, 0), tg = R.reduce((x, r) => x + r.target, 0), wd = R.reduce((x, r) => x + r.wd * r.outlets, 0) / out, wdL = R.reduce((x, r) => x + r.wdLY * r.outlets, 0) / out;
      return { label: 'Penetration & distribution', value: pct1(wd), sev: out / tg >= .99 ? 'good' : out / tg >= .96 ? 'warn' : 'crit', delta: dv((wd - wdL) * 100, 'pts', 1, 'distribution vs LY'), sub: `${(out / 1000).toFixed(0)}K outlets vs ${(tg / 1000).toFixed(0)}K target`, why: out < tg ? 'Outlet reach is behind plan in North India and Jakarta.' : 'Reach on plan.' }; }
    case 'S3': { const ac = accountsData(f, P), behind = ac.filter(a => a.att < .98).length;
      return { label: 'Key accounts', value: `${behind} of ${ac.length}`, sev: behind === 0 ? 'good' : behind <= 3 ? 'warn' : 'crit', delta: '<span class="dv neu">behind target</span>', sub: ac.length ? 'Largest gap: ' + ac.slice().sort((a, b) => a.gap - b.gap)[0].name + ' ' + s$(ac.slice().sort((a, b) => a.gap - b.gap)[0].gap) : '', why: behind ? 'Gaps concentrate in UK convenience and Indonesia modern trade.' : 'All accounts on plan.' }; }
    case 'S4': { const cs = channelStock(f), w = cs[0];
      return { label: 'Channel stock health', value: w ? w.cover.toFixed(1) + ' wks' : '—', sev: w && w.cover > w.normal * 1.3 ? 'crit' : w && w.cover > w.normal * 1.15 ? 'warn' : 'good', delta: w ? `<span class="dv ${w.cover > w.normal * 1.15 ? 'unf' : 'neu'}">vs ${w.normal} normal</span>` : '', sub: w ? 'Highest: ' + w.label : '', why: w && w.cover > w.normal * 1.3 ? 'Distributors are holding far more stock than shoppers are buying.' : 'Channel stock normal.' }; }
    case 'O1': { const r = stockRisk(f), wh = warehouseData(f), avg = wh.reduce((x, w) => x + w.days, 0) / (wh.length || 1);
      return { label: 'Stock health', value: `${r.length} at risk`, sev: r.length > 4 ? 'crit' : r.length ? 'warn' : 'good', delta: `<span class="dv neu">SKU-locations below replenishment time</span>`, sub: `Warehouse cover ${avg.toFixed(0)} days vs ${K.INV_TARGET_DAYS} target`, why: r.length ? 'Orchard Juice in Indonesia is close to running out; Glow Skincare India is thin ahead of Diwali.' : 'No stock-out risk.' }; }
    case 'O2': { const ac = accountsData(f, { ...P, w0: CW - 3, w1: CW, wa: CW }), v = ac.reduce((x, a) => x + a.otif * a.a, 0) / (ac.reduce((x, a) => x + a.a, 0) || 1), br = ac.filter(a => a.otif < a.otifT);
      return { label: 'Customer service (OTIF)', value: pct1(v), sev: v >= .95 ? 'good' : v >= .93 ? 'warn' : 'crit', delta: dv((v - .95) * 100, 'pts', 1, 'vs 95% target'), sub: `${br.length} of ${ac.length} accounts below contract · fines est. ${fmt$(br.reduce((x, a) => x + a.fines, 0))}`, why: br.length ? 'Indonesia supply delays are breaching two retailer contracts.' : 'All accounts within contract.' }; }
    case 'O3': { const u = x => x.cogs / x.vol, v = vr(u(A), u(C)), cts = vr(A.dist / A.vol, C.dist / C.vol);
      return { label: 'Unit costs', value: '$' + u(A).toFixed(2) + '/case', sev: sevOf(-v, 'pct'), delta: dv(v, 'pct', -1, compShort()), sub: `Cost to serve ${sPct(cts)} ${compShort()}`, why: v > .01 ? 'Material costs (oats) are the main driver.' : 'Costs on budget.', spark: sp(u) }; }
    case 'O4': { let wsum = 0, inf = 0; for (const b of brandsOf(f)) { const B = K.BMAP[b], cm = K.COMMODITIES.find(x => x.name === B.mat); const c = agg({ ...f, b: [b] }, 'A', P.w0, P.w1).cogs * B.matShare; wsum += c; inf += c * (cm ? cm.vsBudget : 0); } const v = wsum ? inf / wsum : 0, sv = K.PROCUREMENT;
      return { label: 'Input costs & savings', value: sPct(v), sev: v <= .02 ? 'good' : v <= .06 ? 'warn' : 'crit', delta: '<span class="dv neu">material prices vs budget</span>', sub: `Savings ${fmt$(sv.savingsYTD)} vs ${fmt$(sv.savingsPlanYTD)} plan YTD`, why: 'Oats (+18%) with only 40% hedged; savings behind plan.' }; }
    case 'O5': { const q = K.QUALITY;
      return { label: 'Quality & compliance', value: q.cpmu.toFixed(1), sev: q.recalls || q.openCases ? 'crit' : q.cpmu > q.cpmuTarget ? 'warn' : 'good', delta: dv(q.cpmu - q.cpmuTarget, 'x', -1, 'complaints per million vs target').replace(/x/g, ''), sub: `${q.recalls} recalls · ${q.openCases} open regulatory or legal cases`, why: 'No open issues; complaint rate below target.' }; }
  }
}
const DEF2 = {
  C1: ['Organic growth & FY outlook', 'Growth of the existing business vs last year, against plan, and where the full year will land.', 'Net sales ÷ net sales LY − 1; outlook = YTD actual + forecast'],
  C2: ['Operating profit', 'Profit after all operating costs, company total.', 'Contribution margin − overheads'],
  C3: ['Share: growth vs market', 'Our share of category sales value and whether we are outgrowing our categories, by country.', 'Our shopper purchases ÷ category value'],
  C4: ['3-year growth vs plan', 'Average yearly growth 2024–2026 (actual + outlook) against the long-range plan and our categories.', '(2026 outlook ÷ 2024 actual)^(1/2) − 1'],
  F1: ['Gross margin %', 'Profit after the cost of making the product, as a share of net sales.', '(Net sales − cost of goods) ÷ net sales'],
  F2: ['Contribution margin', 'Profit before shared overheads; the profit number that follows filters.', 'Gross margin − A&P − delivery costs'],
  F3: ['Trade spend & promotion ROI', 'Money given to retailers as a share of list-price sales, and the return on promotions.', 'Trade spend ÷ gross sales; extra margin ÷ promotion cost'],
  F4: ['Pricing & inflation recovery', 'Whether planned price increases landed and whether they cover cost inflation.', 'Price change vs LY; extra net price $ ÷ extra cost $'],
  F5: ['FY outlook vs guidance', 'Expected full-year EPS against our public guidance and analyst consensus.', '(Operating profit − interest) × (1 − tax) ÷ shares'],
  M1: ['Brand growth vs market', 'Our value share and how many brands are losing share to competitors.', 'Our shopper purchases ÷ category value'],
  M2: ['Marketing ROI', 'Extra gross margin generated per $1 of marketing (marketing mix model, quarterly).', 'Extra margin ÷ A&P'],
  M3: ['A&P spend vs budget', 'Consumer marketing spend against budget.', 'A&P actual ÷ budget − 1'],
  M4: ['Live campaigns', 'Campaigns running in the last 4 weeks and whether their sales lift matches plan.', '(Sales in window − baseline) ÷ baseline'],
  S1: ['Sales heads on track', 'Regional sales heads projected to make this month\'s target at their current pace.', 'MTD actual ÷ weeks elapsed × weeks in month vs monthly target'],
  S2: ['Penetration & distribution', 'Weighted distribution and outlets reached vs plan.', 'Category sales of stores stocking us ÷ total category sales'],
  S3: ['Key accounts', 'Large retail customers behind their target.', 'Account actual ÷ account target'],
  S4: ['Channel stock health', 'Weeks of stock held by distributors and stores vs normal.', 'Channel stock ÷ weekly shopper purchases'],
  O1: ['Stock health', 'Items close to running out, and warehouse cover vs target.', 'SKU-locations with cover below replenishment time'],
  O2: ['Customer service (OTIF)', 'Orders delivered on time and in full, and retailers below their contract threshold.', 'Orders on time and in full ÷ all orders'],
  O3: ['Unit costs', 'Cost of goods and cost to serve per standard case vs budget.', 'Cost ÷ cases'],
  O4: ['Input costs & savings', 'Material prices vs budget (weighted by spend) and procurement savings.', 'Current price ÷ budget price − 1'],
  O5: ['Quality & compliance', 'Complaints per million units, recalls and open regulatory or legal cases.', 'Complaints ÷ units × 1,000,000'],
};
Object.assign(DEF, DEF2);

/* ================= focus-band clusters (T2, with deeper levels swapping in place) ================= */
function goDeeper(fn) { drill.pushNext = true; fn(); }
function band(id) {
  if (!drill.pushNext) drill.root = id;
  const f = filter(), P = win(), D = stripData(), L = (crumb, title, insight, blocks, after, focus) => openLevel({ crumb, title, insight, blocks, after, focus, root: id }, true);
  const deeperLink = (txt, key) => `<button class="link go" data-go="${key}">${esc(txt)} ›</button>`;
  switch (id) {
    case 'C1': {
      const saved = state.comp; state.comp = 'L'; const brL = bridge(f, P, 'ns'); state.comp = saved;
      const Ltot = D.L.ns, rows = []; for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const ff = sub(f, { b: [b], c: [c] }); if (!has(ff)) continue; rows.push({ label: K.BMAP[b].name + ' · ' + K.CMAP[c].name, v: (agg(ff, 'A', P.w0, P.w1).ns - agg(ff, 'L', P.w0, P.w1).ns) / Ltot * 100, slice: ff }); }
      rows.sort((a, b) => b.v - a.v); const shown = rows.slice(0, 4).concat(rows.slice(-3));
      const cum = agg(f, 'A', 1, CW).ns, need = (D.FT.ns - cum) / (NW - CW), cur = agg(f, 'A', CW - 3, CW).ns / 4;
      return L('Organic growth', 'Organic growth & FY outlook', `Growing ${sPct(D.A.ns / D.L.ns - 1)} vs plan ${sPct(D.T.ns / D.L.ns - 1)}; FY landing ${fmt$(D.FA.ns)} ${sPct(vr(D.FA.ns, D.FT.ns))} vs plan. To hit plan we need ${fmt$(need)} a week vs ${fmt$(cur)} now ${sPct(need / cur - 1)}.`,
        [{ h: 'Growth split: last year → actual', id: 'b-wf', foot: READ_BRIDGE }, { h: 'Who adds and who subtracts (pts of growth)', html: divBars(shown, v => sPts(v).replace(' pts', ''), { click: true }), foot: 'Click a bar to see that brand and market.' }, { h: 'Run rate needed for the rest of the year', html: bullet(cur, need, fmt$) + deeperLink('Catch-up map: who can deliver more', 'catchup') }],
        () => { waterfall($('#b-wf'), brL, { startLabel: 'Last year', pctBase: D.L.ns, onClick: it => openContrib(f, P, it.k, it.full, 'ns') }); bindBars(shown); });
    }
    case 'C2': return openTile('Sh3');
    case 'C3': return openTile('Sh6');
    case 'C4': {
      const l = lrpData(f);
      const tb = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Category</th><th class="r">Our growth a year</th><th class="r">Plan</th><th class="r">Industry</th><th class="r">Status</th></tr></thead><tbody>${l.rows.map(r => `<tr><td>${r.cat}</td><td class="r num"><b>${sPct(r.act)}</b></td><td class="r num">${sPct(r.plan)}</td><td class="r num">${sPct(r.ind)}</td><td class="r">${sevPill(sevOf((r.act - Math.max(r.plan, r.ind)) * 100, 'pts'))}</td></tr>`).join('')}</tbody></table></div>`;
      const mix = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Portfolio mix</th><th class="r">2024</th><th class="r">2026 outlook</th><th class="r">2027 plan</th></tr></thead><tbody>${l.rows.map(r => `<tr><td>${r.cat}</td><td class="r num">${pct1(r.n24 / l.t24)}</td><td class="r num">${pct1(r.n26 / l.t26)}</td><td class="r num">${pct1(r.p27 / l.tp)}</td></tr>`).join('')}</tbody></table></div>`;
      return L('3-year plan', '3-year growth vs plan and industry', `Growing ${sPct(l.act)} a year vs plan ${sPct(l.plan)} and our categories ${sPct(l.ind)}. Personal Care carries the plan; Food and Beverages trail their markets.`,
        [{ h: 'Net sales trajectory 2024–2027', html: lrpChart(l) }, { h: 'By category', html: tb }, { h: 'Is the portfolio shifting toward growth?', html: mix }]);
    }
    case 'F1': return openCFO('F1');
    case 'F2': { const br = bridge(f, P, 'cm');
      return L('Contribution margin', 'Contribution margin vs plan', `Contribution margin ${fmt$(D.A.cm)} ${sPct(vr(D.A.cm, D.C.cm))} ${compShort()}. ${Math.abs(D.A.ns - D.C.ns) > Math.abs(D.C.ns) * .01 && Math.abs((D.A.cm - D.C.cm) / (D.A.ns - D.C.ns)) < 2 ? `${pct1((D.A.cm - D.C.cm) / (D.A.ns - D.C.ns))} of the sales change reached margin.` : ''}`,
        [{ h: 'Contribution margin bridge: ' + compName() + ' → actual', id: 'b-wf', foot: READ_BRIDGE }, { h: 'By brand (worst first)', html: breakdownTable(rowsBy(f, P, 'b'), 'Brand') }, { h: 'By country', html: breakdownTable(rowsBy(f, P, 'c'), 'Country') }],
        () => waterfall($('#b-wf'), br, { pctBase: D.A.ns, onClick: it => openContrib(f, P, it.k, it.full) }));
    }
    case 'F3': return openCFO('F2');
    case 'F4': return openCFO('F3');
    case 'F5': return openCFO('F6');
    case 'M1': {
      const rows = brandsOf(f).filter(b => has({ ...f, b: [b] })).map(b => { const sh = K.share({ ...f, b: [b] }, K.MKT_LAST - 3, K.MKT_LAST); return { label: K.BMAP[b].name, a: sh.mktGrowth, b: sh.ourGrowth, chg: sh.chg * 100, note: sPts(sh.chg * 100).replace(' pts', '') }; }).sort((x, y) => x.chg - y.chg);
      const comp = []; for (const c of countriesOf(f)) for (const b of brandsOf(f)) { if (!has({ b: [b], c: [c] })) continue; const m = K.MKT[c + '|' + K.BMAP[b].sub]; const g1 = (m.comp1A[K.MKT_LAST] - m.shareLY[1]) * 100; comp.push({ who: m.competitors[0], where: K.BMAP[b].sub + ' · ' + K.CMAP[c].name, g: g1, sig: K.SIGNALS.find(s => s.b === b && s.c === c && s.type === 'Competitor') }); }
      comp.sort((a, b) => b.g - a.g);
      const ct = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Competitor</th><th>Where</th><th class="r">Share change</th><th>Likely move</th></tr></thead><tbody>${comp.filter(x => x.g > .05).slice(0, 5).map(x => `<tr><td><b>${esc(x.who)}</b></td><td>${esc(x.where)}</td><td class="r num">${dv(x.g, 'pts', -1)}</td><td>${x.sig ? esc(x.sig.text) : '—'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No competitor gaining more than 0.05 pts.</td></tr>'}</tbody></table></div>`;
      return L('Brand share', 'Brand growth vs market', `${rows.filter(r => r.chg < 0).length} of ${rows.length} brands are losing share. Biggest loss: ${rows[0].label} ${sPts(rows[0].chg)}.`,
        [{ h: 'Our growth vs market, by brand (latest 4 weeks)', html: dumbbell(rows, { W: DW() }) + DUMB_LEG }, { h: 'Competitors gaining share', html: ct }, { h: '', html: deeperLink('Share by brand × country, with rank', 'share') }]);
    }
    case 'M2': {
      const rows = brandsOf(f).filter(b => has({ ...f, b: [b] })).map(b => { const a = agg({ ...f, b: [b] }, 'A', P.w0, P.w1), t = agg({ ...f, b: [b] }, 'T', P.w0, P.w1); return { label: K.BMAP[b].name, r: a.inc / a.ap, p: t.inc / t.ap, ap: a.ap }; }).sort((x, y) => y.r - x.r);
      const A = D.A, base = A.inc / A.ap, sh = { TV: A.apTv, Digital: A.apDig, Other: A.apOth };
      const media = Object.entries(K.MEDIA_ROMI).map(([m, k]) => ({ m, r: base * k / ((A.apTv * K.MEDIA_ROMI.TV + A.apDig * K.MEDIA_ROMI.Digital + A.apOth * K.MEDIA_ROMI.Other) / A.ap), spend: sh[m] }));
      const tb = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Brand</th><th class="r">ROMI</th><th class="r">Plan</th><th class="r">A&amp;P</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td><td class="r num"><b>${r.r.toFixed(2)}x</b></td><td class="r num">${r.p.toFixed(2)}x</td><td class="r num">${fmt$(r.ap)}</td></tr>`).join('')}</tbody></table></div>`;
      const mt = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Media</th><th class="r">Spend</th><th class="r">ROMI</th></tr></thead><tbody>${media.map(x => `<tr><td>${x.m}</td><td class="r num">${fmt$(x.spend)}</td><td class="r num"><b>${x.r.toFixed(2)}x</b></td></tr>`).join('')}</tbody></table></div>`;
      return L('Marketing ROI', 'Marketing ROI', `Every $1 of marketing returns ${base.toFixed(2)}x in extra margin. ${rows[0].label} returns most (${rows[0].r.toFixed(2)}x); ${rows[rows.length - 1].label} least (${rows[rows.length - 1].r.toFixed(2)}x). Digital outperforms TV.`,
        [{ h: 'By brand', html: tb }, { h: 'By media', html: mt, foot: 'From the marketing mix model, refreshed quarterly (as of Q2).' }, { h: '', html: deeperLink('Campaign results', 'M4') }]);
    }
    case 'M3': {
      const ca = new Float64Array(NW + 1), cb = new Float64Array(NW + 1); let a = 0, t = 0; for (let w = 1; w <= NW; w++) { a += agg(f, 'A', w, w).ap; t += agg(f, 'T', w, w).ap; ca[w] = a; cb[w] = t; }
      const rows = brandsOf(f).filter(b => has({ ...f, b: [b] })).map(b => { const ff = { ...f, b: [b] }; return { label: K.BMAP[b].name, a: agg(ff, 'A', P.w0, P.w1), c: compAgg(ff, P) }; }).sort((x, y) => vr(y.a.ap, y.c.ap) - vr(x.a.ap, x.c.ap));
      const tb = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Brand</th><th class="r">Spend</th><th class="r">${compShort()}</th><th class="r">Working media</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td><td class="r num">${fmt$(r.a.ap)}</td><td class="r num">${dv(vr(r.a.ap, r.c.ap), 'pct', -1)}</td><td class="r num">${pct1((r.a.apTv + r.a.apDig) / r.a.ap)}</td></tr>`).join('')}</tbody></table></div>`;
      return L('A&P spend', 'A&P spend vs budget', `Spend ${fmt$(D.A.ap)} ${sPct(vr(D.A.ap, D.C.ap))} ${compShort()}. ${rows[0].label} is furthest over budget.`,
        [{ h: 'Cumulative spend vs budget', id: 'b-cum' }, { h: 'By brand', html: tb, foot: 'Working media = spend that buys media seen by consumers (TV and digital).' }],
        () => lineChart($('#b-cum'), { x0: 1, x1: NW, h: 170, zero: true, today: CW + .5, yfmt: fmt$, series: [{ vals: cb, from: 1, to: NW, color: '#7b828b', w: 1.5, dash: '5 3', label: 'Budget' }, { vals: ca, from: 1, to: CW, color: 'var(--s1)', end: true, label: 'Actual' }], tip: w => `<div class="th">Wk ${w}</div>${trow('Actual', fmt$(ca[w]))}${trow('Budget', fmt$(cb[w]))}` }));
    }
    case 'M4': {
      const cs = K.CAMPAIGNS.filter(c => (!f.c || f.c.includes(c.c)) && (!f.b || f.b.includes(c.b)));
      const tb = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Campaign</th><th>Where</th><th class="r">Spend</th><th class="r">Lift vs plan</th><th class="r">Status</th></tr></thead><tbody>${cs.map(c => `<tr class="click" tabindex="0" data-camp="${c.id}"><td><b>${esc(c.name)}</b><br><span class="muted">Wk ${c.w0}–${c.w1}${c.w1 >= CW ? ' · live' : ''}</span></td><td>${esc(K.BMAP[c.b].name)} · ${esc(K.CMAP[c.c].name)}</td><td class="r num">${fmt$(c.spend)}</td><td class="r num">${sPct(c.lift, 0)} <span class="muted">vs ${sPct(c.planLift, 0)}</span></td><td class="r">${sevPill(c.lift >= c.planLift ? 'good' : 'crit')}</td></tr>`).join('')}</tbody></table></div>`;
      return L('Campaigns', 'Campaign performance', cs.some(c => c.lift < c.planLift) ? `${cs.filter(c => c.lift < c.planLift).map(c => c.name).join(', ')} is below its planned lift; the competitor price cut is likely blunting it.` : 'All campaigns at or above planned lift.',
        [{ h: 'Campaigns (click for the sales trend in the campaign window)', html: tb }], () => $('#band-body').querySelectorAll('[data-camp]').forEach(r => { const go = () => openCampaign(r.dataset.camp); r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter') go(); }; }));
    }
    case 'S1': {
      const hs = headsData(f).sort((a, b) => a.pv - b.pv);
      const tb = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Sales head · region</th><th class="r">Month to date</th><th class="r">vs MTD target</th><th class="r">Projected month</th><th class="r">vs month target</th><th class="r">Status</th></tr></thead><tbody>${hs.map(h => `<tr class="click" tabindex="0" data-slice='${JSON.stringify(h.slice)}'><td><b>${esc(h.name)}</b><br><span class="muted">${esc(h.region)} · ${K.CMAP[h.c].name}</span></td><td class="r num">${fmt$(h.a)}</td><td class="r num">${dv(h.att - 1, 'pct', 1)}</td><td class="r num">${fmt$(h.proj)}</td><td class="r num">${dv(h.pv - 1, 'pct', 1)}</td><td class="r">${sevPill(headSev(h))}</td></tr>`).join('')}</tbody></table></div>`;
      const PM = { ...P, w0: monthWk()[0], w1: CW, wa: CW }, br = bridge(f, PM, 'ns');
      return L('Sales heads', 'October: will each sales head make the month?', `${hs.filter(h => h.pv < 1).length} of ${hs.length} heads are projected to miss October at current pace; the biggest gap is ${hs[0].name} (${hs[0].region}) ${sPct(hs[0].pv - 1)}.`,
        [{ h: 'By sales head (worst first) · click to see the market', html: tb, foot: 'Projection = month-to-date sales ÷ weeks elapsed × weeks in the month.' }, { h: 'Why: month-to-date gap vs target', id: 'b-wf', foot: READ_BRIDGE }],
        () => waterfall($('#b-wf'), br, { startLabel: 'MTD target', pctBase: agg(f, 'A', monthWk()[0], CW).ns, onClick: it => openContrib(f, PM, it.k, it.full, 'ns') }));
    }
    case 'S2': {
      const hs = K.SALES_HEADS.filter(h => !f.c || f.c.includes(h.c)).map(h => ({ ...h, ...K.REACH[h.id] })).sort((a, b) => a.outlets / a.target - b.outlets / b.target);
      const tb = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Region · head</th><th class="r">Weighted distribution</th><th class="r">vs LY</th><th class="r">Outlets</th><th class="r">vs target</th></tr></thead><tbody>${hs.map(h => `<tr><td><b>${esc(h.region)}</b><br><span class="muted">${esc(h.name)} · ${K.CMAP[h.c].name}</span></td><td class="r num">${pct1(h.wd)}</td><td class="r num">${dv((h.wd - h.wdLY) * 100, 'pts', 1)}</td><td class="r num">${(h.outlets / 1000).toFixed(1)}K</td><td class="r num">${dv(h.outlets / h.target - 1, 'pct', 1)}</td></tr>`).join('')}</tbody></table></div>`;
      const ls = K.LISTINGS.filter(x => !f.c || f.c.includes(x.c)), lt = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Product</th><th>Retailer</th><th>Change</th><th class="r">Week</th></tr></thead><tbody>${ls.map(x => `<tr><td>${esc(x.sku)}</td><td>${esc(K.RETAILERS.find(r => r.id === x.ka).name)}</td><td>${x.type.startsWith('Listed') ? sevPill('good').replace('On track', 'Listed') : sevPill('crit').replace('Off track', esc(x.type))}</td><td class="r num">Wk ${x.w}</td></tr>`).join('')}</tbody></table></div>`;
      return L('Distribution', 'Penetration & distribution', `${hs[0].region} is furthest behind on outlet reach ${sPct(hs[0].outlets / hs[0].target - 1)}; distribution there fell ${sPts((hs[0].wd - hs[0].wdLY) * 100)} vs LY.`,
        [{ h: 'By region (furthest behind first)', html: tb }, { h: 'Listings gained and lost', html: lt }]);
    }
    case 'S3': {
      const ac = accountsData(f, P).sort((a, b) => a.gap - b.gap);
      const bars = divBars(ac.map(a => ({ label: a.name + ' · ' + a.c, v: a.gap, slice: a.slice })), v => s$(v), { click: true });
      const tb = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Account</th><th class="r">Sales</th><th class="r">${compShort()}</th><th class="r">Promo compliance</th><th class="r">OTIF</th></tr></thead><tbody>${ac.map(a => `<tr class="click" tabindex="0" data-slice='${JSON.stringify(a.slice)}'><td><b>${esc(a.name)}</b><br><span class="muted">${K.CMAP[a.c].name} · ${K.CHMAP[a.ch].name}</span></td><td class="r num">${fmt$(a.a)}</td><td class="r num">${dv(a.att - 1, 'pct', 1)}</td><td class="r num">${a.compliance != null ? pct1(a.compliance) : '—'}</td><td class="r num ${a.otif < a.otifT ? 'unf' : ''}">${pct1(a.otif)}</td></tr>`).join('')}</tbody></table></div><p class="foot">Account figures use each account's share of its channel (synthetic).</p>`;
      return L('Key accounts', 'Key account performance', ac.length ? `${ac[0].name} has the largest gap ${s$(ac[0].gap)} ${compShort()}.` : 'No key accounts in scope.',
        [{ h: 'Gap to target by account', html: bars }, { h: 'Account scorecard', html: tb }], () => bindBars(ac.map(a => ({ slice: a.slice }))));
    }
    case 'S4': {
      const cs = channelStock(f), w = cs[0];
      const tb = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Country · channel</th><th class="r">Weeks of cover</th><th class="r">Normal</th><th class="r">Shipments vs purchases (4 wks)</th></tr></thead><tbody>${cs.map(r => `<tr class="click" tabindex="0" data-slice='${JSON.stringify(r.slice)}'><td>${esc(r.label)}</td><td class="r num"><b>${r.cover.toFixed(1)}</b></td><td class="r num">${r.normal}</td><td class="r num">${dv(r.gap, 'pct', -1)}</td></tr>`).join('')}</tbody></table></div>`;
      const sv = new Float64Array(NW + 1), cv = new Float64Array(NW + 1); for (let i = 20; i <= CW; i++) { const x = agg(w.slice, 'A', i, i); sv[i] = x.vol; cv[i] = x.cons; }
      return L('Channel stock', 'Channel stock health', w ? `${w.label} holds ${w.cover.toFixed(1)} weeks of stock vs ${w.normal} normal: shipments ran ${sPct(w.gap, 0)} ahead of shopper purchases. Near-expiry stock in the channel: ${fmt$(K.NEAR_EXPIRY.channel[w.c] || 0)}.` : '',
        [{ h: 'Shipments vs shopper purchases: ' + (w ? w.label : ''), id: 'b-flow', html: '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>Shipments</span><span><i class="dot" style="background:var(--s3)"></i>Shopper purchases</span></div>' }, { h: 'Cover by country and channel', html: tb }],
        () => lineChart($('#b-flow'), { x0: 20, x1: CW, h: 170, yfmt: v => (v / 1000).toFixed(0) + 'K cs', series: [{ vals: cv, from: 20, to: CW, color: 'var(--s3)', label: 'Purchases' }, { vals: sv, from: 20, to: CW, color: 'var(--s1)', end: true, label: 'Shipments' }], tip: i => `<div class="th">Wk ${i}</div>${trow('Shipments', (sv[i] / 1000).toFixed(1) + 'K cs')}${trow('Purchases', (cv[i] / 1000).toFixed(1) + 'K cs')}` }));
    }
    case 'O1': {
      const wh = warehouseData(f), rk = stockRisk(f), cs = channelStock(f);
      const wt = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Warehouse</th><th class="r">Days of cover (average)</th><th class="r">Target</th><th class="r">Items at risk</th><th class="r">Status</th></tr></thead><tbody>${wh.map(w => { const n = rk.filter(x => x.wh === w.name).length, crit = rk.some(x => x.wh === w.name && x.days < x.lead * .5); return `<tr><td>${esc(w.name)} · ${K.CMAP[w.c].name}</td><td class="r num"><b>${w.days.toFixed(0)}</b></td><td class="r num">${K.INV_TARGET_DAYS}</td><td class="r num">${n || '—'}</td><td class="r">${sevPill(crit || w.days < 12 ? 'crit' : n || w.days < 18 ? 'warn' : 'good')}</td></tr>`; }).join('')}</tbody></table></div>`;
      const rt = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Product</th><th>Location</th><th class="r">Days of cover</th><th class="r">Replenishment time</th></tr></thead><tbody>${rk.map(r => `<tr><td>${esc(r.sku)}</td><td>${esc(r.wh)}</td><td class="r num unf"><b>${r.days.toFixed(0)}</b></td><td class="r num">${r.lead} days</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nothing at risk.</td></tr>'}</tbody></table></div>`;
      const st = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Stores (channel stock, owned by Sales)</th><th class="r">Weeks of cover</th><th class="r">Normal</th></tr></thead><tbody>${cs.slice(0, 5).map(r => `<tr><td>${esc(r.label)}</td><td class="r num">${r.cover.toFixed(1)}</td><td class="r num">${r.normal}</td></tr>`).join('')}</tbody></table></div>`;
      return L('Stock health', 'Stock health: warehouses and stores', `${rk.length} product-locations will run out before they can be replenished; ${rk[0] ? rk[0].sku + ' at ' + rk[0].wh + ' has ' + rk[0].days.toFixed(0) + ' days left vs ' + rk[0].lead + ' needed.' : ''} Upcoming Orchard promotion at FreshMart is only 55% stock-ready.`,
        [{ h: 'Items at risk of stock-out', html: rt }, { h: 'Warehouse cover', html: wt }, { h: 'Store and distributor stock (context)', html: st, foot: `Near-expiry stock: ours ${fmt$(Object.values(K.NEAR_EXPIRY.own).reduce((x, y) => x + y, 0))}, channel ${fmt$(Object.values(K.NEAR_EXPIRY.channel).reduce((x, y) => x + y, 0))}.` }]);
    }
    case 'O2': {
      const P4 = { ...P, w0: CW - 3, w1: CW, wa: CW }, ac = accountsData(f, P4).sort((a, b) => (a.otif - K.RETAILERS.find(r => r.id === a.id).otif) - (b.otif - K.RETAILERS.find(r => r.id === b.id).otif));
      const tb = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Account</th><th class="r">OTIF (4 wks)</th><th class="r">Contract</th><th class="r">Est. fines</th></tr></thead><tbody>${ac.map(a => { const thr = K.RETAILERS.find(r => r.id === a.id).otif; return `<tr><td><b>${esc(a.name)}</b> · ${K.CMAP[a.c].name}</td><td class="r num ${a.otif < thr ? 'unf' : ''}"><b>${pct1(a.otif)}</b></td><td class="r num">${pct1(thr).replace('.0', '')}</td><td class="r num">${a.otif < thr ? fmt$(a.fines) : '—'}</td></tr>`; }).join('')}</tbody></table></div>`;
      const causes = [{ label: 'Supply shortage', v: 48 }, { label: 'Forecast error', v: 22 }, { label: 'Transport delay', v: 18 }, { label: 'Production', v: 12 }];
      const fr = {}; for (const c of countriesOf(f)) { fr[c] = new Float64Array(NW + 1); for (let i = 20; i <= CW; i++) fr[c][i] = agg({ ...f, c: [c] }, 'A', i, i).fill * 100; }
      return L('Customer service', 'Customer service (OTIF)', `${ac.filter(a => a.otif < K.RETAILERS.find(r => r.id === a.id).otif).map(a => a.name).join(' and ') || 'No account'} below contract threshold. Supply shortage drives about half of all failures.`,
        [{ h: 'By account vs contract threshold', html: tb }, { h: 'Why orders failed (share of failed cases, last 4 weeks)', html: divBars(causes.map(c => ({ label: c.label, v: c.v })), v => v + '%') }, { h: 'Fill rate by country', id: 'b-fr', html: '<div class="legend">' + countriesOf(f).map((c, i) => `<span><i class="dot" style="background:${['var(--s1)', 'var(--s2)', 'var(--s3)', '#7b828b'][i]}"></i>${K.CMAP[c].name}</span>`).join('') + '</div>' }],
        () => lineChart($('#b-fr'), { x0: 20, x1: CW, h: 160, yfmt: v => v.toFixed(0) + '%', series: countriesOf(f).map((c, i) => ({ vals: fr[c], from: 20, to: CW, color: ['var(--s1)', 'var(--s2)', 'var(--s3)', '#7b828b'][i], w: 1.8, label: c })), tip: i => `<div class="th">Wk ${i}</div>` + countriesOf(f).map(c => trow(K.CMAP[c].name, fr[c][i].toFixed(1) + '%')).join('') }));
    }
    case 'O3': {
      const A = D.A, C = D.C, pc = (x, k) => x[k] / x.vol;
      const cb = { start: C.cogs / C.vol, end: A.cogs / A.vol, items: [['Materials', pc(A, 'mat') - pc(C, 'mat'), 'mat'], ['Packaging', pc(A, 'pack') - pc(C, 'pack'), 'pack'], ['Conversion', pc(A, 'conv') - pc(C, 'conv'), 'conv'], ['Inbound freight', pc(A, 'inb') - pc(C, 'inb'), 'inb']] };
      const db = { start: C.dist / C.vol, end: A.dist / A.vol, items: [['Warehousing', pc(A, 'wh') - pc(C, 'wh'), 'wh'], ['Freight', pc(A, 'fr') - pc(A, 'rush') - pc(C, 'fr'), 'fr'], ['Rush shipments', pc(A, 'rush'), 'rush'], ['Handling', pc(A, 'hd') - pc(C, 'hd'), 'hd']] };
      const money = { fmt: v => '$' + v.toFixed(2), sfmt: v => (v >= 0 ? '+' : MINUS) + '$' + Math.abs(v).toFixed(2), costUp: true };
      return L('Unit costs', 'Unit costs vs budget', `Cost of goods per case ${sPct(cb.end / cb.start - 1)} ${compShort()}, mostly materials; cost to serve ${sPct(db.end / db.start - 1)}, with rush shipments in Indonesia adding cost.`,
        [{ h: 'Cost of goods per case: ' + compName() + ' → actual', id: 'b-c1' }, { h: 'Cost to serve per case: ' + compName() + ' → actual', id: 'b-c2' }, { h: 'By brand', html: breakdownTable(rowsBy(f, P, 'b'), 'Brand') }],
        () => { waterfall($('#b-c1'), cb, { ...money, startLabel: 'Budget', endLabel: 'Actual' }); waterfall($('#b-c2'), db, { ...money, startLabel: 'Budget', endLabel: 'Actual' }); });
    }
    case 'O4': return openCFO('F4');
    case 'O5': {
      const cp = new Float64Array(NW + 1), tg = new Float64Array(NW + 1); for (let i = 1; i <= CW; i++) { cp[i] = K.COMPLAINTS[i]; tg[i] = K.QUALITY.cpmuTarget; }
      return L('Quality', 'Quality & compliance', 'No recalls and no open regulatory or legal cases. Complaints are running below target.',
        [{ h: 'Complaints per million units', id: 'b-q' }, { h: 'Open cases', html: '<p class="muted">No open recalls, quality holds, or regulatory or legal cases. Recalls, regulatory actions and cases above the $ threshold escalate to the CEO automatically.</p>' }],
        () => lineChart($('#b-q'), { x0: 1, x1: CW, h: 160, yfmt: v => v.toFixed(1), series: [{ vals: tg, from: 1, to: CW, color: '#7b828b', w: 1.5, dash: '5 3', label: 'Plan' }, { vals: cp, from: 1, to: CW, color: 'var(--s1)', end: true }], tip: i => `<div class="th">Wk ${i}</div>${trow('Complaints / million', cp[i].toFixed(2))}` }));
    }
  }
}
const READ_BRIDGE = 'How to read: the first bar is the comparator, each bar adds or takes away, the last bar is actual. Blue helped, red hurt. Click a bar to see who drove it.';
const DUMB_LEG = '<div class="legend"><span><i class="ring"></i>Market growth</span><span><i class="dot" style="background:var(--s1)"></i>Us, gaining share</span><span><i class="dot" style="background:var(--neg)"></i>Us, losing share</span><span>Right: share change, pts</span></div>';
function bindBars(rows) { $('#band-body').querySelectorAll('.dbar.click').forEach(n => { const r = rows[+n.dataset.i]; if (!r || !r.slice) return; const go = () => openSlice(r.slice); n.onclick = go; n.onkeydown = e => { if (e.key === 'Enter') go(); }; }); }
function lrpChart(l) {
  const W = DW(), H = 170, M = { l: 54, r: 70, t: 14, b: 26 }, ys = [l.t24, l.t24 * 1.001 * (l.t26 / l.t24) ** .5, l.t26], plan = [0, 1, 2, 3].map(i => l.t24 * Math.pow(1 + l.plan, i)), ind = [0, 1, 2, 3].map(i => l.t24 * Math.pow(1 + l.ind, i));
  const all = [...ys, ...plan, ...ind], lo = Math.min(...all) * .97, hi = Math.max(...all) * 1.02, X = i => M.l + i / 3 * (W - M.l - M.r), Y = v => M.t + (1 - (v - lo) / (hi - lo)) * (H - M.t - M.b);
  const line = (arr, n, col, dash) => `<path d="${arr.slice(0, n).map((v, i) => (i ? 'L' : 'M') + X(i) + ' ' + Y(v)).join('')}" fill="none" stroke="${col}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
  let g = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="fx" role="img" aria-label="Net sales trajectory vs plan and industry">`;
  ticks(lo, hi, 3).forEach(t => g += `<line x1="${M.l}" x2="${W - M.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)"/><text x="${M.l - 8}" y="${Y(t) + 3.5}" text-anchor="end" class="ax">${fmt$(t)}</text>`);
  K.LRP.years.forEach((y, i) => g += `<text x="${X(i)}" y="${H - 6}" text-anchor="middle" class="ax">${y}${i === 2 ? ' (outlook)' : ''}</text>`);
  g += line(ind, 4, '#b9bfc7', '1 3') + line(plan, 4, '#7b828b', '5 3') + line(ys, 3, 'var(--s1)');
  g += `<text x="${X(3) + 6}" y="${Y(plan[3]) + 3}" class="ax lbl">Plan</text><text x="${X(3) + 6}" y="${Y(ind[3]) + 3}" class="ax lbl">Industry pace</text><circle cx="${X(2)}" cy="${Y(ys[2])}" r="4" fill="var(--s1)"/><text x="${X(2) + 8}" y="${Y(ys[2]) + 3}" class="ax strong">Us</text>`;
  return g + '</svg>';
}
function openCampaign(id) {
  const c = K.CAMPAIGNS.find(x => x.id === id), f = { b: [c.b], c: [c.c] }, Wk = weeklyNs(f);
  openLevel({ crumb: c.name, title: c.name, insight: `${K.BMAP[c.b].name} · ${K.CMAP[c.c].name} · ${c.media} · Wk ${c.w0}–${c.w1}. Sales lift ${sPct(c.lift, 0)} vs planned ${sPct(c.planLift, 0)} on ${fmt$(c.spend)} spend.`,
    blocks: [{ h: 'Weekly net sales around the campaign (shaded)', id: 'b-camp' }],
    after: () => lineChart($('#b-camp'), { x0: Math.max(1, c.w0 - 10), x1: Math.min(NW, c.w1 + 4), h: 170, band: [c.w0, Math.min(c.w1, CW)], today: CW + .5, yfmt: fmt$, series: [{ vals: Wk.l, from: Math.max(1, c.w0 - 10), to: Math.min(NW, c.w1 + 4), color: '#b9bfc7', w: 1.5, dash: '1 3', label: 'LY' }, { vals: Wk.a, from: Math.max(1, c.w0 - 10), to: Math.min(CW, c.w1 + 4), color: 'var(--s1)', end: true }], tip: w => `<div class="th">Wk ${w}</div>${trow('Actual', fmt$(Wk.a[w]))}${trow('Last year', fmt$(Wk.l[w]))}` }) });
}

/* ================= summary ================= */
function summary(ex, D, f, P) {
  const r = state.role, neg = actions().filter(a => a.urgency !== 'Low' && a.status !== 'Done').slice(0, 2), comp = `Company: net sales ${sPct(vr(D.A.ns, D.C.ns))} ${compShort()}, contribution margin ${sPct(vr(D.A.cm, D.C.cm))}, FY EPS $${D.fyA.eps.toFixed(2)} (${D.fyA.eps < K.FIN.guidance.eps[0] ? 'below' : 'within'} guidance).`;
  const tiles = CORE[r].map(id => ({ id, ...coreTile(id, f, P, D) })), bad = tiles.filter(t => t.sev === 'crit' || t.sev === 'warn');
  const st = tiles.some(t => t.sev === 'crit') ? 'crit' : bad.length ? 'warn' : 'good';
  const worst = bad.slice().sort((x, y) => (y.sev === 'crit') - (x.sev === 'crit'))[0];
  const l1 = bad.length ? `${bad.length} of your ${tiles.length} core metrics need attention. Most pressing: ${worst.label} — ${worst.why.charAt(0).toLowerCase() + worst.why.slice(1)}` : `All ${tiles.length} core metrics are on track.`;
  const l2 = bad.length > 1 ? `Also watch: ${bad.filter(t => t !== worst).map(t => t.label).join(' · ')}.` : 'No other issues in your area.';
  const l3 = neg.length ? `Next: ${neg.map(a => a.title.split(/[.;]/)[0].replace(/ and extend.*$/, '') + ' (' + a.poc.split(' · ')[0] + ')').join('; ')}.` : 'No open high-priority actions.';
  return `<div class="sum-h">${sevPill(st)} ${aiTag}<span class="muted">${new Date(Date.UTC(2026, 9, 12)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })} · data to week ending 11 Oct</span></div>
    <p class="sum-1">${esc(l1)}</p><p class="sum-2">${esc(l2)}</p><p class="sum-2">${esc(l3)}</p>${r !== 'CEO' ? `<p class="sum-3">${esc(comp)}</p>` : ''}`;
}

/* ================= actions ================= */
const TODAY = Date.UTC(2026, 9, 12), DAY = 864e5;
const fmtD = t => t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—';
let ACTS = {}; try { ACTS = JSON.parse(localStorage.getItem('ns-actions') || '{}'); } catch (e) { ACTS = {}; }
const saveActs = () => { try { localStorage.setItem('ns-actions', JSON.stringify(ACTS)); } catch (e) { } };
const PURVIEW = { CEO: null, CFO: ['buying', 'cost', 'market', 'guidance'], CMO: ['competitor', 'opportunity', 'market', 'campaign'], CSO: ['loading', 'volume', 'competitor', 'supply', 'heads'], COO: ['supply', 'cost', 'loading', 'stockrisk'] };
const POC_BY = (cls, c, b) => ({ competitor: c === 'UK' ? 'UK_SALES' : c === 'US' ? 'US_SALES' : 'CMO', buying: 'RGM', cost: 'RGM', supply: 'ID_SUPPLY', market: c === 'UK' ? 'UK_GM' : 'CFO', opportunity: b === 'glow' ? 'BRAND_GLOW' : 'CMO', loading: 'IN_SALES', volume: (c || 'UK') + '_SALES' })[cls] || 'CSO';
const TARGET = { supply: 'Fill rate ≥ 95% by 1 Nov', competitor: 'Convenience volume back to (−10%) vs LY by Wk 48', buying: 'Trade spend ≤ 18% of gross sales from Wk 44', cost: 'Inflation recovery ≥ 80% by Wk 48', market: 'Re-based target approved by 23 Oct', opportunity: 'Diwali cover ≥ 20 days by Wk 43', loading: 'Channel cover ≤ 4 weeks by Wk 46', volume: 'Back to target pace within 4 weeks' };
const PRESET = { 'bolt|UK': { status: 'Assigned', assigned: Date.UTC(2026, 9, 5), due: Date.UTC(2026, 9, 30) }, 'oats|India+Indonesia+UK+US': { status: 'Assigned', assigned: Date.UTC(2026, 8, 21), due: Date.UTC(2026, 9, 9) } };
let __acts = [];
function actions() { return __acts; }
function buildActions(ex, f, P) {
  const pv = PURVIEW[state.role], out = [];
  for (const e of ex) {
    if (pv && !pv.includes(e.d.cls)) continue;
    const c = e.f.c && e.f.c.length === 1 ? e.f.c[0] : null, b = e.f.b && e.f.b.length === 1 ? e.f.b[0] : null;
    const pre = PRESET[e.id] || Object.entries(PRESET).find(([k]) => k.split('|')[0] === (b || '') && e.d.cls === 'cost')?.[1] || {};
    const urg = e.d.sev === 'crit' ? 'High' : e.d.sev === 'opp' ? 'Low' : 'Medium';
    out.push({ id: e.id, title: e.d.action, issue: e.title, why: e.d.cause, chain: e.d.chain, poc: K.PEOPLE[POC_BY(e.d.cls, c, b)], urgency: urg, target: TARGET[e.d.cls] || '', value: e.d.value, sev: e.d.sev, f: e.f,
      assigned: pre.assigned || null, due: pre.due || TODAY + (urg === 'High' ? 7 : urg === 'Medium' ? 14 : 21) * DAY, status: pre.status || 'New' });
  }
  if (!pv || pv.includes('heads')) headsData(f).filter(h => h.pv < .97).forEach(h => out.push({ id: 'head|' + h.id, title: `Agree a recovery plan with ${h.name} to close the October gap.`, issue: `${h.name} · ${h.region}`, why: `Projected to finish October ${sPct(h.pv - 1)} vs target at current pace.`, chain: [`MTD ${sPct(h.att - 1)} vs target`, `projection ${fmt$(h.proj)} vs ${fmt$(h.tm)}`], poc: h.name + ' · Regional Sales Head', urgency: h.pv < .94 ? 'High' : 'Medium', target: 'Projection back to 100% by Wk 43', value: h.tm - h.proj, sev: h.pv < .94 ? 'crit' : 'warn', f: h.slice, assigned: null, due: TODAY + 5 * DAY, status: 'New' }));
  if (!pv || pv.includes('stockrisk')) { const rk = stockRisk(f).filter(r => r.c === 'IN'); if (rk.length) out.push({ id: 'risk|glow-in', title: `Secure Diwali stock for ${rk.map(r => r.sku.replace('Glow ', '')).join(', ')} (air-freight or reallocate).`, issue: 'Glow Skincare · India stock', why: `Cover ${rk[0].days.toFixed(0)} days vs ${rk[0].lead} needed, ahead of the Diwali peak.`, chain: [`${rk.length} items below replenishment time`, 'Diwali demand (+25%) in Wk 44'], poc: K.PEOPLE.COO, urgency: 'High', target: 'Cover ≥ 20 days by Wk 43', value: 0, sev: 'crit', f: { b: ['glow'], c: ['IN'] }, assigned: null, due: TODAY + 4 * DAY, status: 'New' }); }
  if (!pv || pv.includes('guidance')) { const e = K.finance({}, 'A', 1, NW).eps; if (e < K.FIN.guidance.eps[0]) out.push({ id: 'guidance', title: 'Prepare a guidance decision for the board: hold with recovery plan, or lower.', issue: 'EPS outlook below guidance', why: `Outlook $${e.toFixed(2)} vs guidance $${K.FIN.guidance.eps[0].toFixed(2)}–${K.FIN.guidance.eps[1].toFixed(2)} and consensus $${K.FIN.consensus.eps.toFixed(2)}.`, chain: ['margin pressure', 'overhead savings not enough'], poc: K.PEOPLE.CFO, urgency: 'High', target: 'Board decision by 30 Oct', value: 0, sev: 'crit', f: {}, assigned: TODAY - 2 * DAY, due: Date.UTC(2026, 9, 30), status: 'In progress' }); }
  if (!pv || pv.includes('campaign')) K.CAMPAIGNS.filter(c => c.w1 >= CW && c.lift < c.planLift && (!f.c || f.c.includes(c.c))).forEach(c => out.push({ id: 'camp|' + c.id, title: `Decide on "${c.name}": shift the remaining TV budget to digital or pause.`, issue: `${K.BMAP[c.b].name} · ${K.CMAP[c.c].name} campaign`, why: `Lift ${sPct(c.lift, 0)} vs planned ${sPct(c.planLift, 0)}; TV returns less than digital.`, chain: [`spend ${fmt$(c.spend)}`, `lift ${sPct(c.lift, 0)} vs ${sPct(c.planLift, 0)}`], poc: K.PEOPLE.BRAND_BOLT, urgency: 'Medium', target: 'Decision by 23 Oct', value: c.spend * .3, sev: 'warn', f: { b: [c.b], c: [c.c] }, assigned: null, due: TODAY + 10 * DAY, status: 'New' }));
  // apply saved changes
  for (const a of out) { const s = ACTS[a.id]; if (s) Object.assign(a, s); if (a.status !== 'Done' && a.due < TODAY) a.overdue = true; }
  const rank = { High: 0, Medium: 1, Low: 2 };
  __acts = out.sort((a, b) => (a.status === 'Done') - (b.status === 'Done') || (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0) || rank[a.urgency] - rank[b.urgency]);
  return __acts;
}
function actionsHtml() {
  const all = actions(), fl = state.actFilter || 'Open';
  const counts = { Open: all.filter(a => a.status !== 'Done').length, New: all.filter(a => a.status === 'New').length, Assigned: all.filter(a => a.status === 'Assigned' || a.status === 'In progress').length, Overdue: all.filter(a => a.overdue).length, Done: all.filter(a => a.status === 'Done').length };
  const list = all.filter(a => fl === 'Open' ? a.status !== 'Done' : fl === 'New' ? a.status === 'New' : fl === 'Assigned' ? (a.status === 'Assigned' || a.status === 'In progress') : fl === 'Overdue' ? a.overdue : a.status === 'Done');
  const chips = Object.entries(counts).map(([k, n]) => `<button class="fchip2 ${fl === k ? 'on' : ''} ${k === 'Overdue' && n ? 'alert' : ''}" data-af="${k}">${k} <b>${n}</b></button>`).join('');
  const urgPill = u => `<span class="pill urg ${u.toLowerCase()}">${u}</span>`;
  return `<div class="act-h"><div class="chips">${chips}</div></div>
    <div class="acts">${list.map(a => `<article class="act ${a.overdue ? 'od' : ''}">
      <div class="act-main"><div class="act-t">${urgPill(a.urgency)} <b>${esc(a.title)}</b></div>
        <div class="act-why">${aiTag} ${esc(a.why)} <span class="muted">· ${esc(a.issue)}</span></div>
        <div class="act-meta"><span>Owner <b>${esc(a.poc)}</b></span><span>Assigned <b>${fmtD(a.assigned)}</b></span><span>Due <b class="${a.overdue ? 'unf' : ''}">${fmtD(a.due)}${a.overdue ? ' · overdue' : ''}</b></span>${a.target ? `<span>Target <b>${esc(a.target)}</b></span>` : ''}${a.value ? `<span title="Estimate: about half of the full-year gap is recoverable with action">Recoverable if fixed <b>~${fmt$(a.value)}</b></span>` : ''}</div></div>
      <div class="act-side"><button class="status" data-act="${esc(a.id)}" data-s="${a.status}" aria-label="Status ${a.status}, click to change">${a.status}</button>
        <div class="qa"><button class="qbtn" data-mail="${esc(a.id)}" title="Draft an email to the owner with the analysis">✉ Email</button><button class="qbtn" data-meet="${esc(a.id)}" title="Prepare a meeting with the owner">📅 Meeting</button><button class="qbtn" data-assign="${esc(a.id)}" title="Assign to someone">Assign</button><button class="qbtn" data-see="${esc(a.id)}" title="Open the analysis behind this action">View analysis</button></div></div>
    </article>`).join('') || `<p class="muted" style="padding:10px 2px">No ${fl.toLowerCase()} actions.</p>`}</div>`;
}
function emailDraft(a, follow) {
  const me = K.PEOPLE[state.role] || K.PEOPLE.CEO, first = a.poc.split(' · ')[0].split(' ')[0];
  const subj = `${follow ? 'Follow-up: ' : ''}${a.issue}: ${a.title.split('.')[0]}`;
  const body = `Hi ${first},\n\n${follow ? 'Following up on this. ' : ''}${a.why}\n\nWhat the numbers show:\n${a.chain.map(x => '• ' + x.replace(/[▲▼]/g, '')).join('\n')}\n\nProposed action: ${a.title}\nTarget: ${a.target || '—'}\nDue: ${fmtD(a.due)}\n\nCould you tell me what is missing to fix this, and what you need from me? Full analysis: Northstar Executive Pulse › ${a.issue}.\n\nThanks,\n${me.split(' · ')[0]}`;
  return { to: a.poc, subj, body };
}
function openModal(title, html, after) { $('#modal-t').textContent = title; $('#modal-b').innerHTML = html; $('#modal').hidden = false; $('#modal .close').focus(); if (after) after(); }
const closeModal = () => { $('#modal').hidden = true; };
function copyBtn(txt) { return `<button class="btn primary" data-copy="${esc(encodeURIComponent(txt))}">Copy</button>`; }
function mailModal(a, follow) {
  const m = emailDraft(a, follow);
  openModal(follow ? 'Follow-up email' : 'Email draft', `<dl class="mf"><dt>To</dt><dd>${esc(m.to)}</dd><dt>Subject</dt><dd>${esc(m.subj)}</dd></dl><textarea id="mail-body" rows="13">${esc(m.body)}</textarea>
    <div class="m-act">${copyBtn('Subject: ' + m.subj + '\n\n' + m.body)}<button class="btn" data-close>Close</button></div><p class="foot">Prepared for you to send from your email. The analysis summary is included; nothing is sent from the dashboard.</p>`,
    () => { $('#mail-body').oninput = e => { const b = $('#modal-b [data-copy]'); b.dataset.copy = encodeURIComponent('Subject: ' + m.subj + '\n\n' + e.target.value); }; });
}
function meetModal(a) {
  const start = new Date(a.due - 2 * DAY + 10 * 3600e3), me = (K.PEOPLE[state.role] || K.PEOPLE.CEO);
  const txt = `Meeting: ${a.issue}: review and next steps\nWhen: ${start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}, 10:00, 30 minutes\nAttendees: ${me}; ${a.poc}\n\nAgenda\n1. What changed: ${a.why}\n2. The numbers: ${a.chain.join('; ').replace(/[▲▼]/g, '')}\n3. Proposed action: ${a.title}\n4. What is missing, owner and date (target: ${a.target || '—'})`;
  openModal('Meeting invite', `<pre class="pre">${esc(txt)}</pre><div class="m-act">${copyBtn(txt)}<button class="btn" data-close>Close</button></div><p class="foot">Prepared for your calendar; nothing is booked from the dashboard.</p>`);
}
function assignModal(a) {
  const ppl = Object.values(K.PEOPLE).concat(K.SALES_HEADS.map(h => h.name + ' · Regional Sales Head')).filter((v, i, s) => s.indexOf(v) === i);
  openModal('Assign action', `<p>${esc(a.title)}</p><label class="lab" for="as-who">Owner</label><select id="as-who">${ppl.map(p => `<option ${p === a.poc ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
    <label class="lab" for="as-due">Due</label><input id="as-due" type="date" value="${new Date(a.due).toISOString().slice(0, 10)}">
    <div class="m-act"><button class="btn primary" id="as-ok">Assign and draft email</button><button class="btn" data-close>Cancel</button></div>`,
    () => { $('#as-ok').onclick = () => { const s = ACTS[a.id] || {}; s.poc = $('#as-who').value; s.due = Date.parse($('#as-due').value) || a.due; s.status = 'Assigned'; s.assigned = TODAY; ACTS[a.id] = s; saveActs(); renderHome(); const na = actions().find(x => x.id === a.id); mailModal(na); }; });
}
function createActionFromBand() {
  const lv = drill.stack[drill.stack.length - 1]; if (!lv) return;
  const id = 'own|' + Date.now();
  ACTS[id] = { custom: true, id, title: 'Review: ' + lv.title, issue: lv.title, why: lv.insight || lv.title, chain: [], poc: K.PEOPLE[state.role], urgency: 'Medium', target: '', value: 0, sev: 'warn', f: lv.focus || filter(), assigned: TODAY, due: TODAY + 7 * DAY, status: 'New', role: state.role };
  saveActs(); renderHome(); toast('Action created from this view · see My actions');
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => el.hidden = true, 2600); }


/* ======================================================================
   PULSE v2 — home, cards (4-slot framework), panel with its own filters
   and Ask, RGM checks, bookmarks, actions. Desktop only.
   ====================================================================== */
let PF = {};                                   // filters of the open panel (home always uses the whole company)
const withF = (f, fn) => { const s = PF; PF = f; try { return fn(); } finally { PF = s; } };
filter = function () { return { ...PF }; };    // every calculation reads the panel's filters
const NAME = { CEO: 'Sarah', CFO: 'David', CMO: 'Emma', CSO: 'Mike', COO: 'Tom' };
const first = p => (p || '').split(' · ')[0].split(' ')[0];
const plain = v => (v * 100).toFixed(1).replace('-', MINUS) + '%';

/* ---------- cash (free cash flow) ---------- */
function cash(sc, w0, w1) {
  const fin = K.finance({}, sc, w0, w1), ns = fin.ns, C = K.CASH, overlap = (a, b) => Math.max(0, Math.min(w1, b) - Math.max(w0, a) + 1);
  const da = ns * C.da, interest = fin.interest, tax = Math.max(0, (fin.op - interest) * C.taxRate), capex = ns * (sc === 'A' ? C.capexA : C.capexT);
  const wc = ns * C.wcT + (sc === 'A' ? C.india_receivables * overlap(30, 41) / 12 + C.inventory_build * overlap(1, 41) / 41 : 0);
  const fcf = fin.op + da - tax - interest - capex - wc;
  return { op: fin.op, da, tax, interest, capex, wc, fcf, np: fin.np, conv: fcf / fin.np };
}
function penetration(f) {
  let n = 0, a = 0, l = 0;
  for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const p = K.PENETRATION[b + '|' + c]; if (!p || !has({ b: [b], c: [c] })) continue; const w = agg({ b: [b], c: [c] }, 'A', 1, CW).ns; n += w; l += p[0] * w; a += p[1] * w; }
  return { now: a / n, ly: l / n, chg: (a - l) / n };
}

/* ---------- card registry: the same 4 slots in every view ---------- */
const SLOTS = ['Sales', 'Profit & cost', 'Market & outside view', 'Cash, stock & buyers'];
const ROLE_CARDS = { CEO: ['OSG', 'OM', 'SHARE', 'FCF'], CFO: ['OSG', 'GM', 'EPS', 'FCF'], CMO: ['SSG', 'AP', 'SHARE', 'PENF'], CSO: ['SALES', 'TRADE', 'DIST', 'CHINV'], COO: ['OTIF', 'COGS', 'SAFQ', 'RISK'] };
const CARD_DEF = {
  OSG: ['Organic sales growth', 'Net sales (shipments, after trade spend) vs last year, excluding currency and acquisitions.', 'Net sales ÷ net sales last year − 1'],
  OSGB: ['Organic sales growth', 'Brand growth vs last year and vs plan; which brands lead and lag.', 'Net sales ÷ net sales last year − 1'],
  SSG: ['Shopper sales growth', 'What shoppers bought at retail (sell-out, retailer POS data) vs last year, compared with category growth. Differs from net sales (shipments) by the change in stock held by retailers and distributors.', 'Retail sales value ÷ retail sales value last year − 1'],
  SALES: ['Net sales vs sales target', 'Month-to-date shipments against the sales target the team is paid on (incentive basis), and whether each sales head will make the month.', 'MTD net sales ÷ MTD sales target'],
  OM: ['Operating margin', 'Profit after all operating costs as a share of net sales (company total).', 'Operating profit ÷ net sales'],
  GM: ['Gross margin (after trade)', 'Net sales after trade spend, minus the cost of goods, as a share of net sales. Home of price, promotions and input costs.', '(Gross sales − trade spend − returns − cost of goods) ÷ net sales'],
  AP: ['A&P spend & return', 'Advertising and promotion spend vs budget, and the extra gross margin each $1 earns (marketing mix model, updated quarterly).', 'Spend: A&P actual vs budget · Return: extra gross margin ÷ A&P'],
  ROMI: ['Marketing ROI', 'Extra gross margin per $1 of marketing (marketing mix model, quarterly).', 'Extra gross margin ÷ marketing spend'],
  TRADE: ['Trade spend', 'Money given to retailers as a share of gross sales, and the return on promotions.', 'Trade spend ÷ gross sales'],
  COGS: ['Cost per case', 'Cost of goods for one standard case vs plan, and productivity savings delivered vs plan.', 'Cost of goods ÷ cases'],
  SHARE: ['Market share', 'Our share of category sales value (market data, measured channels), with category growth alongside.', 'Our shopper sales ÷ category sales'],
  EPS: ['Earnings per share', 'Full-year EPS forecast vs our guidance and analyst consensus.', '(Operating profit − interest) × (1 − tax) ÷ shares'],
  DIST: ['Store distribution', 'Share of category sales made in stores that stock us, and outlets reached.', 'Category sales in stocking stores ÷ all category sales'],
  QUAL: ['Quality & safety', 'Complaints per million units, recalls, open regulatory cases and site safety.', 'Complaints ÷ units sold × 1,000,000'],
  SAFQ: ['Safety & quality', 'Lost-time injuries per million hours worked (rolling 12 months), then consumer complaints, holds and recalls.', 'Lost-time injuries ÷ hours worked × 1,000,000'],
  FCF: ['Free cash flow', 'Cash left after running and investing in the business. Books closed to September.', 'Operating profit + D&A − tax − interest − capex − working capital'],
  PEN: ['Household penetration', 'Share of households that bought our brands in the last 52 weeks (consumer panel).', 'Buying households ÷ all households'],
  PENF: ['Buyers & frequency', 'Share of households buying our brands in the last 52 weeks, and how often each buyer buys. Losing buyers is a brand problem; buying less often is usually a price or occasion problem.', 'Penetration = buying households ÷ all households · frequency = trips ÷ buyers'],
  CHINV: ['Channel inventory', 'Weeks of our stock held by distributors and stores vs normal.', 'Channel stock ÷ weekly shopper sales'],
  OTIF: ['Service level (OTIF)', 'Orders delivered on time and in full (case level, each customer’s contract window), retailers below contract, and sales lost to supply.', 'On-time-in-full cases ÷ ordered cases'],
  INVD: ['Inventory days', 'Days of stock in our warehouses vs target, and items about to run out.', 'Inventory ÷ average daily demand'],
  RISK: ['Supply risk · 13 weeks', 'Product-locations projected to run below their replenishment time in the next 13 weeks (supply planner, includes confirmed recovery plans).', 'Projected days of cover < replenishment time'],
};
Object.entries(CARD_DEF).forEach(([k, v]) => DEF[k] = v);
DEF.FRESH = ['How fresh is this?', 'Sales and costs: to week ending 11 Oct 2026. September books are closed and tie to the management accounts; October is still open. Market share: to 20 Sep. Consumer panel and brand tracker: September.', ''];
DEF.CLOSE = ['Books and reconciliation', 'September is closed and ties to the management accounts. October is still open, so its actuals can change until close on working day 5.', ''];
const CARD_SLOT = { OSG: 0, OSGB: 0, SSG: 0, SALES: 0, OTIF: 0, OM: 1, GM: 1, AP: 1, ROMI: 1, TRADE: 1, COGS: 1, SHARE: 2, EPS: 2, DIST: 2, QUAL: 2, SAFQ: 2, FCF: 3, PEN: 3, PENF: 3, CHINV: 3, INVD: 3, RISK: 3 };
const compLab = () => ({ T: 'Plan', E: 'Latest estimate', L: 'Last year', M: 'Last month' })[state.comp];
const compProv = () => state.comp === 'E' ? 'FP&A · ' + K.LE.label : state.comp === 'T' ? 'FP&A plan' : 'ERP';

/* ---------- as-of: recompute any card as if the data stopped s weeks earlier ---------- */
function asOf(s, fn) { const c = CW; CW = K.CW - s; try { return fn(); } finally { CW = c; } }

/* ---------- shopper sales, buyers, supply risk ---------- */
function shopper(f, w0, w1) {
  const fn = { c: f.c, b: f.b }, a = agg(f, 'A', w0, w1), l = agg(f, 'L', w0, w1), m1 = Math.min(w1, K.MKT_LAST), m0 = Math.min(w0, m1);
  const mA = K.market(fn, 'A', m0, m1), mL = K.market(fn, 'L', m0, m1);
  return { g: a.rsv / l.rsv - 1, ship: a.ns / l.ns - 1, cat: mA / mL - 1, rsv: a.rsv };
}
function buyers(f) {
  const rows = [];
  for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const p = K.PENETRATION[b + '|' + c]; if (!p || !has({ b: [b], c: [c] })) continue;
    const q = K.FREQUENCY[b + '|' + c] || [5 + b.length * .4, 5 + b.length * .4 + ((c.charCodeAt(0) % 3) - 1) * .05, .45], w = agg({ b: [b], c: [c] }, 'A', 1, CW).ns;
    const dp = p[1] - p[0], df = q[1] / q[0] - 1;
    rows.push({ b, c, label: K.BMAP[b].name + ' · ' + K.CMAP[c].name, pen: p[1], penLY: p[0], dp, freq: q[1], freqLY: q[0], df, rep: q[2], w, why: dp < -.3 && df > -.02 ? 'Losing buyers' : dp > -.3 && df < -.03 ? 'Buying less often' : dp < -.3 ? 'Both' : 'Growing or stable', slice: { b: [b], c: [c] } });
  }
  const W = rows.reduce((x, r) => x + r.w, 0) || 1, wavg = k => rows.reduce((x, r) => x + r[k] * r.w, 0) / W;
  return { rows, pen: wavg('pen'), penLY: wavg('penLY'), freq: wavg('freq'), freqLY: wavg('freqLY'), rep: wavg('rep') };
}
const RISK_H = 13;
function supplyRisk(f) {
  const out = [];
  for (const c of countriesOf(f)) for (const b of brandsOf(f)) { if (!has({ b: [b], c: [c] })) continue; const lead = K.CMAP[c].leadDays;
    K.BMAP[b].skus.forEach(([sku], i) => { const k = 1 + (i - 1) * .12, wk = []; for (let w = CW + 1; w <= CW + RISK_H; w++) wk.push(K.invProj(c, b, w) * k);
      const first = wk.findIndex(d => d < lead + 2); if (first >= 0) out.push({ c, b, sku, lead, wk, first, days: wk[first], wh: K.WAREHOUSES.find(x => x.c === c).name, slice: { b: [b], c: [c] } }); }); }
  return out.sort((a, b) => a.first - b.first || a.days / a.lead - b.days / b.lead);
}
const wkLabel = w => K.weekEnd(w).toLocaleString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/* ---------- card(): one number, its comparison, period and status ---------- */
// returns value (display), raw (number for trends and bookmarks), rk/rg (how to format and judge a change in raw),
// delta (vs comparison), sev, per (period tag), ref + prov (reference line and its source), insight, say (summary sentence)
function card(id) {
  const P = win(), D = stripData(), A = D.A, C = D.C, L = D.L, T = D.T, cmp = compShort();
  switch (id) {
    case 'OSG': case 'OSGB': { const g = A.ns / L.ns - 1, fy = vr(D.FA.ns, D.FT.ns);
      if (state.comp === 'L') return { value: plain(g), raw: g, rk: 'pts', rg: 1, delta: dv(A.ns - L.ns, '$', 1, 'vs last year'), sev: g >= 0 ? 'good' : 'crit', per: P.label, ref: `Last year ${fmt$(L.ns)}`, prov: 'ERP', insight: `Full-year forecast ${fmt$(D.FA.ns)}, ${sPct(fy)} vs plan`, say: `Sales are ${g >= 0 ? 'up' : 'down'} ${plain(Math.abs(g))} on last year.` };
      const gp = C.ns / (state.comp === 'M' ? agg(D.f, 'L', Math.max(1, P.w0 - 4), Math.max(1, P.wa - 4)).ns : L.ns) - 1, d = (g - gp) * 100;
      return { value: plain(g), raw: g, craw: gp, rk: 'pts', rg: 1, delta: dv(d, 'pts', 1, cmp), sev: sevOf(d, 'pts'), per: P.label, ref: `${compLab()} ${plain(gp)}`, prov: state.comp === 'T' ? 'From RGM tool' : compProv(), insight: `Full-year forecast ${fmt$(D.FA.ns)}, ${sPct(fy)} vs plan`, say: d < -.1 ? `Sales growth of ${plain(g)} is ${Math.abs(d).toFixed(1)} pts behind ${compName()}.` : `Sales growth of ${plain(g)} is on ${compName()}.` }; }
    case 'SSG': { const s = shopper(D.f, P.w0, P.wa), d = (s.g - s.cat) * 100;
      return { value: plain(s.g), raw: s.g, craw: s.cat, rk: 'pts', rg: 1, delta: dv(d, 'pts', 1, 'vs category'), sev: d >= -.2 ? 'good' : d >= -1.5 ? 'warn' : 'crit', per: P.label, ref: `Category ${sPct(s.cat)} · shipments ${sPct(s.ship)}`, prov: 'Retailer POS · market data', insight: Math.abs(s.ship - s.g) < .002 ? 'Shipments match shopper sales: channel stock is stable' : `Shipments ${sPct(s.ship)} ${s.ship > s.g ? 'run ahead of' : 'trail'} shoppers: channel stock ${s.ship > s.g ? 'building' : 'falling'}`, say: d < -.2 ? `Shoppers bought ${plain(s.g)} more than last year, ${Math.abs(d).toFixed(1)} pts behind category growth.` : `Shopper sales ${sPct(s.g)} are ahead of the category.` }; }
    case 'SALES': { const hs = withF({}, () => headsData({})), a = hs.reduce((x, h) => x + h.a, 0), t = hs.reduce((x, h) => x + h.t, 0), tm = hs.reduce((x, h) => x + h.tm, 0), miss = hs.filter(h => h.pv < 1).length;
      const el = monthWk().filter(w => w <= CW).length * 7, rem = Math.max(7, (monthWk().length * 7) - el), need = (tm - a) / rem, now = a / el;
      return { value: plain(a / t), raw: a / t, craw: 1, rk: 'pts', rg: 1, delta: dv(a / t - 1, 'pct', 1, 'vs sales target'), sev: a / t >= 1 ? 'good' : a / t >= .98 ? 'warn' : 'crit', per: 'MTD', ref: `Need ${fmt$(need)}/day for the rest of October vs ${fmt$(now)}/day now`, prov: 'Sales target · incentive basis', insight: `${miss} of ${hs.length} sales heads set to miss October`, heads: miss, say: a / t >= 1 ? `Sales are ${pct1(a / t - 1)} ahead of the October target.` : `Sales are ${pct1(1 - a / t)} behind the October target.` }; }
    case 'OM': { const m = D.opA.op / D.opA.ns, mc = D.opC.op / D.opC.ns, d = (m - mc) * 1e4;
      return { value: plain(m), raw: m, craw: mc, rk: 'bps', rg: 1, delta: dv(d, 'bps', 1, cmp), sev: sevOf(d, 'bps'), per: P.label, ref: `${compLab()} ${plain(mc)} · profit ${fmt$(D.opA.op)}`, prov: compProv(), insight: 'Lower overheads are covering weaker margin after direct costs', say: d < -10 ? `Operating margin is ${Math.round(Math.abs(d))} bps below ${compName()}.` : `Operating margin is on ${compName()}.` }; }
    case 'GM': { const gm = x => (x.ns - x.cogs) / x.ns, d = (gm(A) - gm(C)) * 1e4;
      return { value: plain(gm(A)), raw: gm(A), craw: gm(C), rk: 'bps', rg: 1, delta: dv(d, 'bps', 1, cmp), sev: sevOf(d, 'bps'), per: P.label, ref: `${compLab()} ${plain(gm(C))} · trade ${pct1(A.tr / A.gs)} of gross sales`, prov: compProv(), insight: 'Oat costs are rising faster than prices', say: d < -10 ? `Gross margin is ${Math.round(Math.abs(d))} bps below ${compName()}.` : `Gross margin is on ${compName()}.` }; }
    case 'AP': { const v = vr(A.ap, C.ap), r = A.inc / A.ap, rp = T.inc / T.ap;
      return { value: r.toFixed(2) + 'x', valueUnit: 'per $1', raw: r, craw: rp, rk: 'x', rg: 1, delta: dv(r - rp, 'x', 1, 'return vs plan'), sev: r < rp * .9 ? 'crit' : Math.abs(v) > .05 || r < rp ? 'warn' : 'good', per: P.label, ref: `Spend ${fmt$(A.ap)} ${sPct(v)} ${state.comp === 'T' ? 'vs budget' : cmp}`, prov: 'Marketing mix model · Q2', insight: 'Bolt Up (TV) is lifting sales 3% vs 8% planned', say: r < rp ? `Marketing returns ${r.toFixed(2)}x per $1, below the ${rp.toFixed(2)}x plan.` : Math.abs(v) > .05 ? `A&P spend is ${pct1(Math.abs(v))} ${v > 0 ? 'over' : 'under'} budget.` : `A&P is on budget and returning ${r.toFixed(2)}x per $1.` }; }
    case 'ROMI': { const r = A.inc / A.ap, rp = T.inc / T.ap;
      return { value: r.toFixed(2) + 'x', raw: r, craw: rp, rk: 'x', rg: 1, delta: dv(r - rp, 'x', 1, 'vs plan'), sev: r >= rp ? 'good' : r >= rp * .9 ? 'warn' : 'crit', per: P.label, ref: `Plan ${rp.toFixed(2)}x · spend ${fmt$(A.ap)}`, prov: 'Marketing mix model · Q2', insight: 'Glow Skincare e-commerce returns 4.6x', say: `Marketing returns ${r.toFixed(2)}x per dollar.` }; }
    case 'TRADE': { const tr = x => x.tr / x.gs, d = (tr(A) - tr(C)) * 1e4, ev = promosIn(D.f).filter(p => p.roi != null), roi = ev.length ? ev.reduce((x, p) => x + p.incGM, 0) / ev.reduce((x, p) => x + p.spend, 0) : 1.2;
      return { value: plain(tr(A)), raw: tr(A), craw: tr(C), rk: 'bps', rg: -1, delta: dv(d, 'bps', -1, cmp), sev: d > 50 || roi < 1 ? 'crit' : d > 10 ? 'warn' : 'good', per: P.label, ref: `${compLab()} ${plain(tr(C))} of gross sales`, prov: state.comp === 'T' ? 'From RGM tool' : compProv(), insight: `Promotions return ${roi.toFixed(2)}x vs 1.20x plan`, say: roi < 1 ? `Promotions are losing money: each $1 returns ${roi.toFixed(2)}x.` : 'Promotions are paying back.' }; }
    case 'COGS': { const u = x => x.cogs / x.vol, v = vr(u(A), u(C)), sv = K.SAVINGS, done = sv.reduce((x, s) => x + s.done, 0), plan = sv.reduce((x, s) => x + s.plan, 0);
      return { value: '$' + u(A).toFixed(2), raw: u(A), craw: u(C), rk: 'pct', rg: -1, delta: dv(v, 'pct', -1, cmp), sev: sevOf(-v, 'pct'), per: P.label, ref: `Savings ${fmt$(done)} of ${fmt$(plan)} plan to date`, prov: 'Productivity programme', insight: 'Oats (+18%) vs budget, only 40% hedged', say: v > .005 ? `Cost per case is ${(v * 100).toFixed(1)}% over ${compName()}, driven by oats.` : `Cost per case is on ${compName()}.` }; }
    case 'SHARE': { const ch = D.sh.chg * 100;
      return { value: plain(D.sh.now), raw: D.sh.now, craw: D.sh.ly, rk: 'pts', rg: 1, delta: dv(ch, 'pts', 1, 'vs last year'), sev: ch >= -.3 ? 'good' : ch >= -1 ? 'warn' : 'crit', per: '4 wks to 20 Sep', ref: `Category ${sPct(D.sh.mktGrowth)} · ${rankText(D.f)}`, prov: 'Market data', insight: D.f.c || D.f.b ? `Our sales ${sPct(D.sh.ourGrowth)} vs category ${sPct(D.sh.mktGrowth)}` : 'Losing UK coffee share to Volt Coffee', say: ch < -.3 ? `Market share slipped ${Math.abs(ch).toFixed(1)} pts; Bolt Brew is losing to Volt Coffee in the UK.` : 'Bolt Brew is losing UK share to Volt Coffee, while total share holds.' }; }
    case 'EPS': { const e = D.fyA.eps, g = K.FIN.guidance.eps, cs = K.FIN.consensus.eps;
      return { value: '$' + e.toFixed(2), raw: e, craw: cs, rk: 'eps', rg: 1, delta: dv(e - cs, 'eps', 1, 'vs consensus'), sev: e < g[0] ? 'crit' : e < cs ? 'warn' : 'good', per: 'FY outlook', ref: `Guidance $${g[0].toFixed(2)}–${g[1].toFixed(2)} · consensus $${cs.toFixed(2)}`, prov: 'Investor relations', insight: `$${(g[0] - e).toFixed(2)} below the bottom of guidance`, say: e < g[0] ? `Full‑year EPS is heading to $${e.toFixed(2)}, below guidance.` : 'EPS is within guidance.' }; }
    case 'DIST': { const R = K.SALES_HEADS.map(h => K.REACH[h.id]), o = R.reduce((x, r) => x + r.outlets, 0), tg = R.reduce((x, r) => x + r.target, 0), wd = R.reduce((x, r) => x + r.wd * r.outlets, 0) / o, wl = R.reduce((x, r) => x + r.wdLY * r.outlets, 0) / o;
      return { value: plain(wd), raw: wd, craw: wl, rk: 'pts', rg: 1, delta: dv((wd - wl) * 100, 'pts', 1, 'vs last year'), sev: o / tg >= .99 ? 'good' : o / tg >= .96 ? 'warn' : 'crit', per: 'Sep retail audit', ref: `${(o / 1000).toFixed(0)}K outlets vs ${(tg / 1000).toFixed(0)}K plan`, prov: 'Retail audit', insight: 'Reach behind in North India and Jakarta', say: 'Store reach is behind plan in North India and Jakarta.' }; }
    case 'QUAL': { const q = K.QUALITY;
      return { value: q.cpmu.toFixed(1), raw: q.cpmu, craw: q.cpmuTarget, rk: 'n', rg: -1, delta: dv(q.cpmu - q.cpmuTarget, 'n', -1, 'vs target'), sev: q.recalls || q.openCases ? 'crit' : 'good', per: 'Rolling 12 months', ref: `Target ${q.cpmuTarget} · no recalls`, prov: 'Quality system', insight: `Safety: ${K.SAFETY.ltifr} injuries per million hours`, say: 'Quality and safety are on track.' }; }
    case 'SAFQ': { const s = K.SAFETY, q = K.QUALITY, inc = s.incidents[0], bad = s.ltifr > s.target || q.recalls || q.openCases;
      return { value: s.ltifr.toFixed(2), raw: s.ltifr, craw: s.target, rk: 'n2', rg: -1, delta: `<span class="dv ${s.ltifr <= s.target ? 'fav' : 'unf'}">${s.ltifr <= s.target ? '▼' : '▲'} (${s.ltifr <= s.target ? MINUS : '+'}${Math.abs(s.ltifr - s.target).toFixed(2)}) <small>injuries per million hours vs target</small></span>`, sev: bad ? 'crit' : q.cpmu > q.cpmuTarget ? 'warn' : 'good', per: 'Rolling 12 months', ref: `Complaints ${q.cpmu} per million units vs ${q.cpmuTarget} target · no recalls`, prov: 'Safety & quality systems', insight: `Lost-time injury at ${inc.site} (Wk ${inc.w}); guard fitted`, say: bad ? 'Safety is above its injury target.' : 'Safety and quality are on track.' }; }
    case 'FCF': { const ca = cash('A', 1, 39), ct = cash('T', 1, 39), v = vr(ca.fcf, ct.fcf);
      return { value: fmt$(ca.fcf), raw: ca.fcf, craw: ct.fcf, rk: '$', rg: 1, delta: dv(v, 'pct', 1, 'vs plan'), sev: sevOf(v, 'pct'), per: 'Jan–Sep · closed', ref: `Plan ${fmt$(ct.fcf)} · cash conversion ${(ca.conv * 100).toFixed(0)}% vs 90%`, prov: 'ERP · books closed', insight: 'India distributors are holding more of our stock on credit', say: v < -.005 ? `Free cash flow is ${Math.abs(v * 100).toFixed(0)}% below plan; India distributors owe us more.` : 'Cash is on plan.' }; }
    case 'PEN': { const p = penetration(D.f);
      return { value: p.now.toFixed(1) + '%', raw: p.now, craw: p.ly, rk: 'pts', rg: 1, delta: dv(p.chg, 'pts', 1, 'vs last year'), sev: sevOf(p.chg, 'pts'), per: '52 wks to Sep', ref: `Last year ${p.ly.toFixed(1)}%`, prov: 'Consumer panel', insight: 'Bolt Brew UK lost 0.9M buyers to Volt Coffee', say: 'Bolt Brew is losing UK buyers to Volt Coffee.' }; }
    case 'PENF': { const bz = buyers(D.f), dp = bz.pen - bz.penLY, df = bz.freq / bz.freqLY - 1, worst = bz.rows.slice().sort((a, b) => a.dp - b.dp)[0];
      return { value: bz.pen.toFixed(1) + '%', raw: bz.pen, craw: bz.penLY, rk: 'pts', rg: 1, delta: dv(dp, 'pts', 1, 'households vs last year'), sev: worst && worst.dp < -1 ? 'warn' : dp < -.2 ? 'warn' : 'good', per: '52 wks to Sep', ref: `Frequency ${bz.freq.toFixed(1)} trips/yr ${sPct(df)} · repeat ${(bz.rep * 100).toFixed(0)}%`, prov: 'Consumer panel', insight: worst ? `${worst.label}: ${worst.why === 'Both' ? 'fewer buyers, buying less often' : worst.why.toLowerCase()} ${sPts(worst.dp)}` : '', say: worst && worst.dp < -1 ? (worst.why === 'Both' ? `${worst.label} is losing buyers ${sPts(worst.dp)} and they buy less often ${sPct(worst.df, 0)}.` : `${worst.label} is losing buyers ${sPts(worst.dp)} while frequency holds: a brand problem, not price.`) : 'Buyer numbers are holding.' }; }
    case 'CHINV': { const cs = channelStock(D.f), w = cs[0];
      return { value: w.cover.toFixed(1) + ' wks', raw: w.cover, craw: w.normal, rk: 'wks', rg: -1, delta: `<span class="dv ${w.cover > w.normal * 1.15 ? 'unf' : 'neu'}">vs ${w.normal} wks normal</span>`, sev: w.cover > w.normal * 1.3 ? 'crit' : w.cover > w.normal * 1.15 ? 'warn' : 'good', per: 'Wk ' + CW, ref: w.label, prov: 'Distributor system', insight: 'Expect lower orders from India distributors', say: `${w.label} holds ${w.cover.toFixed(1)} weeks of stock vs ${w.normal} normal.` }; }
    case 'OTIF': { const ac = accountsData(D.f, { ...P, w0: CW - 3, w1: CW, wa: CW }), v = ac.reduce((x, a) => x + a.otif * a.a, 0) / (ac.reduce((x, a) => x + a.a, 0) || 1), br = ac.filter(a => a.otif < a.otifT), lost = agg(D.f, 'A', CW - 3, CW).lost;
      return { value: plain(v), raw: v, craw: .95, rk: 'pts', rg: 1, delta: dv((v - .95) * 100, 'pts', 1, 'vs 95% target'), sev: br.length ? 'warn' : v >= .95 ? 'good' : 'warn', per: '4 wks', ref: `${br.length} retailers below contract · lost sales ${fmt$(lost)}`, prov: 'Customer contracts', insight: br.length ? `Fines ${fmt$(br.reduce((x, a) => x + a.fines, 0))}: Indonesia port delays` : 'All retailers within contract', say: br.length ? `${br.map(a => a.name).join(' and ')} are below their delivery contracts; ${fmt$(lost)} of sales lost in 4 weeks.` : 'All retailers within contract.' }; }
    case 'INVD': { const wh = warehouseData(D.f), avg = wh.reduce((x, w) => x + w.days, 0) / wh.length, rk = stockRisk(D.f);
      return { value: avg.toFixed(0) + ' days', raw: avg, craw: K.INV_TARGET_DAYS, rk: 'days', rg: 0, delta: `<span class="dv neu">vs ${K.INV_TARGET_DAYS}-day target</span>`, sev: rk.length > 4 ? 'crit' : rk.length ? 'warn' : 'good', per: 'Wk ' + CW, ref: `${rk.length} items will run out before resupply`, prov: 'Supply planner', insight: 'Orchard Indonesia: 4 days of stock left', say: `${rk.length} items will run out before they can be restocked.` }; }
    case 'RISK': { const r = supplyRisk(D.f), near = r.filter(x => x.first < 4), later = r.filter(x => x.first >= 4), acc = K.FORECAST_ACC, cs = countriesOf(D.f), fa = cs.reduce((x, c) => x + acc[c], 0) / cs.length, nw = later[0];
      return { value: String(r.length), raw: r.length, rk: 'n0', rg: -1, valueUnit: r.length === 1 ? 'item' : 'items', delta: `<span class="dv ${near.length ? 'unf' : 'neu'}">${near.length} in the next 4 wks · ${later.length} in wks 5–13</span>`, sev: near.length ? 'crit' : later.length ? 'warn' : 'good', per: `To ${wkLabel(CW + RISK_H)}`, ref: `Forecast accuracy ${(fa * 100).toFixed(0)}% vs ${(acc.target * 100).toFixed(0)}% target`, prov: 'Supply planner', insight: nw ? `New: ${K.BMAP[nw.b].name} ${K.CMAP[nw.c].name} runs short from ${wkLabel(CW + 1 + nw.first)}` : near.length ? `${near[0].sku} at ${near[0].wh}: ${near[0].days.toFixed(0)} days left` : 'No stock-out risk in 13 weeks', say: `${r.length} items will run short in the next 13 weeks${nw ? `, including ${K.BMAP[nw.b].name} in the ${K.CMAP[nw.c].name} holiday peak` : ''}.` }; }
  }
}

/* ---------- 13-week trend under every card ---------- */
const WINDOWED = ['OSG', 'OSGB', 'SSG', 'OM', 'GM', 'AP', 'ROMI', 'TRADE', 'COGS', 'CHINV', 'OTIF', 'SALES'];
function trendOf(id) {
  const f = filter(), n = 13;
  if (WINDOWED.includes(id)) { const a = [], c = []; for (let s = n - 1; s >= 0; s--) { const x = asOf(s, () => card(id)); a.push(x.raw); c.push(x.craw); } return { a, c: c.every(v => v != null) ? c : null, step: 'week', lab: '13 weeks' }; }
  if (id === 'SHARE') { const a = [], c = []; for (let w = K.MKT_LAST - n + 1; w <= K.MKT_LAST; w++) { const s = K.share(f, w - 3, w); a.push(s.now); c.push(s.ly); } return { a, c, step: 'week', lab: '13 weeks to 20 Sep' }; }
  if (id === 'EPS') { const h = K.LE_HISTORY.map(x => x[1]); return { a: h, c: h.map(() => K.FIN.consensus.eps), step: 'month', lab: 'Outlook by month' }; }
  if (id === 'FCF') { const a = [], c = []; for (let m = 0; m < 9; m++) { const ws = weeksIn(m); if (!ws.length) continue; const w = ws[ws.length - 1]; a.push(cash('A', 1, w).fcf); c.push(cash('T', 1, w).fcf); } return { a, c, step: 'month', lab: 'Year to date by month' }; }
  if (id === 'SAFQ') { const h = K.SAFETY.history; return { a: h, c: h.map(() => K.SAFETY.target), step: 'month', lab: '12 months' }; }
  if (id === 'RISK') { const a = []; for (let s = n - 1; s >= 0; s--) a.push(asOf(s, () => supplyRisk(f).length)); return { a, c: null, step: 'week', lab: '13 weeks' }; }
  if (id === 'INVD') { const a = []; for (let s = n - 1; s >= 0; s--) a.push(asOf(s, () => card(id).raw)); return { a, c: a.map(() => K.INV_TARGET_DAYS), step: 'week', lab: '13 weeks' }; }
  // 4-weekly panel and audit reads: from last year's level to today's, as reported
  const x = card(id); if (x.craw == null) return null; const a = []; for (let i = 0; i < n; i++) { const t = i / (n - 1); a.push(x.craw + (x.raw - x.craw) * (t * t * .6 + t * .4) + (i && i < n - 1 ? Math.sin(i * 1.7) * Math.abs(x.raw - x.craw) * .08 : 0)); }
  return { a, c: null, step: '4 weeks', lab: '4-weekly reads' };
}
// change between two raw readings, in the card's own units; "no change" when it rounds to zero
function changeText(id, rk, prev, cur) {
  const d = cur - prev, pctUnits = id === 'PENF' || id === 'PEN';
  return rk === 'bps' ? sBps(d * 1e4) : rk === 'pts' ? sPts(d * (pctUnits ? 1 : 100)) : rk === 'pct' ? sPct(prev ? cur / prev - 1 : 0) : rk === '$' ? s$(d) : rk === 'x' ? sgn(d, Math.abs(d).toFixed(2) + 'x') : rk === 'eps' ? sgn(d, '$' + Math.abs(d).toFixed(2)) : rk === 'wks' ? sgn(d, Math.abs(d).toFixed(1) + ' wks') : rk === 'days' ? sgn(d, Math.abs(d).toFixed(1) + ' days') : rk === 'n0' ? sgn(d, Math.abs(d).toFixed(0)) : rk === 'n2' ? sgn(d, Math.abs(d).toFixed(2)) : sgn(d, Math.abs(d).toFixed(1));
}
function changeHtml(id, x, prev, cur, suffix) {
  if (prev == null || cur == null || !isFinite(prev) || !isFinite(cur)) return '';
  const txt = changeText(id, x.rk, prev, cur);
  if (!/[1-9]/.test(txt.replace(/\$|bps|pts|wks|days|x/g, ''))) return `<span class="dv neu">no change <small>${suffix}</small></span>`;
  const up = cur > prev, fav = x.rg === 0 ? 'neu' : up === (x.rg > 0) ? 'fav' : 'unf';
  return `<span class="dv ${fav}">${up ? '▲' : '▼'} ${txt} <small>${suffix}</small></span>`;
}
function trendSvg(t, sev) {
  if (!t || t.a.length < 2) return '<span class="c-trend empty"></span>';
  const W = 200, H = 34, all = t.a.concat(t.c || []).filter(isFinite); let lo = Math.min(...all), hi = Math.max(...all); if (hi - lo < 1e-12) { hi += 1; lo -= 1; } const pad = (hi - lo) * .12; lo -= pad; hi += pad;
  const X = i => 3 + i / (t.a.length - 1) * (W - 8), Y = v => 3 + (1 - (v - lo) / (hi - lo)) * (H - 6), p = arr => arr.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(''), last = t.a.length - 1;
  return `<svg class="c-trend" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${t.c ? `<path d="${p(t.c)}" fill="none" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" opacity=".8"/>` : ''}<path d="${p(t.a)}" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><circle cx="${X(last)}" cy="${Y(t.a[last])}" r="2.6" fill="${sev === 'good' ? 'var(--ink)' : 'var(--neg)'}"/></svg>`;
}
function cardHtml(id, i) {
  const x = withF({}, () => card(id)), t = withF({}, () => trendOf(id));
  const since = id === 'FCF' && t ? `<span class="dv neu">${fmt$(t.a[t.a.length - 1] - t.a[t.a.length - 2])} <small>generated in Sep</small></span>` : t ? changeHtml(id, x, t.a[t.a.length - 2], t.a[t.a.length - 1], t.step === 'week' ? 'vs last week' : t.step === 'month' ? 'vs last month' : 'vs prior read') : '';
  return `<button class="card ${OPEN === id ? 'on' : ''}" data-open="${id}" aria-expanded="${OPEN === id}" style="--d:${i * 50}ms">
    <span class="c-top"><span class="c-name">${esc(CARD_DEF[id][0])}<span class="info" data-def="${id}" aria-hidden="true">i</span></span>${sevPill(x.sev)}</span>
    <span class="c-val num">${x.value}${x.valueUnit ? `<small class="c-unit">${x.valueUnit}</small>` : ''}<span class="c-per">${esc(x.per)}</span></span><span class="c-delta num">${x.delta}</span>
    <span class="c-tr">${trendSvg(t, x.sev)}<span class="c-tr-l"><span class="c-tr-n">${t ? esc(t.lab) : ''}${t && t.c ? ` · <i class="dash-k"></i>${id === 'SHARE' ? 'last year' : id === 'EPS' ? 'consensus' : id === 'SSG' ? 'category' : id === 'SAFQ' || id === 'OTIF' ? 'target' : id === 'CHINV' ? 'normal' : compLab().toLowerCase()}` : ''}</span>${since}</span></span>
    <span class="c-ref num">${esc(x.ref)} <span class="prov">${esc(x.prov)}</span></span>
    <span class="c-ins">${esc(x.insight)}</span><span class="c-slot">${SLOTS[CARD_SLOT[id]]}</span></button>`;
}

/* ---------- summary ---------- */
function summaryView(ex) {
  const ids = ROLE_CARDS[state.role], cs = ids.map(id => ({ id, ...withF({}, () => card(id)) })), bad = cs.filter(c => c.sev !== 'good');
  // each headline sentence opens the metric it is about
  const head = bad.length ? bad.slice(0, 2).map(c => `<button class="say" data-open="${c.id}"${c.id === 'TRADE' && /losing money/.test(c.say) ? ' data-then="F5"' : ''} title="Open ${esc(CARD_DEF[c.id][0])}">${emph(c.say)}<span class="say-go" aria-hidden="true"> →</span></button>`).join(' ') : 'Everything you own is on track this period.';
  const watch = [];
  // other issues: each row says what is wrong, why, and what it is worth
  const cap = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  if (state.role === 'CSO') { const sc = cs.find(c => c.id === 'SALES'); if (sc && sc.heads > 3) watch.push({ t: 'Sales heads', l: 'Behind target', sev: 'warn', issue: `${sc.heads} of 10 sales heads are set to miss October at current pace`, go: { card: 'SALES' } }); }
  // a core metric off track reads as: by how much → is that bad → why
  const strip = h => String(h).replace(/<[^>]*>/g, '').replace(/[▲▼]\s*/g, '').trim();
  const tol = c => ({ pct: '2%', $: '2%', bps: '60 bps', pts: '1 pt' })[c.rk];
  const CARD_WHY = { EPS: 'oat costs and deeper promotions cut margin; overhead savings only cover part of it', GM: 'oat costs are rising faster than our prices', OSG: 'Bolt Brew UK and Orchard Juice Indonesia are behind; Glow India is ahead', CHINV: 'shipments ran 13% ahead of shopper purchases after a distributor incentive', RISK: 'Indonesia port delays and Diwali demand in India; new: Sunrise Oats USA runs short from 6 Dec' };
  const MUCH = { EPS: c => `$${c.raw.toFixed(2)} outlook, $${(c.craw - c.raw).toFixed(2)} below consensus`, CHINV: c => `${c.raw.toFixed(1)} weeks of stock vs ${c.craw} normal`, RISK: c => `${c.raw} items run short in the next 13 weeks (${strip(c.delta).split(' · ')[0].replace('in the next 4 wks', 'within 4 weeks')})` };
  const BAD = { EPS: 'Off track: below the guidance we gave investors', CHINV: 'Off track: more than 30% above normal cover', RISK: 'Off track: stock-outs within 4 weeks', OTIF: 'At risk: retailers below their delivery contracts' };
  bad.slice(2).forEach(c => { const gap = c.raw != null && c.craw != null ? changeText(c.id, c.rk, c.craw, c.raw) : '';
    const much = MUCH[c.id] ? MUCH[c.id](c) : c.rk === '$' ? `${fmt$(Math.abs(c.raw - c.craw))} ${c.raw < c.craw ? 'below' : 'above'} plan ${strip(c.delta).replace(/ vs plan$/, '')}` : strip(c.delta);
    const bad_ = BAD[c.id] ? BAD[c.id] : c.sev === 'crit' ? `Off track: beyond the ${tol(c) || 'agreed'} tolerance` : `At risk: within ${tol(c) || 'tolerance'} but slipping`;
    watch.push({ t: CARD_DEF[c.id][0], l: 'Core metric', sev: c.sev, issue: `${cap(much)} → ${bad_} → why: ${CARD_WHY[c.id] || c.insight}`, imp: gap ? ['Gap', gap, 'unf'] : null, go: { card: c.id } }); });
  ex.filter(e => e.d.sev !== 'good').slice(0, 6 - Math.min(watch.length, 2)).forEach(e => { const d = e.d, imp = d.cls === 'loading' ? ['Near-expiry at risk', fmt$(d.value), 'unf'] : d.cls === 'opportunity' ? ['FY sales upside', '+' + fmt$(Math.abs(d.fyNs)), 'fav'] : d.fyCm ? ['FY margin', s$(d.fyCm), d.fyCm < 0 ? 'unf' : 'fav'] : ['FY sales', s$(d.fyNs), d.fyNs < 0 ? 'unf' : 'fav'];
    // issue rows read the same way as core metrics: what is wrong and by how much → is that bad → why
    const useCm = Math.abs(d.cmGap || 0) > Math.abs(d.nsGap || 0) * .3, gap = useCm ? d.cmGap : d.nsGap, fy = useCm ? d.fyCm : d.fyNs, what = useCm ? 'Margin' : 'Sales';
    const much = d.cls === 'loading' ? `Distributors hold ${(d.chain[1] || '').replace('channel cover ', '')} of stock` : d.cls === 'opportunity' ? `Sales ${fmt$(Math.abs(d.nsGap))} ahead of plan so far, ${fmt$(Math.abs(d.fyNs))} upside for the year` : `${what} ${fmt$(Math.abs(gap))} ${gap < 0 ? 'below' : 'above'} plan so far, ${s$(fy)} for the year if nothing changes`;
    const bad_ = d.cls === 'loading' ? `At risk: ${fmt$(d.value)} of near-expiry stock could come back as returns` : d.cls === 'opportunity' ? 'Opportunity: upside at risk if stock runs out' : d.sev === 'crit' ? `Off track: beyond tolerance${d.dir === 'worse' ? ' and widening over the last 4 weeks' : ''}` : `At risk${d.dir === 'worse' ? ': gap widening over the last 4 weeks' : ': small but not closing'}`;
    const why = (d.chain || []).filter(x => !/^(contribution margin|net sales|gross margin|share|lost sales|market-driven)/.test(x)).slice(0, 3).join(' → ') || d.cause;
    watch.push({ t: e.title, l: d.label, sev: d.sev, issue: `${much} → ${bad_} → why: ${why}`, imp, go: { card: cardFor(d.cls), f: e.f } }); });
  const roleOf = p => { const r = (p || '').split(' · ')[1]; return r ? 'the ' + r : first(p); };
  // next steps = the top open actions from My actions, each with where it came from and why
  const openActs = actionsList().filter(a => a.status !== 'Done');
  const next = openActs.slice(0, 3).map(a => ({ id: a.id, sev: a.sev, t: `Ask ${roleOf(a.poc)} to ${a.title.charAt(0).toLowerCase() + a.title.slice(1).split(/;|\.(?=\s|$)/)[0].replace(/ and extend.*$/, '')} ${a.overdue ? `(overdue since ${fmtD(a.due)})` : 'by ' + fmtD(a.due)}.`,
    why: `${a.issue}${a.chain && a.chain.length ? ': ' + a.chain.slice(0, 2).join(' → ') : ''}`,
    src: /^new/.test(a.id) ? `You created this on ${fmtD(a.assigned)}` : a.status === 'New' ? 'Suggested by Pulse from this issue · not yet assigned' : `${a.status} · you assigned it on ${fmtD(a.assigned)}` }));
  const eps = state.role === 'CEO' ? (() => { const e = K.finance({}, 'A', 1, NW).eps, g = K.FIN.guidance.eps; return `<button class="strip-eps" data-open="EPS">Full-year EPS forecast <b>$${e.toFixed(2)}</b> · guidance $${g[0].toFixed(2)}–${g[1].toFixed(2)} · consensus $${K.FIN.consensus.eps.toFixed(2)} <span class="pill sev ${e < g[0] ? 'crit' : 'good'}">${e < g[0] ? 'Below guidance' : 'Within guidance'}</span></button>`; })() : '';
  return `<div class="sum-card"><div class="sum-main">
      <p class="sum-meta"><span class="ai" data-def="AI">AI summary</span> · data to 11 Oct <span class="info" data-def="FRESH" tabindex="0" aria-label="Data freshness">i</span></p>
      <h1 class="sum-h">${head}</h1>${eps}
      <div class="sum-watch"><h4>Other issues</h4><div class="iss-list">${watch.slice(0, 6).map((w, i) => `<button class="iss" data-watch="${i}" ${i >= 3 ? 'hidden data-more' : ''} title="Open the analysis"><span class="iss-dot ${w.sev}" aria-label="${SEV[w.sev] || ''}"></span><span class="iss-b"><b>${esc(w.t)}</b><span class="iss-l">${esc(w.l || '')}</span><span class="iss-t">${esc(w.issue || '')}</span></span><span class="iss-i">${w.imp ? `${esc(w.imp[0])}<b class="num ${w.imp[2]}">${esc(w.imp[1])}</b>` : ''}</span><span class="iss-go" aria-hidden="true">→</span></button>`).join('') || '<span class="muted">Nothing else needs you.</span>'}</div>${watch.length > 3 ? `<button class="link iss-more" data-iss-more>Show ${Math.min(6, watch.length) - 3} more issues</button>` : ''}</div></div>
    <div class="sum-next"><h4>Next steps <span class="h4-sub">· top ${Math.min(3, openActs.length)} of ${openActs.length} open actions</span></h4><ul class="next">${next.map(n => `<li><button class="nx" data-goact="${esc(n.id)}" title="Show this action in My actions"><span class="nx-t">${esc(n.t)}</span><span class="nx-w"><b>Why:</b> ${esc(n.why)}</span><span class="nx-s">${esc(n.src)}</span></button></li>`).join('') || '<li class="muted">No open actions.</li>'}</ul>${openActs.length ? '<button class="link nx-all" data-goact="">See all actions ↓</button>' : ''}</div></div>`
    + `<script type="application/json" id="watch-data">${JSON.stringify(watch).replace(/</g, '\\u003c')}</script>`;
}
function cardFor(cls) { const r = state.role, m = { CEO: { competitor: 'SHARE', market: 'SHARE', opportunity: 'OSG', supply: 'OSG', loading: 'FCF', cost: 'OM', buying: 'OM', volume: 'OSG' }, CFO: { cost: 'GM', buying: 'GM', loading: 'FCF', supply: 'OSG', market: 'OSG', competitor: 'OSG', opportunity: 'OSG', volume: 'OSG' }, CMO: { competitor: 'SHARE', market: 'SHARE', opportunity: 'ROMI', buying: 'ROMI', cost: 'OSGB', supply: 'OSGB', loading: 'OSGB', volume: 'OSGB' }, CSO: { loading: 'CHINV', supply: 'SALES', competitor: 'SALES', buying: 'TRADE', cost: 'TRADE', market: 'SALES', opportunity: 'SALES', volume: 'SALES' }, COO: { supply: 'OTIF', cost: 'COGS', loading: 'INVD', buying: 'COGS', competitor: 'OTIF', market: 'OTIF', opportunity: 'INVD', volume: 'OTIF' } }; return (m[r] || {})[cls] || ROLE_CARDS[r][0]; }

/* ---------- panel content per card ---------- */
const PANEL = {
  OSG: () => band('C1'), OSGB: () => band('C1'), OM: () => openTile('Sh3'), GM: () => openCFO('F1'), ROMI: () => band('M2'), TRADE: () => openCFO('F2'), COGS: () => band('O3'),
  SHARE: () => state.role === 'CMO' ? band('M1') : openTile('Sh6'), EPS: () => openCFO('F6'), DIST: () => band('S2'), QUAL: () => band('O5'), SALES: () => band('S1'), CHINV: () => band('S4'), OTIF: () => band('O2'), INVD: () => band('O1'),
  FCF: () => { const P = win(), w1 = Math.min(P.wa, 39), w0 = Math.min(P.w0, w1), A = cash('A', w0, w1), T = cash('T', w0, w1);
    const br = { start: T.fcf, end: A.fcf, items: [['Operating profit', A.op - T.op, 'op'], ['Depreciation', A.da - T.da, 'da'], ['Tax', -(A.tax - T.tax), 'tax'], ['Capex', -(A.capex - T.capex), 'capex'], ['Working capital', -(A.wc - T.wc), 'wc']] };
    const inv = warehouseData({}), chan = channelStock({}).slice(0, 4);
    openLevel({ crumb: 'Free cash flow', title: `Free cash flow is ${fmt$(Math.abs(A.fcf - T.fcf))} ${A.fcf < T.fcf ? 'below' : 'above'} plan, mostly because India distributors are holding more of our stock on credit.`, blocks: [
      { h: `Cash is ${fmt$(Math.abs(A.fcf - T.fcf))} ${A.fcf < T.fcf ? 'short' : 'ahead'} of plan`, sub: 'Free cash flow, plan → actual · company · Jan–Sep', id: 'b-wf', src: 'ERP · books closed to Sep' },
      { h: `${(A.conv * 100).toFixed(0)}% of profit turned into cash, vs a 90% target`, sub: 'Cash conversion and its drivers', html: stats([['Free cash flow', fmt$(A.fcf), 'plan ' + fmt$(T.fcf)], ['Cash conversion', (A.conv * 100).toFixed(0) + '%', 'target 90%'], ['Capex', fmt$(A.capex), 'plan ' + fmt$(T.capex)], ['Working capital build', fmt$(A.wc), 'plan ' + fmt$(T.wc)]]), src: 'ERP' },
      { h: 'Where cash is tied up', sub: 'Channel stock on credit and our own inventory', html: `<div class="tbl-wrap"><table class="t"><thead><tr><th>Where</th><th class="r">Now</th><th class="r">Normal</th></tr></thead><tbody>${chan.map(r => `<tr class="click" tabindex="0" data-slice='${JSON.stringify(r.slice)}'><td>${esc(r.label)} (distributors)</td><td class="r num">${r.cover.toFixed(1)} wks</td><td class="r num">${r.normal} wks</td></tr>`).join('')}${inv.map(w => `<tr><td>${esc(w.name)} (our warehouse)</td><td class="r num">${w.days.toFixed(0)} days</td><td class="r num">${K.INV_TARGET_DAYS} days</td></tr>`).join('')}</tbody></table></div>`, src: 'Distributor system · Supply planner' }],
      after: () => waterfall($('#b-wf'), br, { startLabel: 'Plan', fmt: fmt$, sfmt: v => (v >= 0 ? '+' : MINUS) + fmt$(Math.abs(v)) }) }, true); },
  PEN: () => { const f = filter(), rows = []; for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const p = K.PENETRATION[b + '|' + c]; if (p) rows.push({ label: K.BMAP[b].name + ' · ' + K.CMAP[c].name, now: p[1], ly: p[0], chg: p[1] - p[0] }); }
    rows.sort((a, b) => a.chg - b.chg); const sw = K.SWITCHING.filter(s => !f.c || f.c.map(c => K.CMAP[c].name).includes(s.where));
    openLevel({ crumb: 'Household penetration', title: [rows[0].chg < 0 ? `${rows[0].label} lost the most buyers ${sPts(rows[0].chg)}.` : `No brand is losing buyers here.`, rows.length > 1 && rows[rows.length - 1].chg > 0 ? `${rows[rows.length - 1].label} gained the most ${sPts(rows[rows.length - 1].chg)}.` : ''].join(' ').trim(), blocks: [
      { h: 'Who is gaining and losing buyers', sub: '% of households buying in the last 52 weeks · change vs last year, pts', html: divBars(rows.slice(0, 4).concat(rows.slice(-4)).map(r => ({ label: r.label, v: r.chg })), v => sPts(v).replace(' pts', '')), src: 'Consumer panel · to Sep' },
      { h: 'Where lost buyers went', sub: 'Buyers switching to competitors · millions of households', html: `<div class="tbl-wrap"><table class="t"><thead><tr><th>From</th><th>To</th><th>Where</th><th class="r">Buyers</th><th>Why (likely)</th></tr></thead><tbody>${sw.map(s => `<tr><td>${esc(s.from)}</td><td>${esc(s.to)}</td><td>${esc(s.where)}</td><td class="r num">${s.buyers}M</td><td>${esc(s.note)}</td></tr>`).join('')}</tbody></table></div>`, src: 'Consumer panel' }] }, true); },
};
// RGM checks: one analysis from the RGM tool, shown in place
const RGM = {
  SHARE: { label: 'Re-check price & promo plan', scope: 'Bolt Brew Coffee · UK · Convenience', title: 'Bolt Brew UK: which promotion wins back share at a profit?', chip: 'From RGM tool · scenario run 14 Oct 2026', rows: [['Price-marked pack £1.19 (current)', '+0.2 pts', '0.50x', '−£0.4M', 'crit'], ['Deeper 25% price cut', '+1.1 pts', '0.62x', '−£1.1M', 'crit'], ['2 for £2.20 multibuy (recommended)', '+0.8 pts', '1.35x', '+£0.6M', 'good'], ['Hold price, +visibility only', '+0.3 pts', '1.10x', '+£0.1M', 'warn']], cols: ['Option', 'Share won back', 'Promo ROI', 'Margin effect'], head: 'Volt Coffee is 12% cheaper, so Bolt Brew now costs 14% more. The current price-marked pack loses money; a 2-for-£2.20 multibuy wins back most of the share at a profit.' },
  SALES: { label: 'Re-check promo plan', scope: 'Orchard Juice · FreshMart · Indonesia', title: 'FreshMart juice bundle: run now, move it, or shrink it?', chip: 'From RGM tool + supply planner · run 14 Oct 2026', rows: [['Run as planned, Wk 43–46', '$0.9M', '55% stock ready', 'OTIF breach risk', 'crit'], ['Move to Wk 47–50 (recommended)', '$1.3M', '95% stock ready', 'Contract kept', 'good'], ['Halve the volume, keep dates', '$0.6M', '90% stock ready', 'Contract kept', 'warn']], cols: ['Option', 'Sales delivered', 'Stock', 'Delivery contract'], head: 'Only 55% of the bundle stock is ready and Orchard Juice supply stays near 85% until week 44. Moving the bundle to weeks 47–50 sells about $0.4M more and keeps FreshMart above its 95% delivery contract.' },
  TRADE: { label: 'Review promo results', scope: 'Crunch Chips · BigBox · USA', title: 'Crunch Chips at BigBox: where did the Buy-2-get-1 money go?', chip: 'From RGM tool · post-event analysis', rows: [['Extra sales margin before checks', '$8.1M', '', '', 'good'], ['Our own sales moving into the deal', '−$2.7M', '', '', 'crit'], ['Shoppers stocking up (sales borrowed from later)', '−$1.4M', '', '', 'crit'], ['Real extra margin', '$5.4M', 'on $9.8M spend', 'ROI 0.55x', 'crit']], cols: ['Step', 'Margin', '', ''], head: 'Sales beat plan, but a third of the extra margin was our own sales moving into the deal. Each $1 of promotion returned $0.55. Recommended: replace with a multibuy at 20% depth.' },
  GM: { label: 'Review promo results', alias: 'TRADE' },
};
// why the RGM tool recommends what it does: the rule, the evidence, and what has to hold true
const RGM_WHY = {
  SHARE: { pick: 'the 2-for-£2.20 multibuy', rule: 'Pick the option that wins back the most share while each £1 of promotion returns more than £1 and margin goes up, not down.',
    why: [['It closes the gap where shoppers notice it', 'At 2 for £2.20 each can costs £1.10, level with Volt Coffee’s £1.09 shelf price, without cutting our single-can price. That protects price realization in the other channels.'],
      ['It wins most of the share back, profitably', '+0.8 pts is three quarters of what a deeper cut would win back, but each £1 returns £1.35 and margin improves by about £0.6M.'],
      ['The deeper 25% cut buys share at a loss', 'It wins +1.1 pts but returns 0.62x and costs about £1.1M of margin, and Volt can match a price cut within weeks.'],
      ['It fits how the lost buyers shop', 'The consumer panel shows the 0.9M switchers are convenience shoppers buying 2+ cans a week, which is exactly what a multibuy rewards.'],
      ['Multibuys have paid back here before', 'Sunrise Oats 2 for £5 at GreenGrocer returned 1.21x this year. The current price-marked pack returns 0.50x, the worst option.']],
    check: ['Volt does not cut its price again in the next 8 weeks', 'CornerShop and the other convenience chains accept the multibuy mechanic (UK Sales Director to confirm by 30 Oct)', 'The expected volume uplift (about +18%) fits plant and warehouse capacity (Leeds plant at 74%)', 'Funded by stopping the price-marked pack, so total trade spend stays on plan'] },
  SALES: { pick: 'moving the bundle to Wk 47–50', rule: 'Pick the option that delivers the most sales without breaching a delivery contract.',
    why: [['Stock decides it', 'Only 55% of the bundle stock is ready for Wk 43–46, against 95% by Wk 47.'], ['Running now risks a fine and a breach', 'FreshMart’s contract requires 95% on-time-in-full; a half-stocked promotion would push it further below.'], ['Moving it sells more', 'About $1.3M of sales vs $0.9M if run now, because the promotion runs fully stocked.']],
    check: ['FreshMart agrees the new dates', 'Juice supply recovers from Wk 44 as the supplier has confirmed'] },
  TRADE: { pick: 'replacing Buy-2-get-1 with a 20% multibuy', rule: 'Repeat promotions that return at least £1 per £1; fix or stop the rest.',
    why: [['The headline lift was misleading', 'Sales beat plan, but a third of the extra margin was our own sales moving into the deal, and shoppers stocked up early.'], ['Real return is 0.55x', 'After those effects, $9.8M of spend earned $5.4M of extra margin.'], ['A shallower multibuy keeps most of the volume', 'Past 20% events at BigBox kept about 80% of the lift at half the cost.']],
    check: ['BigBox accepts the change in its joint business plan', 'No competitor runs a deeper deal in the same weeks'] },
};
RGM_WHY.GM = RGM_WHY.TRADE;
function rgmWhyBlock(key) {
  const w = RGM_WHY[key] || RGM_WHY[(RGM[key] || {}).alias]; if (!w) return null;
  return { h: `Why the RGM tool recommends ${w.pick}`, sub: w.rule, wide: true, html: `<div class="why-grid"><ol class="why">${w.why.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ol><div class="why-check"><h4>What has to hold true</h4><ul>${w.check.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div></div>`, src: 'RGM tool · consumer panel · post-event analysis (illustrative)' };
}
function openRgm(key) {
  const r = RGM[key].alias ? RGM[RGM[key].alias] : RGM[key];
  openLevel({ crumb: 'RGM check', title: r.head, rgm: true, blocks: [{ h: r.title, sub: r.chip + ' · illustrative', html: `<div class="tbl-wrap"><table class="t rgm"><thead><tr>${r.cols.map((c, i) => `<th class="${i ? 'r' : ''}">${c}</th>`).join('')}</tr></thead><tbody>${r.rows.map(x => `<tr class="${x[4] === 'good' && /recommended|Real/.test(x[0]) ? 'rec' : ''}"><td>${esc(x[0])}</td>${x.slice(1, 4).map(v => `<td class="r num">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="rgm-act"><button class="btn primary" data-rgm-action="${key}">Create action from this</button><button class="btn" aria-disabled="true" title="Prototype only: opens the RGM tool">Open in RGM tool ↗</button></div>`, src: 'RGM tool (illustrative)' }].concat(rgmWhyBlock(key) || []) });
}

/* ---------- panel helpers ---------- */
// add blocks to the level that was just opened (used to extend a shared panel for one role)
function extendTop(o) {
  const lv = drill.stack[drill.stack.length - 1]; if (!lv) return;
  if (o.drop) lv.blocks = lv.blocks.filter(b => !o.drop.test(b.h || ''));
  if (o.pre) lv.blocks = o.pre.concat(lv.blocks);
  if (o.post) lv.blocks = lv.blocks.concat(o.post);
  if (o.insight) lv.insight = o.insight;
  if (o.after) { const a0 = lv.after; lv.after = () => { a0 && a0(); o.after(); }; }
  paintBand();
}
const tbl = (head, rows, foot) => `<div class="tbl-wrap"><table class="t"><thead><tr>${head.map((h, i) => `<th class="${i && !/^</.test(h) ? 'r' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>${foot ? `<p class="foot">${foot}</p>` : ''}`;
const sliceAttr = s => `class="click" tabindex="0" data-slice='${JSON.stringify(s)}'`;
const vsPlan = (a, p, fmtv, good = 1) => `${fmtv(a)} <span class="muted">vs ${fmtv(p)}</span> ${sevPill((a - p) * good >= 0 ? 'good' : (a - p) * good >= -Math.abs(p) * .1 ? 'warn' : 'crit')}`;

/* ---------- below gross margin: A&P and overheads (CFO EPS panel, CEO operating margin panel) ---------- */
function belowGM() {
  const P = win(), w1 = P.w1 > CW ? NW : P.w1, a = K.finance({}, 'A', P.w0, w1), c = state.comp === 'M' ? K.finance({}, 'A', Math.max(1, P.w0 - 4), Math.max(1, P.wa - 4)) : K.finance({}, state.comp, P.w0, w1);
  return { h: 'Below gross margin: A&P, distribution and overheads', sub: `Company · ${P.label} ${compShort()}`, html: stats([['A&P spend', fmt$(a.ap), dv(vr(a.ap, c.ap), 'pct', -1, compShort())], ['A&P % net sales', pct1(a.ap / a.ns), `${compLab().toLowerCase()} ${pct1(c.ap / c.ns)}`], ['Distribution per case', '$' + (a.dist / a.vol).toFixed(2), dv(vr(a.dist / a.vol, c.dist / c.vol), 'pct', -1, compShort())], ['Overheads', fmt$(a.overhead), dv(vr(a.overhead, c.overhead), 'pct', -1, compShort())]]), src: 'ERP · FP&A plan' };
}
const RISKS_OPPS = [
  ['Risk', 'Oat costs stay (+18%) through Q4 as the hedge rolls off', -.03, 'Medium', 'COO'],
  ['Risk', 'India distributors destock more than planned', -.02, 'High', 'CSO'],
  ['Risk', 'Indonesia juice supply recovery slips past Wk 44', -.01, 'Medium', 'COO'],
  ['Opportunity', 'Overhead freeze extended through Q4', .02, 'High', 'CFO'],
  ['Opportunity', 'Diwali Glow digital campaign keeps running ahead of plan', .02, 'Medium', 'CMO'],
  ['Opportunity', 'UK multibuy replaces the price-marked pack (RGM check)', .01, 'Medium', 'CMO'],
];
function riskOppBlock() {
  const e = K.finance({}, 'A', 1, NW).eps, risk = RISKS_OPPS.filter(r => r[2] < 0).reduce((x, r) => x + r[2], 0), opp = RISKS_OPPS.filter(r => r[2] > 0).reduce((x, r) => x + r[2], 0), g = K.FIN.guidance.eps;
  return { h: `Outlook range $${(e + risk).toFixed(2)}–$${(e + opp).toFixed(2)} vs guidance $${g[0].toFixed(2)}–$${g[1].toFixed(2)}`, sub: 'Risks and opportunities not in the outlook · EPS impact', wide: true,
    html: tbl(['Type', '<span>What</span>', 'EPS impact', 'Likelihood', 'Owner'], RISKS_OPPS.map(r => `<tr><td>${r[0] === 'Risk' ? '<span class="pill sev crit">Risk</span>' : '<span class="pill sev good">Opportunity</span>'}</td><td>${esc(r[1])}</td><td class="r num">${dv(r[2], 'eps', 1)}</td><td class="r">${r[3]}</td><td class="r">${r[4]}</td></tr>`), 'Even if every opportunity lands, the outlook only reaches the bottom of guidance.'), src: 'FP&A · risk & opportunity register' };
}

/* ---------- CFO: gross-to-net ---------- */
function g2nBlocks(f, P) {
  const A = agg(f, 'A', P.w0, P.w1), C = compAgg(f, P), L_ = compLab();
  const br = { start: A.gs, end: A.ns - A.cogs, items: [['Trade spend', -A.tr, 'tr'], ['Returns', -A.ret, 'ret'], ['Net sales', 0, 'ns', 'sub'], ['Cost of goods', -A.cogs, 'cogs']] };
  const r = (l, a, c, rate, rc, good) => `<tr><td>${l}</td><td class="r num">${fmt$(a)}</td><td class="r num">${fmt$(c)}</td><td class="r num">${dv(a - c, '$', good)}</td><td class="r num">${rate == null ? '' : pct1(rate)}</td><td class="r num">${rate == null ? '' : dv((rate - rc) * 1e4, 'bps', good)}</td></tr>`;
  return [{ h: 'Gross-to-net walk: where each $1 of gross sales goes', sub: `${nameOf(f)} · ${P.label} · actual`, id: 'b-g2n', src: 'ERP · trade accrued' },
    { h: `Gross-to-net ${compShort()}`, sub: 'Rates: trade and returns as % of gross sales; cost of goods and margin as % of net sales', html: tbl(['Line', 'Actual', L_, 'Variance', 'Rate', 'Rate change'], [r('Gross sales', A.gs, C.gs, null, null, 1), r('Trade spend', A.tr, C.tr, A.tr / A.gs, C.tr / C.gs, -1), r('Returns', A.ret, C.ret, A.ret / A.gs, C.ret / C.gs, -1), r('<b>Net sales</b>', A.ns, C.ns, null, null, 1), r('Cost of goods', A.cogs, C.cogs, A.cogs / A.ns, C.cogs / C.ns, -1), r('<b>Gross margin</b>', A.ns - A.cogs, C.ns - C.cogs, (A.ns - A.cogs) / A.ns, (C.ns - C.cogs) / C.ns, 1)], 'Trade spend is accrued at agreed rates; deductions are settled with a lag of about 6 weeks.'), src: 'ERP · trade accrued' }];
}

/* ---------- CMO: shopper sales, A&P, buyers ---------- */
function openSSG() {
  const f = filter(), P = win(), s = shopper(f, P.w0, P.wa), cs = countriesOf(f).filter(c => has(sub(f, { c: [c] }))), bs = brandsOf(f).filter(b => has(sub(f, { b: [b] })));
  const cell = (b, c) => { const ff = sub(f, { b: [b], c: [c] }); if (!has(ff)) return '<td class="hm na">—</td>'; const x = shopper(ff, P.w0, P.wa), d = (x.g - x.cat) * 100, lv = d >= 2 ? 'g2' : d >= 0 ? 'g1' : d >= -2 ? 'r1' : 'r2'; return `<td class="hm ${lv}" ${sliceAttr(ff)} title="Shopper sales ${sPct(x.g)} vs category ${sPct(x.cat)}"><b>${sPts(d).replace(' pts', '')}</b><small>${sPct(x.g)}</small></td>`; };
  const grid = `<div class="tbl-wrap"><table class="t hmap"><thead><tr><th>Brand</th>${cs.map(c => `<th class="r">${K.CMAP[c].name}</th>`).join('')}</tr></thead><tbody>${bs.map(b => `<tr><td>${K.BMAP[b].name}</td>${cs.map(c => cell(b, c)).join('')}</tr>`).join('')}</tbody></table></div><p class="foot">Each cell: shopper sales growth minus category growth (pts), with shopper sales growth below. Click a cell to open that brand and market.</p>`;
  const rows = bs.map(b => { const x = shopper(sub(f, { b: [b] }), P.w0, P.wa); return { b, ...x }; }).sort((a, b) => (a.g - a.cat) - (b.g - b.cat));
  const sb = tbl(['Brand', 'Shopper sales', 'Category', 'Shipments', 'Shipments − shopper'], rows.map(r => `<tr ${sliceAttr(sub(f, { b: [r.b] }))}><td>${K.BMAP[r.b].name}</td><td class="r num">${sPct(r.g)}</td><td class="r num">${sPct(r.cat)}</td><td class="r num">${sPct(r.ship)}</td><td class="r num">${dv((r.ship - r.g) * 100, 'pts', 0)} <span class="muted">${r.ship - r.g > .01 ? 'stock building' : r.ship - r.g < -.01 ? 'destocking' : ''}</span></td></tr>`), 'Net sales (shipments) and shopper sales differ by the change in stock held by retailers and distributors. Shipments well ahead of shoppers usually reverse later.');
  const ln = K.LAUNCHES.filter(l => (!f.b || f.b.includes(l.b)) && (!f.c || f.c.includes(l.c)));
  const lt = tbl(['Launch', 'Market', 'Weeks live', 'Distribution', 'Trial (% households)', 'Repeat', 'Sales'], ln.map(l => `<tr><td>${esc(l.name)}</td><td class="r">${K.CMAP[l.c].name}</td><td class="r num">${CW - l.w}</td><td class="r num">${vsPlan(l.dist * 100, l.distPlan * 100, v => v.toFixed(0) + '%')}</td><td class="r num">${vsPlan(l.trial, l.trialPlan, v => v.toFixed(1) + '%')}</td><td class="r num">${vsPlan(l.repeat * 100, l.repeatPlan * 100, v => v.toFixed(0) + '%')}</td><td class="r num">${vsPlan(l.sales, l.salesPlan, fmt$)}</td></tr>`), 'Repeat below plan with trial on plan means people tried it and did not come back: a product or price problem, not awareness.');
  const inn = K.INNOVATION, worstL = ln.slice().sort((a, b) => a.repeat / a.repeatPlan - b.repeat / b.repeatPlan)[0];
  openLevel({ crumb: 'Shopper sales', title: 'Shopper sales vs category', insight: `Shoppers bought ${sPct(s.g)} vs last year, against category growth of ${sPct(s.cat)}; shipments are ${sPct(s.ship)}, so ${s.ship > s.g ? 'stock is building in the channel' : 'the channel is destocking'}.${worstL ? ` ${worstL.name} is not getting repeat buyers (${(worstL.repeat * 100).toFixed(0)}% vs ${(worstL.repeatPlan * 100).toFixed(0)}% plan).` : ''}`,
    blocks: [{ h: 'Where we beat or trail the category', sub: `Shopper sales growth minus category growth · ${P.label}`, html: grid, wide: true, src: 'Retailer POS · market data to 20 Sep' }, { h: 'Shopper sales vs shipments, by brand', html: sb, src: 'Retailer POS · ERP' },
      { h: 'Launches: are they building?', sub: 'Actual vs launch plan', html: lt, src: 'Consumer panel · retail audit' }, { h: `Sales from launches: ${pct1(inn.share)} vs ${pct1(inn.target)} target`, sub: 'Share of net sales from products launched in the last 3 years', html: stats([['Innovation share of sales', pct1(inn.share), `target ${pct1(inn.target)}`], ['Last year', pct1(inn.ly), dv((inn.share - inn.ly) * 100, 'pts', 1, 'vs last year')], ['Live launches', String(K.LAUNCHES.length), `${K.LAUNCHES.filter(l => l.sales >= l.salesPlan).length} on or above plan`]]), src: 'ERP' }] }, true);
}
function apMoves(f) {   // shift part of the remaining TV budget to digital where digital earns more
  const out = [];
  for (const b of brandsOf(f)) for (const c of countriesOf(f)) { let tv = 0, rom = 0, n = 0; for (const s of K.SERIES) if (s.b === b && s.c === c && (!f.ch || f.ch.includes(s.ch))) { for (let w = CW + 1; w <= NW; w++) tv += s.T.apTv[w]; rom += s.romi; n++; } if (!n || tv < 2e5) continue;
    const r = rom / n, gain = tv * .3 * r * (K.MEDIA_ROMI.Digital - K.MEDIA_ROMI.TV); out.push({ b, c, amt: tv * .3, rTv: r * K.MEDIA_ROMI.TV, rDig: r * K.MEDIA_ROMI.Digital, gain }); }
  return out.sort((a, b) => b.gain - a.gain).slice(0, 4);
}
function openAP() {
  const f = filter(), P = win(), A = agg(f, 'A', P.w0, P.w1), C = compAgg(f, P), T = agg(f, 'T', P.w0, P.w1), r = A.inc / A.ap, rp = T.inc / T.ap;
  const ca = new Float64Array(NW + 1), cb = new Float64Array(NW + 1); let sa = 0, sb_ = 0; for (let w = 1; w <= NW; w++) { sa += agg(f, 'A', w, w).ap; sb_ += agg(f, 'T', w, w).ap; ca[w] = sa; cb[w] = sb_; }
  const byB = brandsOf(f).filter(b => has(sub(f, { b: [b] }))).map(b => { const ff = sub(f, { b: [b] }), a = agg(ff, 'A', P.w0, P.w1), t = agg(ff, 'T', P.w0, P.w1); return { b, ff, ap: a.ap, apT: t.ap, r: a.inc / a.ap, rp: t.inc / t.ap }; }).sort((x, y) => y.r - x.r);
  const media = [['TV', 'apTv'], ['Digital', 'apDig'], ['Other', 'apOth']].map(([m, k]) => ({ m, spend: A[k], r: r * K.MEDIA_ROMI[m] }));
  const live = K.CAMPAIGNS.filter(c => (!f.c || f.c.includes(c.c)) && (!f.b || f.b.includes(c.b)) && c.w1 >= CW - 3);
  const mv = apMoves(f), mvGain = mv.reduce((x, m) => x + m.gain, 0);
  openLevel({ crumb: 'A&P spend & return', title: 'A&P spend & return', insight: `A&P ${fmt$(A.ap)} ${sPct(vr(A.ap, C.ap))} ${state.comp === 'T' ? 'vs budget' : compShort()}; each $1 returns ${r.toFixed(2)}x (model, Q2) vs ${rp.toFixed(2)}x plan.${mv.length ? ` Moving ${fmt$(mv.reduce((x, m) => x + m.amt, 0))} of remaining TV budget to digital would add about ${fmt$(mvGain)} of gross margin.` : ''}`,
    blocks: [{ h: 'A&P phasing: spend vs budget, cumulative', sub: `${nameOf(f)} · actual to Wk ${CW}, then committed plan`, id: 'b-ap', html: '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>Actual + committed</span><span><i class="dash"></i>Budget</span></div>', wide: true, src: 'ERP · media agency plan' },
      { h: 'Return by brand', sub: 'Extra gross margin per $1 of A&P · marketing mix model, Q2', html: tbl(['Brand', 'Spend', state.comp === 'T' ? 'vs budget' : compShort(), 'Return', 'Plan'], byB.map(x => `<tr ${sliceAttr(x.ff)}><td>${K.BMAP[x.b].name}</td><td class="r num">${fmt$(x.ap)}</td><td class="r num">${dv(vr(x.ap, x.apT), 'pct', 0)}</td><td class="r num"><b>${x.r.toFixed(2)}x</b></td><td class="r num">${x.rp.toFixed(2)}x</td></tr>`)), src: 'Marketing mix model · Q2' },
      { h: 'Return by media', html: tbl(['Media', 'Spend', 'Share', 'Return'], media.map(m => `<tr><td>${m.m}</td><td class="r num">${fmt$(m.spend)}</td><td class="r num">${pct1(m.spend / A.ap)}</td><td class="r num"><b>${m.r.toFixed(2)}x</b></td></tr>`)), src: 'Marketing mix model · Q2' },
      { h: 'Live campaigns · last 4 weeks', sub: 'Sales lift vs plan (campaign tracking, weekly)', html: live.length ? tbl(['Campaign', 'Market', 'Media', 'Spend', 'Lift vs plan'], live.map(c => `<tr><td>${esc(c.name)}</td><td class="r">${K.CMAP[c.c].name}</td><td class="r">${c.media}</td><td class="r num">${fmt$(c.spend)}</td><td class="r num">${vsPlan(c.lift * 100, c.planLift * 100, v => (v >= 0 ? '+' : MINUS) + Math.abs(v).toFixed(0) + '%')}</td></tr>`)) : '<p class="muted">No live campaigns in this selection.</p>', src: 'Campaign tracking' },
      { h: mv.length ? `Where to move money: about ${fmt$(mvGain)} more gross margin` : 'Where to move money', sub: 'Shift 30% of the remaining TV budget to digital where digital earns more per $1', html: mv.length ? tbl(['Brand · market', 'Move', 'TV return', 'Digital return', 'Extra margin'], mv.map(m => `<tr ${sliceAttr({ b: [m.b], c: [m.c] })}><td>${K.BMAP[m.b].name} · ${K.CMAP[m.c].name}</td><td class="r num">${fmt$(m.amt)}</td><td class="r num">${m.rTv.toFixed(2)}x</td><td class="r num">${m.rDig.toFixed(2)}x</td><td class="r num">${dv(m.gain, '$', 1)}</td></tr>`), 'Estimates from the marketing mix model; check reach goals with the agency before moving TV money.') : '<p class="muted">No TV budget left to move in this selection.</p>', src: 'Marketing mix model' }],
    after: () => lineChart($('#b-ap'), { x0: 1, x1: NW, h: 180, zero: true, today: CW + .5, yfmt: fmt$, series: [{ vals: cb, from: 1, to: NW, color: '#7b828b', w: 1.5, dash: '5 3' }, { vals: ca, from: 1, to: CW, color: 'var(--s1)', end: true }, { vals: ca, from: CW, to: NW, color: 'var(--s1)', dash: '4 3' }], tip: w => `<div class="th">Wk ${w}</div>${trow(w > CW ? 'Committed' : 'Actual', fmt$(ca[w]))}${trow('Budget', fmt$(cb[w]) + ' ' + sPct(vr(ca[w], cb[w])))}` }) }, true);
}
function openPENF() {
  const f = filter(), bz = buyers(f), rows = bz.rows.slice().sort((a, b) => a.dp - b.dp), lose = rows[0], less = rows.filter(r => r.why === 'Buying less often').sort((a, b) => a.df - b.df)[0];
  const pill = w => `<span class="pill sev ${w === 'Losing buyers' || w === 'Both' ? 'crit' : w === 'Buying less often' ? 'warn' : 'good'}">${w}</span>`;
  const sw = K.SWITCHING.filter(s => !f.c || f.c.map(c => K.CMAP[c].name).includes(s.where));
  openLevel({ crumb: 'Buyers & frequency', title: 'Buyers & frequency', insight: [lose && lose.dp < -.3 ? `${lose.label} lost the most buyers ${sPts(lose.dp)} while frequency held: a brand problem.` : 'No brand is losing buyers here.', less ? `${less.label} buyers are buying less often ${sPct(less.df)}: a price or occasion problem.` : ''].join(' ').trim(),
    blocks: [{ h: 'Losing buyers or buying less often?', sub: 'Penetration (% of households, 52 weeks) and trips per buyer per year, vs last year', wide: true, html: tbl(['Brand · market', 'Penetration', 'Change', 'Frequency', 'Change', 'Repeat', '<span>Diagnosis</span>'], rows.map(r => `<tr ${sliceAttr(r.slice)}><td>${esc(r.label)}</td><td class="r num">${r.pen.toFixed(1)}%</td><td class="r num">${dv(r.dp, 'pts', 1)}</td><td class="r num">${r.freq.toFixed(1)}</td><td class="r num">${dv(r.df, 'pct', 1)}</td><td class="r num">${(r.rep * 100).toFixed(0)}%</td><td>${pill(r.why)}</td></tr>`), 'Losing buyers: fix the brand (relevance, competitor, availability). Buying less often: look at price, pack size and occasions.'), src: 'Consumer panel · 52 wks to Sep' },
      { h: 'Where lost buyers went', sub: 'Buyers switching to competitors · millions of households', html: sw.length ? tbl(['From', 'To', 'Where', 'Buyers', '<span>Why (likely)</span>'], sw.map(s => `<tr><td>${esc(s.from)}</td><td class="r">${esc(s.to)}</td><td class="r">${esc(s.where)}</td><td class="r num">${s.buyers}M</td><td>${esc(s.note)}</td></tr>`)) : '<p class="muted">No significant switching in this selection.</p>', src: 'Consumer panel' }] }, true);
}
function shareExtras(f) {
  const sov = Object.entries(K.SOV).filter(([k]) => { const [b, c] = k.split('|'); return (!f.b || f.b.includes(b)) && (!f.c || f.c.includes(c)); }).map(([k, v]) => { const [b, c] = k.split('|'); return { b, c, sov: v[0], som: v[1], gap: v[0] - v[1] }; }).sort((a, b) => a.gap - b.gap);
  const bh = Object.entries(K.BRAND_HEALTH).filter(([k]) => { const [b, c] = k.split('|'); return (!f.b || f.b.includes(b)) && (!f.c || f.c.includes(c)); }).map(([k, v]) => { const [b, c] = k.split('|'); return { b, c, v }; }).sort((a, b) => (a.v[1][1] - a.v[1][0]) - (b.v[1][1] - b.v[1][0])).slice(0, 8);
  const hc = (pair) => { const d = pair[1] - pair[0], sig = Math.abs(d) >= 2; return `${pair[1].toFixed(0)}% <span class="dv ${d >= 0 ? 'fav' : 'unf'}">${d >= 0 ? '▲' : '▼'} (${d >= 0 ? '+' : MINUS}${Math.abs(d).toFixed(1)})</span>${sig ? '<sup class="sig" title="Statistically significant (n≈1,000)">sig</sup>' : ''}`; };
  return [{ h: 'Share of voice vs share of market', sub: 'Brands spending below their share tend to lose it · last 13 weeks', html: sov.length ? tbl(['Brand · market', 'Share of voice', 'Share of market', 'Gap', '<span>Read</span>'], sov.map(r => `<tr><td>${K.BMAP[r.b].name} · ${K.CMAP[r.c].name}</td><td class="r num">${r.sov.toFixed(1)}%</td><td class="r num">${r.som.toFixed(1)}%</td><td class="r num">${dv(r.gap, 'pts', 1)}</td><td>${r.gap < -2 ? 'Under-spending vs share' : r.gap > 2 ? 'Investing ahead of share' : 'In line'}</td></tr>`)) : '<p class="muted">No media data for this selection.</p>', src: 'Media monitoring · market data' },
    { h: 'Brand health: biggest moves in consideration', sub: '% of category buyers, now vs last year · monthly tracker, n≈1,000 per market', html: tbl(['Brand · market', 'Awareness', 'Consideration', 'Preference'], bh.map(r => `<tr ${sliceAttr({ b: [r.b], c: [r.c] })}><td>${K.BMAP[r.b].name} · ${K.CMAP[r.c].name}</td><td class="r num">${hc(r.v[0])}</td><td class="r num">${hc(r.v[1])}</td><td class="r num">${hc(r.v[2])}</td></tr>`), '“sig” marks a change of 2 pts or more, which is statistically significant at this sample size.'), src: 'Brand tracker · Sep' }];
}

/* ---------- COO: safety & quality, 13-week supply risk, cost extras ---------- */
function openSAFQ() {
  const s = K.SAFETY, q = K.QUALITY, f = filter(), sup = K.SUPPLIERS;
  const cpl = new Float64Array(NW + 1), tgt = new Float64Array(NW + 1); for (let w = 1; w <= CW; w++) { cpl[w] = K.COMPLAINTS[w]; tgt[w] = q.cpmuTarget; }
  const months = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  openLevel({ crumb: 'Safety & quality', title: 'Safety & quality', insight: `Injury rate ${s.ltifr.toFixed(2)} per million hours vs ${s.target.toFixed(2)} target, down from ${s.ly.toFixed(2)} last year. One lost-time injury this quarter at ${s.incidents[0].site}. Complaints ${q.cpmu} per million units, below target; no recalls. Two suppliers are high risk.`,
    blocks: [{ h: `Injury rate ${s.ltifr.toFixed(2)} vs ${s.target.toFixed(2)} target, improving for 12 months`, sub: 'Lost-time injuries per million hours, rolling 12 months', html: `<div class="mini-bars">${s.history.map((v, i) => `<span style="--h:${(v / .6 * 100).toFixed(0)}%" class="${v > s.target ? 'over' : ''}" title="${months[i]}: ${v.toFixed(2)}"><i></i><em>${months[i]}</em></span>`).join('')}<b class="tline" style="--t:${(s.target / .6).toFixed(3)}" title="Target ${s.target.toFixed(2)}"></b></div>`, src: 'Safety system' },
      { h: 'Incidents this quarter', html: tbl(['Site', 'Incident', 'Week', '<span>Status</span>'], s.incidents.map(x => `<tr><td>${x.site}</td><td class="r">${x.type}</td><td class="r num">Wk ${x.w}</td><td>${x.status}</td></tr>`)), src: 'Safety system' },
      { h: `Complaints ${q.cpmu} per million units vs ${q.cpmuTarget} target`, sub: 'Weekly, per million units sold', id: 'b-cpl', html: '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>Complaints</span><span><i class="dash"></i>Target</span></div>', src: 'Quality system' },
      { h: 'Holds, recalls and regulatory cases', html: stats([['Quality holds', String(q.holds), 'open'], ['Recalls', String(q.recalls), 'this year'], ['Regulatory cases', String(q.openCases), 'open'], ['Audits passed', '11 of 11', 'this year']]), src: 'Quality system' },
      { h: 'Supplier delivery and risk', sub: 'On-time-in-full from suppliers, last 13 weeks', wide: true, html: tbl(['Supplier', 'Input', 'Delivery (OTIF)', 'Risk', '<span>Why</span>'], sup.map(x => `<tr><td>${x.name}</td><td class="r">${x.input}</td><td class="r num">${pct1(x.otif)}</td><td class="r"><span class="pill sev ${x.risk === 'High' ? 'crit' : x.risk === 'Medium' ? 'warn' : 'good'}">${x.risk}</span></td><td>${esc(x.note)}</td></tr>`)), src: 'Procurement system' }],
    after: () => lineChart($('#b-cpl'), { x0: Math.max(1, CW - 25), x1: CW, h: 160, yfmt: v => v.toFixed(1), series: [{ vals: tgt, from: Math.max(1, CW - 25), to: CW, color: '#7b828b', w: 1.5, dash: '5 3' }, { vals: cpl, from: Math.max(1, CW - 25), to: CW, color: 'var(--s1)', end: true }], tip: w => `<div class="th">Wk ${w}</div>${trow('Complaints per million', cpl[w].toFixed(2))}` }) }, true);
}
function openRISK() {
  const f = filter(), r = supplyRisk(f), weeks = Array.from({ length: RISK_H }, (_, i) => CW + 1 + i), cs = countriesOf(f).filter(c => has(sub(f, { c: [c] }))), near = r.filter(x => x.first < 4), later = r.filter(x => x.first >= 4);
  const heat = r.length ? `<div class="tbl-wrap"><table class="t heat"><thead><tr><th>Item · location</th>${weeks.map(w => `<th class="r">${wkLabel(w).replace(' ', '<br>')}</th>`).join('')}</tr></thead><tbody>${r.map(x => `<tr ${sliceAttr(x.slice)}><td>${esc(x.sku)}<small>${x.wh} · resupply ${x.lead} days</small></td>${x.wk.map(d => `<td class="hc ${d < x.lead ? 'out' : d < x.lead + 2 ? 'low' : ''}">${d < x.lead + 2 ? d.toFixed(0) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="foot">Numbers are projected days of cover, shown only when below the resupply time plus a 2-day buffer. Red: runs out before resupply can arrive. Includes recovery plans already confirmed.</p>` : '<p class="muted">No item runs short in the next 13 weeks.</p>';
  const fa = tbl(['Country', 'Forecast accuracy', 'Target', 'Bias', '<span>Read</span>'], cs.map(c => { const a = K.FORECAST_ACC[c], b = K.FORECAST_BIAS[c]; return `<tr><td>${K.CMAP[c].name}</td><td class="r num">${(a * 100).toFixed(0)}%</td><td class="r num">${(K.FORECAST_ACC.target * 100).toFixed(0)}%</td><td class="r num">${sgn(b, Math.abs(b * 100).toFixed(0) + '%')}</td><td>${b > .05 ? 'Forecasts too high: stock builds' : b < -.03 ? 'Forecasts too low: shortages' : 'No consistent bias'}</td></tr>`; }), 'Accuracy = 1 − weighted absolute error, at SKU × country level, 1-month lag. Bias: + means we forecast more than we sold.');
  const pl = tbl(['Plant', 'Makes', 'OEE', 'Utilisation now', 'Next 13 weeks'], K.PLANTS.filter(p => cs.includes(p.c)).map(p => `<tr><td>${p.name}</td><td class="r">${p.makes}</td><td class="r num">${vsPlan(p.oee * 100, p.oeeT * 100, v => v.toFixed(0) + '%')}</td><td class="r num">${(p.util * 100).toFixed(0)}%</td><td class="r num"><b class="${p.util13 > .95 ? 'neg-t' : ''}">${(p.util13 * 100).toFixed(0)}%</b>${p.util13 > .95 ? ' <span class="pill sev crit">Tight</span>' : p.util13 > .9 ? ' <span class="pill sev warn">Busy</span>' : ''}</td></tr>`), 'Above 95% planned utilisation there is no room for catch-up production.');
  const wh = warehouseData(f).map(w => { const ff = { b: f.b, c: [w.c] }, cogsDay = agg(ff, 'A', CW - 3, CW).cogs / 28 / K.WAREHOUSES.filter(x => x.c === w.c).length; return { ...w, val: cogsDay * w.days, exp: (K.NEAR_EXPIRY.own[w.c] || 0) / K.WAREHOUSES.filter(x => x.c === w.c).length }; });
  const sv = tbl(['Warehouse', 'Days of cover', 'Stock value', 'Near expiry (< 30 days)'], wh.map(w => `<tr><td>${w.name} · ${K.CMAP[w.c].name}</td><td class="r num">${w.days.toFixed(0)} <span class="muted">/ ${K.INV_TARGET_DAYS}</span></td><td class="r num">${fmt$(w.val)}</td><td class="r num">${w.exp ? fmt$(w.exp) : '—'}</td></tr>`), `Near-expiry stock held by distributors and stores: ${fmt$(Object.values(K.NEAR_EXPIRY.channel).reduce((x, y) => x + y, 0))} (mostly India general trade).`);
  const nw = later[0];
  openLevel({ crumb: 'Supply risk · 13 weeks', title: 'Supply risk · 13 weeks', insight: r.length === 0 ? `No item runs short in the next 13 weeks. ${(() => { const wc = cs.slice().sort((a, b) => K.FORECAST_BIAS[b] - K.FORECAST_BIAS[a])[0]; return wc && K.FORECAST_BIAS[wc] > .05 ? `${K.CMAP[wc].name} forecasts are ${(K.FORECAST_BIAS[wc] * 100).toFixed(0)}% too high.` : ''; })()}`.trim() : `${r.length} items will run short in the next 13 weeks: ${near.length} in the next 4 weeks${near.length ? ` (${[...new Set(near.map(x => K.BMAP[x.b].name + ' ' + K.CMAP[x.c].name))].join(', ')})` : ''}${nw ? `, and a new risk: ${K.BMAP[nw.b].name} ${K.CMAP[nw.c].name} from ${wkLabel(CW + 1 + nw.first)}` : ''}. ${(() => { const wc = cs.slice().sort((a, b) => K.FORECAST_BIAS[b] - K.FORECAST_BIAS[a])[0]; return wc && K.FORECAST_BIAS[wc] > .05 ? `${K.CMAP[wc].name} forecasts are ${(K.FORECAST_BIAS[wc] * 100).toFixed(0)}% too high.` : 'Forecasts show no consistent bias.'; })()}`,
    blocks: [{ h: 'Items running short, week by week', sub: `Projected days of cover · next 13 weeks to ${wkLabel(CW + RISK_H)}`, html: heat, wide: true, src: 'Supply planner' }, { h: 'Forecast accuracy and bias', html: fa, src: 'Demand planning' }, { h: 'Plant capacity', html: pl, src: 'Manufacturing system' }, { h: 'Stock cover, value and expiry', html: sv, wide: true, src: 'Supply planner · ERP' }] }, true);
}
function cogsExtras() {
  const sv = K.SAVINGS, tot = k => sv.reduce((x, s) => x + s[k], 0);
  return [{ h: `Savings ${fmt$(tot('done'))} delivered vs ${fmt$(tot('plan'))} plan to date`, sub: `Productivity programme · full-year target ${fmt$(tot('fy'))}`, wide: true, html: tbl(['Lever', 'FY target', 'Plan to date', 'Delivered', 'Gap', '<span>Why</span>'], sv.map(s => `<tr><td>${s.lever}</td><td class="r num">${fmt$(s.fy)}</td><td class="r num">${fmt$(s.plan)}</td><td class="r num"><b>${fmt$(s.done)}</b></td><td class="r num">${dv(s.done - s.plan, '$', 1)}</td><td>${esc(s.note)}</td></tr>`)), src: 'Productivity programme' },
    { h: 'Commodity prices vs budget and hedge cover', html: tbl(['Commodity', 'vs budget', 'Hedge cover'], K.COMMODITIES.map(x => `<tr><td>${x.name}</td><td class="r num">${dv(x.vsBudget, 'pct', -1)}</td><td class="r num">${pct1(x.hedge).replace('.0', '')}</td></tr>`)), src: 'Procurement system' },
    { h: 'Plant efficiency and conversion cost', html: tbl(['Plant', 'OEE', 'Conversion cost per case'], K.PLANTS.map(p => `<tr><td>${p.name}</td><td class="r num">${vsPlan(p.oee * 100, p.oeeT * 100, v => v.toFixed(0) + '%')}</td><td class="r num">${dv(p.convVsPlan, 'pct', -1, 'vs plan')}</td></tr>`)), src: 'Manufacturing system' }];
}
function otifExtras(f) {
  const r4 = agg(f, 'A', CW - 3, CW), ytd = agg(f, 'A', 1, CW), ac = accountsData(f, { ...win(), w0: CW - 3, w1: CW, wa: CW }), br = ac.filter(a => a.otif < a.otifT);
  return { h: `${fmt$(r4.lost)} of sales lost to supply in 4 weeks`, sub: 'Ordered but not delivered, at net price', html: stats([['Lost sales · 4 weeks', fmt$(r4.lost), `${pct1(r4.lost / (r4.ns + r4.lost))} of demand`], ['Lost sales · year to date', fmt$(ytd.lost), ''], ['Case fill rate · 4 weeks', pct1(r4.fill), 'target 97%'], ['Contract fines · quarter run rate', fmt$(br.reduce((x, a) => x + a.fines, 0)), `${br.length} retailers below contract`]]), src: 'Order management · customer contracts' };
}

/* ---------- CSO: run rate needed and key accounts ---------- */
function salesExtras(f) {
  const hs = headsData(f), a = hs.reduce((x, h) => x + h.a, 0), tm = hs.reduce((x, h) => x + h.tm, 0), M = monthWk(), el = M.filter(w => w <= CW).length * 7, rem = Math.max(7, M.length * 7 - el), need = (tm - a) / rem, now = a / el;
  const PM = { ...win(), w0: M[0], w1: CW, wa: CW, label: 'MTD' }, ac = accountsData(f, PM).map(x => { const s = shopper(x.slice, Math.max(1, CW - 3), CW), r = agg(x.slice, 'A', M[0], CW); return { ...x, sg: s.g, tr: r.tr / r.gs }; }).sort((x, y) => x.gap - y.gap);
  return { pre: [{ h: `Need ${fmt$(need)} a day for the rest of October vs ${fmt$(now)} now`, sub: 'Run rate to close the month on the sales target (incentive basis)', html: stats([['Needed per day', fmt$(need), `${(rem / 7).toFixed(0)} weeks left`], ['Current per day', fmt$(now), need > now ? sPct(need / now - 1) + ' uplift needed' : 'on pace to make the month'], ['Month target', fmt$(tm), 'sales target · incentive basis'], ['Heads set to miss', `${hs.filter(h => h.pv < 1).length} of ${hs.length}`, '']]), src: 'ERP · sales targets' }],
    post: [{ h: 'Key accounts: month to date', sub: 'Shipments vs plan, shopper sales (4 weeks vs LY), trade rate, delivery and fines · worst gap first', wide: true, html: tbl(['Account', 'Country · channel', 'MTD sales', 'vs plan', 'Shopper sales', 'Trade % gross', 'Delivery (OTIF)', 'Fines'], ac.map(x => `<tr ${sliceAttr(x.slice)}><td>${esc(x.name)}</td><td class="r">${K.CMAP[x.c].name} · ${K.CHMAP[x.ch].name}</td><td class="r num">${fmt$(x.a)}</td><td class="r num">${dv(x.att - 1, 'pct', 1)}</td><td class="r num">${dv(x.sg, 'pct', 1)}</td><td class="r num">${pct1(x.tr)}</td><td class="r num ${x.otif < x.otifT ? 'neg-t' : ''}">${pct1(x.otif)}</td><td class="r num">${x.fines ? fmt$(x.fines) : '—'}</td></tr>`), 'Account figures use each account’s share of its channel (synthetic). Click an account to open its market and channel.'), src: 'ERP · retailer POS · contracts' }] };
}

/* ---------- panel map ---------- */
Object.assign(PANEL, {
  SSG: () => openSSG(),
  AP: () => openAP(),
  PENF: () => openPENF(),
  SAFQ: () => openSAFQ(),
  RISK: () => openRISK(),
  GM: () => { const f = filter(), P = win(); openCFO('F1'); const ex = g2nBlocks(f, P), A = agg(f, 'A', P.w0, P.w1);
    extendTop({ drop: /^A&P spend/, pre: ex, after: () => waterfall($('#b-g2n'), { start: A.gs, end: A.ns - A.cogs, items: [['Trade spend', -A.tr, 'tr'], ['Returns', -A.ret, 'ret'], ['Net sales', 0, 'ns', 'sub'], ['Cost of goods', -A.cogs, 'cogs']] }, { startLabel: 'Gross sales', endLabel: 'Gross margin', cascade: true, pctBase: A.gs, pctLabel: 'of gross sales' }) }); },
  EPS: () => { openCFO('F6'); extendTop({ post: [riskOppBlock(), belowGM()] }); },
  OM: () => { openTile('Sh3'); extendTop({ post: [belowGM()] }); },
  SHARE: () => { const f = filter(); if (state.role === 'CMO') band('M1'); else openTile('Sh6'); extendTop({ post: shareExtras(f) }); },
  SALES: () => { const f = filter(); band('S1'); extendTop(salesExtras(f)); },
  OTIF: () => { const f = filter(); band('O2'); extendTop({ pre: [otifExtras(f)] }); },
  COGS: () => { band('O3'); extendTop({ post: cogsExtras() }); },
});
RGM.SSG = { label: 'Re-check price & promo plan', alias: 'SHARE' };

/* ---------- panel chrome: filters, ask, bookmarks ---------- */
let OPEN = null;
function openCard(id, f, keepDepth) {
  OPEN = id; PF = f ? { ...f } : (PF && OPEN === id ? PF : {});
  drill.root = id; drill.pushNext = false;
  document.querySelectorAll('.card').forEach(c => { const on = c.dataset.open === id; c.classList.toggle('on', on); c.setAttribute('aria-expanded', on); });
  PANEL[id]();
}
function paintBand() {
  const lv = drill.stack[drill.stack.length - 1], el = $('#band'), first_ = el.hidden;
  $('#band-crumbs').innerHTML = [`<button class="link" data-crumb="0">${esc(CARD_DEF[OPEN][0])}</button>`].concat(drill.stack.slice(1).map((l, i) => i < drill.stack.length - 2 ? `<i>›</i><button class="link" data-crumb="${i + 1}">${esc(l.crumb)}</button>` : `<i>›</i><span>${esc(l.crumb)}</span>`)).join('');
  $('#band-title').innerHTML = emph(lv.insight || lv.title || '');
  const rg = RGM[OPEN] && !lv.rgm ? `<button class="btn rgm-btn" data-rgm="${OPEN}">${esc((RGM[OPEN].alias ? RGM[RGM[OPEN].alias] : RGM[OPEN]).label)}</button>` : '';
  $('#band-tools').innerHTML = `${rg}<button class="icon-btn" data-bookmark aria-label="Add this view to my watchlist" title="Add this view to my watchlist">${ICON.bm}</button><button class="icon-btn" data-panel-action aria-label="Create action from this view" title="Create action from this view">${ICON.plus}</button><button class="icon-btn" data-share aria-label="Copy a link to this view" title="Copy a link to this exact view">${ICON.link}</button><button class="icon-btn" data-export aria-label="Export this view" title="Export this view (print or save as PDF)">${ICON.print}</button><button class="icon-btn" id="band-close" aria-label="Close panel" title="Close (Esc)">${ICON.x}</button>`;
  $('#pf-bar').innerHTML = filterBar();
  const body = $('#band-body');
  body.classList.remove('in'); void body.offsetWidth;
  const isLink = b => !b.h && !b.id && /class="link go"/.test(b.html || '') && !/<table|<svg/.test(b.html || '');
  const links = lv.blocks.filter(isLink).map(b => b.html).join('');
  body.innerHTML = `<div class="cluster">${lv.blocks.filter(b => (b.h || b.html || b.id) && !isLink(b)).map((b, i) => `<section class="cc ${b.wide || /<table|class="stats"|class="diag"/.test(b.html || '') ? 'wide' : ''}" style="--d:${i * 40}ms"><header class="cc-h"><div><h3>${esc(b.h || '')}</h3>${b.sub ? `<p>${esc(b.sub)}</p>` : ''}</div><button class="icon-btn sm" data-bm-card="${i}" aria-label="Add this chart to my watchlist" title="Add this chart to my watchlist">${ICON.bm}</button></header>${b.html || ''}${b.id ? `<div class="chart" id="${b.id}"></div>` : ''}${b.foot ? `<p class="foot">${esc(b.foot)}</p>` : ''}<footer class="cc-f"><span class="src">${esc(b.src || srcFor(OPEN))}</span></footer></section>`).join('')}</div>${links ? `<div class="more-links">${links}</div>` : ''}`;
  body.classList.add('in');
  { let open_ = null; body.querySelectorAll('.cluster > .cc').forEach(c => { if (c.classList.contains('wide')) { if (open_) open_.classList.add('wide'); open_ = null; } else open_ = open_ ? null : c; }); if (open_) open_.classList.add('wide'); }
  if (first_) { el.hidden = false; el.classList.remove('open'); void el.offsetWidth; el.classList.add('open'); }
  requestAnimationFrame(() => {
    lv.after && lv.after();
    body.querySelectorAll('[data-slice]').forEach(r => { const go = () => { const s = JSON.parse(r.dataset.slice); PF = { ...PF, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v)) }; openSlice(s); }; r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter') go(); }; });
    body.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { const k = b.dataset.go; goDeeper(() => k === 'catchup' ? openTile('Sh5') : k === 'share' ? openTile('Sh6') : /^[CFMSO]\d$/.test(k) && !/^F\d$/.test(k) ? band(k) : /^F\d$/.test(k) ? openCFO(k) : openTile(k)); });
    body.querySelectorAll('[data-promo]').forEach(r => { const go = () => openPromo(r.dataset.promo); r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter') go(); }; });
    if (first_) { const top = el.getBoundingClientRect().top + scrollY - 140; scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  });
}
const srcFor = id => ({ SHARE: 'Market data · 4 weeks to 20 Sep', PEN: 'Consumer panel', ROMI: 'Marketing mix model · Q2', OTIF: 'Supply planner', INVD: 'Supply planner', CHINV: 'Distributor system', DIST: 'Retail execution', EPS: 'FP&A · investor relations', QUAL: 'Quality system' })[id] || 'ERP · actuals to wk 41';
function closePanel() { $('#band').hidden = true; OPEN = null; PF = {}; drill.stack = []; document.querySelectorAll('.card').forEach(c => { c.classList.remove('on'); c.setAttribute('aria-expanded', 'false'); }); hideTip(); }
function filterBar() {
  const sel = (k, label, opts) => `<label class="fsel ${PF[k] ? 'set' : ''}"><span>${label}</span><select data-pf="${k}">${opts.map(([v, t]) => `<option value="${v}" ${(PF[k] || [''])[0] === v || (!PF[k] && !v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  return `<form class="ask" id="ask-panel" autocomplete="off"><span class="ask-i" aria-hidden="true">${ICON.search}</span><input id="ask-panel-in" placeholder="Ask about ${esc(CARD_DEF[OPEN][0].toLowerCase())}, e.g. “Sunrise Oats in India, large retail”" aria-label="Ask a question about this panel"></form>
    <div class="fbar">${sel('c', 'Country', [['', 'All countries']].concat(K.COUNTRIES.map(c => [c.id, c.name])))}${sel('b', 'Brand', [['', 'All brands']].concat(K.BRANDS.map(b => [b.id, b.name])))}${sel('ch', 'Channel', [['', 'All channels']].concat(K.CHANNELS.map(c => [c.id, c.name])))}
    <span class="per">${esc(win().label)} · ${esc(compShort())}</span>${Object.keys(PF).some(k => PF[k]) ? '<button class="link" data-pf-reset>Reset</button>' : ''}</div><p class="ask-out" id="ask-out" hidden></p>`;
}
const ICON = {
  bm: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 2.5h8v11l-4-2.6-4 2.6z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  link: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 014 4l-1 1M9 11.5l-1 1a2.8 2.8 0 01-4-4l1-1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  print: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 6V2.5h7V6M4.5 11.5h-2v-5h11v5h-2M4.5 9.5h7v4h-7z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  more: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="12.5" cy="8" r="1.3" fill="currentColor"/></svg>',
  chev: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/* ---------- Ask: plain-language question → filters ---------- */
const LEX = {
  c: { IN: ['india', 'indian', 'mumbai', 'delhi', 'bengaluru'], ID: ['indonesia', 'jakarta', 'surabaya', 'bandung'], UK: ['uk', 'britain', 'england', 'london', 'manchester', 'united kingdom'], US: ['usa', 'us', 'america', 'united states', 'new york', 'chicago', 'dallas'] },
  b: { bolt: ['bolt', 'bolt brew', 'coffee'], orchard: ['orchard', 'juice'], oats: ['sunrise', 'oats', 'oat', 'cereal'], crunch: ['crunch', 'chips', 'crisps', 'snacks'], glow: ['glow', 'skincare', 'skin'], silk: ['silk', 'shampoo', 'hair', 'haircare'] },
  ch: { MT: ['modern trade', 'supermarket', 'supermarkets'], LR: ['large retail', 'hypermarket', 'big box'], CONV: ['convenience'], ECOM: ['e-commerce', 'ecommerce', 'online', 'ecom'], GT: ['general trade', 'kirana', 'distributors'] },
  per: { YTD: ['ytd', 'year to date', 'this year'], MTD: ['mtd', 'this month', 'october'], LM: ['last month', 'september'], R4W: ['last 4 weeks', 'four weeks', '4 weeks'], LW: ['last week'], FY: ['full year', 'forecast', 'outlook'] },
};
const METRIC_WORDS = { OSG: ['organic sales growth', 'organic growth', 'sales growth', 'revenue growth', 'net sales', 'revenue', 'growth', 'sales', 'shipments'], SSG: ['shopper sales', 'sell-out', 'sell out', 'consumption', 'retail sales', 'innovation', 'launches', 'launch', 'new products'], SALES: ['sales target', 'sales heads', 'quota', 'run rate', 'key accounts', 'key account', 'customers'],
  GM: ['gross margin', 'gross profit', 'gross-to-net', 'gross to net'], OM: ['operating margin', 'operating profit', 'contribution margin', 'overheads', 'overhead', 'profit', 'margin'], AP: ['a&p', 'a & p', 'advertising', 'media', 'campaign', 'campaigns', 'marketing roi', 'marketing return', 'romi', 'roas', 'marketing'], TRADE: ['trade spend', 'promotions', 'promotion', 'promos', 'promo', 'discounts', 'discount', 'pricing', 'price'], COGS: ['cost of goods', 'cost per case', 'cogs', 'savings', 'productivity', 'hedge', 'hedging', 'costs', 'cost', 'inflation', 'commodities'],
  SHARE: ['market share', 'brand health', 'awareness', 'consideration', 'share of voice', 'sov', 'competitors', 'competitor', 'share'], EPS: ['earnings per share', 'consensus', 'guidance', 'earnings', 'eps', 'risks and opportunities', 'outlook range'], DIST: ['distribution', 'outlets', 'outlet', 'listings', 'reach'], SAFQ: ['safety', 'injuries', 'injury', 'ltifr', 'quality', 'complaints', 'recalls', 'recall', 'suppliers', 'supplier'],
  FCF: ['free cash flow', 'cash flow', 'cash conversion', 'fcf', 'cash', 'receivables', 'working capital'], PENF: ['household penetration', 'penetration', 'households', 'buyers', 'shoppers', 'frequency', 'repeat', 'loyalty'], CHINV: ['channel stock', 'channel inventory', 'distributor stock', 'loading'], OTIF: ['on time in full', 'otif', 'fill rate', 'service level', 'lost sales', 'delivery', 'deliveries', 'fines'], RISK: ['supply risk', 'forecast accuracy', 'forecast bias', 'bias', 'capacity', 'plants', 'plant', 'oee', 'days of inventory', 'out of stock', 'stockouts', 'expiry', 'inventory', 'stock'] };
const OWNER_VIEW = id => ['CMO', 'CSO', 'COO', 'CFO', 'CEO'].find(r => ROLE_CARDS[r].includes(id));   // functional owner first
const STOP = ['the', 'and', 'for', 'how', 'what', 'are', 'our', 'with', 'show', 'doing', 'why', 'is', 'in', 'of', 'vs', 'compare', 'did', 'does', 'was', 'about', 'tell', 'give', 'where', 'which', 'this', 'that', 'there', 'going', 'performing', 'performance', 'losing', 'money', 'down', 'falling', 'behind', 'look', 'looking', 'like', 'into', 'from', 'all', 'can', 'see', 'want', 'need', 'please', 'whats', 'what\'s', 'its', 'it\'s', 'has', 'have', 'been', 'any', 'today', 'now', 'well', 'badly', 'worse', 'better', 'return', 'level', 'levels', 'many', 'much', 'lose', 'lost', 'gain', 'gained', 'won', 'win', 'hit', 'miss', 'missing', 'track'];
function parseAsk(q) {
  let s = ' ' + q.toLowerCase().replace(/[?.,!]/g, ' ') + ' ', f = {}, used = [], per = null, metric = null;
  const take = w => { const re = new RegExp(`\\s${w.replace(/[-']/g, m => '\\' + m)}\\s`); if (!re.test(s)) return false; s = s.replace(re, ' '); used.push(w); return true; };
  // multi-word metric phrases first ("forecast accuracy" is a metric, not a period), then places and periods, then single words
  const phrases = Object.entries(METRIC_WORDS).flatMap(([id, ws]) => ws.map(w => [w, id])).sort((a, b) => b[0].length - a[0].length);
  for (const [w, id] of phrases.filter(p => /\s/.test(p[0]))) if (take(w)) { if (!metric) metric = id; }
  for (const [k, map] of Object.entries(LEX)) for (const [id, words] of Object.entries(map)) for (const w of words.slice().sort((a, b) => b.length - a.length)) if (take(w)) { if (k === 'per') per = id; else f[k] = [id]; }
  for (const [w, id] of phrases.filter(p => !/\s/.test(p[0]))) if (take(w)) { if (!metric) metric = id; }
  const words = s.split(/\s+/).filter(w => w && w.length > 2 && !STOP.includes(w));
  return { f, metric, per, used, unused: words };
}
function runAsk(q, inPanel) {
  if (!q.trim()) return;
  const r = parseAsk(q), ids = ROLE_CARDS[state.role];
  let target, via = '';
  if (r.metric) {   // every metric is reachable from every view: open its own panel, and say where it normally lives
    const m = /^OSG/.test(r.metric) && ids.includes('SSG') && !/net sales|shipments/.test(q.toLowerCase()) ? 'SSG' : /^OSG/.test(r.metric) && ids.includes('SALES') ? 'SALES' : r.metric;
    target = ids.includes(m) ? m : PANEL[m] ? m : ids[CARD_SLOT[m]];
    if (!ids.includes(target)) via = `from the ${ROLES[OWNER_VIEW(target)].label} view`;
  } else target = inPanel && OPEN ? OPEN : ids[0];
  if (r.per && r.per !== state.period) { state.period = r.per; if (!SHORT.includes(r.per) && state.comp === 'M') state.comp = 'T'; syncControls(); renderHome(); }
  openCard(target, r.f);
  const chips = Object.entries(r.f).map(([k, v]) => k === 'c' ? K.CMAP[v[0]].name : k === 'b' ? K.BMAP[v[0]].name : K.CHMAP[v[0]].name);
  const out = $('#ask-out'); out.hidden = false;
  out.innerHTML = `<span class="ai" data-def="AI">Ask</span> Showing <b>${esc(CARD_DEF[target][0])}</b>${chips.length ? ' for ' + chips.map(c => `<span class="chip-f">${esc(c)}</span>`).join(' ') : ' for the whole company'}${r.per ? ` · ${esc(PERIODS[r.per].label)}` : ''}${via ? ` <span class="muted">· ${esc(via)}</span>` : ''}${r.unused.length ? ` <span class="muted">· Not understood: ${esc(r.unused.slice(0, 4).join(', '))}</span>` : ''}`;
  $('#ask-panel-in').value = q;
}

/* ---------- view state: every drill step is recorded so a view can be rebuilt exactly ---------- */
const STEP = { cur: null };
const REPLAY = {};
['openSlice', 'openRgm', 'openPromo', 'openContrib', 'band', 'openTile', 'openCFO', 'openCampaign', 'openEx'].forEach(name => {
  const orig = { openSlice, openRgm, openPromo, openContrib, band, openTile, openCFO, openCampaign, openEx }[name];
  const wrapped = function (...args) {
    const outer = !STEP.cur; if (outer) STEP.cur = { fn: name, args: args.map(a => a && typeof a === 'object' && 'w0' in a && 'label' in a ? '$P' : a) };
    try { return orig.apply(this, args); } finally { if (outer) STEP.cur = null; }
  };
  REPLAY[name] = wrapped;
  ({ openSlice: () => openSlice = wrapped, openRgm: () => openRgm = wrapped, openPromo: () => openPromo = wrapped, openContrib: () => openContrib = wrapped, band: () => band = wrapped, openTile: () => openTile = wrapped, openCFO: () => openCFO = wrapped, openCampaign: () => openCampaign = wrapped, openEx: () => openEx = wrapped })[name]();
});
function getView(chart) {
  const path = []; for (const l of drill.stack.slice(1)) { if (!l.step) break; path.push(l.step); }
  return { role: state.role, card: OPEN, pf: { ...PF }, period: state.period, comp: state.comp, year: state.year, path, chart: chart || null };
}
function restoreView(v) {
  if (!v || !CARD_DEF[v.card]) return;
  if (v.role && v.role !== state.role && ROLES[v.role]) { state.role = v.role; state.chosen = true; state.actFilter = 'Open'; state.actPage = 0; try { localStorage.setItem('pulse-role', v.role); } catch (e) { } }
  state.period = PERIODS[v.period] ? v.period : 'YTD'; state.comp = v.comp || 'T'; state.year = v.year || 'CAL';
  $('#picker').hidden = true; closePanel(); syncControls(); renderHome();
  openCard(v.card, v.pf || {});
  for (const st of v.path || []) { const fn = REPLAY[st.fn]; if (!fn) break; drill.pushNext = true; try { fn(...st.args.map(a => a === '$P' ? win() : a)); } catch (e) { drill.pushNext = false; break; } }
  drill.pushNext = false;
  if (v.chart) setTimeout(() => { const ccs = [...document.querySelectorAll('#band-body .cc')], el = ccs.find(c => (c.querySelector('h3') || {}).textContent === v.chart.h) || ccs[v.chart.i]; if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('hl'); setTimeout(() => el.classList.remove('hl'), 2600); } }, 420);
}
// evaluate a card under a saved view's filters, period and comparison without disturbing the screen
function cardIn(v) {
  const s = { period: state.period, comp: state.comp, year: state.year }; state.period = v.period; state.comp = v.comp; state.year = v.year || 'CAL';
  try { return withF(v.pf || {}, () => card(v.card)); } finally { Object.assign(state, s); }
}
const scopeOf = (pf, lv) => lv && lv.rgm ? (RGM[OPEN].alias ? RGM[RGM[OPEN].alias] : RGM[OPEN]).scope : [pf.c && K.CMAP[pf.c[0]].name, pf.b && K.BMAP[pf.b[0]].name, pf.ch && K.CHMAP[pf.ch[0]].name].filter(Boolean).join(' · ') || 'Whole company';
const b64 = { enc: s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), dec: s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))) };

/* ---------- bookmarks = a live watchlist ---------- */
const BM_KEY = 'pulse-bm2';
let BM = null; try { BM = JSON.parse(localStorage.getItem(BM_KEY)); } catch (e) { BM = null; }
const saveBM = () => { try { localStorage.setItem(BM_KEY, JSON.stringify(BM)); } catch (e) { } };
function seedBookmarks() {   // a few views saved a week ago, so the watchlist shows what changed since
  const S = [['CEO', 'OM', { c: ['UK'] }, 'UK operating margin'], ['CEO', 'OSG', { b: ['bolt'], c: ['UK'], ch: ['CONV'] }, 'Bolt Brew in UK convenience'],
    ['CFO', 'GM', { b: ['oats'] }, 'Sunrise Oats gross margin'], ['CFO', 'OSG', { c: ['IN'], ch: ['GT'] }, 'India general trade sales'],
    ['CMO', 'SSG', { b: ['glow'], c: ['IN'] }, 'Glow Skincare India shopper sales'], ['CMO', 'AP', { b: ['bolt'] }, 'Bolt Brew A&P'],
    ['CSO', 'TRADE', { c: ['US'] }, 'USA trade spend'], ['CSO', 'CHINV', { c: ['IN'] }, 'India channel stock'],
    ['COO', 'COGS', { b: ['oats'] }, 'Sunrise Oats cost per case'], ['COO', 'OTIF', { c: ['ID'] }, 'Indonesia service level']];
  return S.map(([role, cardId, pf, title], i) => { const v = { role, card: cardId, pf, period: 'YTD', comp: 'T', year: 'CAL', path: [], chart: null }, x = asOf(1, () => cardIn(v));
    return { id: 'seed' + i, ts: Date.UTC(2026, 9, 5), v, title, scope: scopeOf(pf), v0: x.raw, sev0: x.sev, val0: x.value }; });
}
if (!Array.isArray(BM)) { BM = seedBookmarks(); saveBM(); }
function addBookmark(chart) {
  if (!OPEN) return; const lv = drill.stack[drill.stack.length - 1], v = getView(chart), x = cardIn(v);
  const key = JSON.stringify({ ...v, chart: chart ? chart.h : null });
  BM = BM.filter(b => JSON.stringify({ ...b.v, chart: b.v.chart ? b.v.chart.h : null }) !== key);
  BM.unshift({ id: 'bm' + Date.now(), ts: Date.now(), v, title: chart ? chart.h : (lv.insight || lv.title || CARD_DEF[OPEN][0]), scope: scopeOf(PF, lv), v0: x.raw, sev0: x.sev, val0: x.value });
  BM = BM.slice(0, 16); saveBM(); renderPins(); syncControls(); toast('Added to your watchlist · it shows the latest number and what changed');
}
function watchRow(b) {
  let x; try { x = cardIn(b.v); } catch (e) { return null; }
  const ch = changeHtml(b.v.card, x, b.v0, x.raw, 'since you saved it ' + fmtD(b.ts)), flip = b.sev0 && b.sev0 !== x.sev, rel = b.v0 ? Math.abs(x.raw - b.v0) / Math.abs(b.v0) : 0;
  return { b, x, ch, flip, rank: (flip ? 10 : 0) + rel };
}
function watchTile(r, compact) {
  const b = r.b, x = r.x, deep = (b.v.path || []).length ? ' · ' + (b.v.path[b.v.path.length - 1].fn === 'openRgm' ? 'RGM check' : 'deeper view') : '';
  return `<div class="pin ${r.flip ? 'flip' : ''}"><button class="pin-open" data-pin="${b.id}" title="Open this view exactly as saved">
    <span class="pin-k">${esc(CARD_DEF[b.v.card][0])} · ${esc(b.scope)} · ${b.v.card === 'ASK' ? 'custom view' : esc(PERIODS[b.v.period].label)}${deep}${compact ? ` · ${esc(ROLES[b.v.role].label)}` : ''}</span>
    <span class="pin-v"><b class="num">${x.value}</b>${sevPill(x.sev)}</span>
    <span class="pin-c">${r.ch}${r.flip ? ` <span class="pill meta">Was ${SEV[b.sev0]}</span>` : ''}</span>
    <span class="pin-t">${esc(b.title)}</span></button><button class="icon-btn sm" data-unpin="${b.id}" aria-label="Remove from watchlist" title="Remove">${ICON.x}</button></div>`;
}
function renderPins() {
  const rows = BM.filter(b => b.v.role === state.role).map(watchRow).filter(Boolean).sort((a, b) => b.rank - a.rank), all = rows.length;   // each role's watchlist is its own
  $('#pins').hidden = false;
  $('#pins').innerHTML = `<div class="sec-row"><h2 class="sec">My watchlist</h2>${all ? `<button class="link" data-bm-all>See all ${all}</button>` : ''}</div>${rows.length ? `<div class="pin-row">${rows.slice(0, 4).map(r => watchTile(r)).join('')}</div>` : `<p class="pin-empty">${ICON.bm} Bookmark any panel or chart and it appears here with the latest number and what changed since you saved it.</p>`}`;
  const changed = rows.filter(r => r.flip || !/no change/.test(r.ch)).length;
  $('#bm-count').textContent = changed || ''; $('#bm-count').title = changed ? `${changed} changed since you saved them` : '';
}
function openWatchAll() {   // only the current role's saved views: a watchlist is personal
  const rows = BM.filter(b => b.v.role === state.role).map(watchRow).filter(Boolean).sort((a, b) => b.rank - a.rank), who = ROLES[state.role].label;
  openModal(`${who} watchlist`, rows.length ? `<p class="muted" style="margin:0 0 12px">Your saved views as ${esc(who)}, with the latest number. Opening one restores the exact view: filters, period, comparison and drill level. Other roles keep their own watchlists.</p><div class="pin-col">${rows.map(r => watchTile(r)).join('')}</div>` : `<p class="pin-empty">${ICON.bm} Nothing saved yet as ${esc(who)}. Open any metric and use the bookmark button on the panel or on a chart.</p>`);
}

/* ---------- share link and export ---------- */
function shareLink() {
  const url = location.href.split('#')[0] + '#v=' + b64.enc(JSON.stringify(getView(null)));
  openModal('Link to this view', `<p class="muted" style="margin:0 0 10px">Opens this exact view: ${esc(ROLES[state.role].label)} · ${esc(CARD_DEF[OPEN][0])} · ${esc(scopeOf(PF, drill.stack[drill.stack.length - 1]))} · ${esc(win().label)} ${esc(compShort())}. Anyone you send it to sees the data their own access allows.</p><input class="link-in" readonly value="${esc(url)}" onclick="this.select()"><div class="mb">${copyBtn(url)}<button class="btn" data-close>Close</button></div>`);
}
function exportView() {
  const lv = drill.stack[drill.stack.length - 1];
  $('#print-stamp').innerHTML = `<b>Pulse · ${esc(ROLES[state.role].label)} view · ${esc(CARD_DEF[OPEN][0])}</b><span>${esc(scopeOf(PF, lv))} · ${esc(win().label)} ${esc(compShort())} · data to w/e 11 Oct 2026 · Sep books closed · exported ${esc(new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))}</span><span>Northstar Consumer Goods is fictional; all figures are synthetic.</span>`;
  window.print();
}

/* ---------- actions ---------- */
let NEWACTS = []; try { NEWACTS = JSON.parse(localStorage.getItem('pulse-new-acts') || '[]'); } catch (e) { NEWACTS = []; }
const saveNew = () => { try { localStorage.setItem('pulse-new-acts', JSON.stringify(NEWACTS)); localStorage.setItem('ns-actions', JSON.stringify(ACTS)); } catch (e) { } };
function actionsList() {
  const mine = NEWACTS.filter(a => a.role === state.role).map(a => ({ ...a, ...(ACTS[a.id] || {}) })).map(a => ({ ...a, overdue: a.status !== 'Done' && a.due < TODAY }));
  return mine.concat(actions().filter(a => !mine.find(m => m.id === a.id))).slice(0, 20);
}
const STEPS = ['New', 'Assigned', 'In progress', 'Done'];
function actionsView() {
  const all = actionsList(), fl = state.actFilter || 'Open', pg = state.actPage || 0;
  const list = all.filter(a => fl === 'Open' ? a.status !== 'Done' : fl === 'Overdue' ? a.overdue : a.status === 'Done');
  const pages = Math.max(1, Math.ceil(list.length / 5)), p = Math.min(pg, pages - 1), shown = list.slice(p * 5, p * 5 + 5);
  const cnt = { Open: all.filter(a => a.status !== 'Done').length, Overdue: all.filter(a => a.overdue).length, Done: all.filter(a => a.status === 'Done').length };
  const primary = a => a.status === 'New' ? `<button class="btn sm cta" data-assign="${esc(a.id)}">Assign</button>` : a.status === 'Assigned' ? `<button class="btn sm cta" data-mail="${esc(a.id)}">Email</button>` : a.status === 'In progress' ? `<button class="btn sm cta" data-meet="${esc(a.id)}">Book meeting</button>` : '';
  return `<div class="act-top"><div class="seg-tabs" role="tablist">${Object.entries(cnt).map(([k, n]) => `<button role="tab" aria-selected="${fl === k}" data-af="${k}" class="${k === 'Overdue' && n ? 'alert' : ''}">${k} <span>${n}</span></button>`).join('')}</div>
    <button class="btn cta" data-new-act ${all.length >= 20 ? 'disabled title="Up to 20 actions in this prototype"' : ''}>${ICON.plus} New action</button></div>
    <div id="new-form" hidden></div>
    <div class="atable" role="table" aria-label="My actions"><div class="arow ahead" role="row"><span>Action</span><span>Owner</span><span>Due</span><span class="r">At stake</span><span>Status</span><span></span></div>
    ${shown.map(a => `<div class="arow-wrap ${state.openAct === a.id ? 'exp' : ''}"><div class="arow" role="row">
      <button class="a-ask" data-exp="${esc(a.id)}" aria-expanded="${state.openAct === a.id}"><span class="chev">${ICON.chev}</span><span><b>${esc(a.title.split(/;/)[0].replace(/\.$/, ''))}</b><span class="a-why">${esc(a.issue)}${a.urgency === 'High' ? ' · <em>High priority</em>' : ''}</span></span></button>
      <span class="a-own">${esc(a.poc.split(' · ')[1] || a.poc.split(' · ')[0])}<small>${esc(a.poc.split(' · ')[1] ? a.poc.split(' · ')[0] : '')}</small></span>
      <span class="num ${a.overdue ? 'od' : ''}">${fmtD(a.due)}${a.overdue ? '<small>Overdue</small>' : ''}</span>
      <span class="num r">${a.value ? '~' + fmt$(a.value) : '—'}</span>
      <span class="a-st"><i class="dot ${a.status.replace(' ', '-').toLowerCase()}"></i>${a.status}</span>
      <span class="a-btn">${primary(a)}<div class="menu-wrap"><button class="icon-btn sm" data-menu="${esc(a.id)}" aria-label="More actions" aria-haspopup="true">${ICON.more}</button></div></span></div>
      ${state.openAct === a.id ? `<div class="a-exp"><div><h4>Why</h4><p>${esc(a.why)}</p>${a.chain && a.chain.length ? `<p class="muted">${a.chain.map(esc).join(' → ')}</p>` : ''}${a.target ? `<p><b>Target:</b> ${esc(a.target)}</p>` : ''}<button class="link" data-see="${esc(a.id)}">Open the analysis →</button></div>
        <div><h4>Progress</h4><ol class="stepper">${STEPS.map((s, i) => `<li class="${STEPS.indexOf(a.status) >= i ? 'done' : ''}"><button data-step="${esc(a.id)}|${s}">${s}</button></li>`).join('')}</ol><p class="muted">Assigned ${fmtD(a.assigned)} · due ${fmtD(a.due)}</p></div></div>` : ''}</div>`).join('') || `<p class="empty">No ${fl.toLowerCase()} actions. New actions appear here when a metric goes off track, or when you create one.</p>`}</div>
    ${pages > 1 ? `<nav class="pager" aria-label="Action pages"><span>${p * 5 + 1}–${Math.min(list.length, p * 5 + 5)} of ${list.length}</span><button class="icon-btn sm" data-page="${p - 1}" ${p === 0 ? 'disabled' : ''} aria-label="Previous page">‹</button>${Array.from({ length: pages }, (_, i) => `<button class="pg ${i === p ? 'on' : ''}" data-page="${i}" aria-current="${i === p}">${i + 1}</button>`).join('')}<button class="icon-btn sm" data-page="${p + 1}" ${p >= pages - 1 ? 'disabled' : ''} aria-label="Next page">›</button></nav>` : ''}<p class="sr" aria-live="polite" id="pg-live"></p>`;
}
function newActionForm(prefill) {
  const ppl = Object.values(K.PEOPLE).concat(K.SALES_HEADS.map(h => h.name + ' · Regional Sales Head')).filter((v, i, s) => s.indexOf(v) === i);
  const el = $('#new-form'); el.hidden = false;
  el.innerHTML = `<form class="nform" id="nform"><label class="wide"><span>What needs to happen</span><input id="na-t" required value="${esc(prefill ? prefill.title : '')}" placeholder="e.g. Agree a recovery plan for Bolt Brew in UK convenience"></label>
    <label><span>Owner</span><select id="na-o">${ppl.map(p => `<option>${esc(p)}</option>`).join('')}</select></label><label><span>Due</span><input id="na-d" type="date" value="${new Date(TODAY + 7 * DAY).toISOString().slice(0, 10)}"></label>
    <label><span>Priority</span><select id="na-u"><option>High</option><option selected>Medium</option><option>Low</option></select></label><div class="nf-b"><button class="btn primary" type="submit">Add action</button><button class="btn" type="button" data-cancel-new>Cancel</button></div></form>`;
  $('#na-t').focus();
  $('#nform').onsubmit = e => { e.preventDefault(); const id = 'new' + Date.now();
    NEWACTS.unshift({ id, role: state.role, title: $('#na-t').value.trim(), issue: prefill ? prefill.issue : 'Created by you', why: prefill ? prefill.why : 'Created by you from Pulse.', chain: [], poc: $('#na-o').value, urgency: $('#na-u').value, target: '', value: 0, sev: 'warn', f: prefill ? prefill.f : {}, assigned: TODAY, due: Date.parse($('#na-d').value) || TODAY + 7 * DAY, status: 'Assigned' });
    saveNew(); state.actFilter = 'Open'; state.actPage = 0; el.hidden = true; $('#acts').innerHTML = actionsView(); const row = $('#acts .arow-wrap'); row && row.classList.add('flash'); toast('Action added'); };
}
function menu(id, btn) {
  closeMenus(); const m = document.createElement('div'); m.className = 'menu'; m.setAttribute('role', 'menu');
  m.innerHTML = `<button role="menuitem" data-mail="${esc(id)}">Email draft</button><button role="menuitem" data-meet="${esc(id)}">Meeting invite</button><button role="menuitem" data-assign="${esc(id)}">Reassign</button><button role="menuitem" data-see="${esc(id)}">Open analysis</button><button role="menuitem" data-step="${esc(id)}|Done">Mark done</button>`;
  btn.parentElement.appendChild(m); m.querySelector('button').focus();
}
const closeMenus = () => document.querySelectorAll('.menu').forEach(m => m.remove());
const findAct = id => actionsList().find(a => a.id === id);

/* ---------- Ask demo: one guided walkthrough, identical for every role ---------- */
// 1 type a question · 2 Pulse builds a custom view with filters · 3 email the results (draft only) · 4 save to the watchlist
const ASKD = {
  q: 'Why is Bolt Brew losing share in UK convenience, and what should we do?',
  pf: { b: ['bolt'], c: ['UK'], ch: ['CONV'] },
  applied: [['Brand', 'Bolt Brew Coffee'], ['Market', 'UK'], ['Channel', 'Convenience'], ['Period', 'Last 13 weeks'], ['Compare to', 'Last year']],
  to: [['Bob Smith', 'UK Sales Director', 'bob.smith@northstar.example'], ['Chloe Adams', 'Bolt Brew Brand Director', 'chloe.adams@northstar.example'], ['Alice Brown', 'Head of RGM', 'alice.brown@northstar.example']],
};
CARD_DEF.ASK = ['Ask Pulse', 'A custom view Pulse built from your question.', '']; DEF.ASK = CARD_DEF.ASK;
const cardBase = card; card = function (id) { return id === 'ASK' ? { ...cardBase('SHARE'), per: '4 wks to 20 Sep' } : cardBase(id); };
const filterBarBase = filterBar;
filterBar = function () {
  if (OPEN !== 'ASK') return filterBarBase();
  return `<form class="ask" id="ask-panel" autocomplete="off"><span class="ask-i" aria-hidden="true">${ICON.search}</span><input id="ask-panel-in" value="${esc(ASKD.q)}" aria-label="Your question"></form>
    <div class="fbar applied">${ASKD.applied.map(([k, v], i) => `<span class="fsel ro" style="--d:${i * 90}ms"><span>${k}</span><b>${v}</b></span>`).join('')}<span class="per">Set by Pulse from your question · edit the question to change them</span></div><p class="ask-out" id="ask-out" hidden></p>`;
};
function askFacts() {
  const f = ASKD.pf, sh = K.share({ b: f.b, c: f.c }, K.MKT_LAST - 3, K.MKT_LAST), a = agg(f, 'A', CW - 12, CW), l = agg(f, 'L', CW - 12, CW), r = RGM.SHARE, rec = r.rows.find(x => /recommended/i.test(x[0]));
  return { chg: sh.chg * 100, now: sh.now, g: a.ns / l.ns - 1, buyers: K.SWITCHING[0].buyers, cons: K.BRAND_HEALTH['bolt|UK'][1], pmp: K.PROMOS.find(p => p.id === 'p4'), rec };
}
function openAskView(animate) {
  OPEN = 'ASK'; PF = { ...ASKD.pf }; drill.root = 'ASK'; drill.pushNext = false; drill.stack = [];
  document.querySelectorAll('.card').forEach(c => { c.classList.remove('on'); c.setAttribute('aria-expanded', 'false'); });
  const x = askFacts(), f = ASKD.pf, r = RGM.SHARE;
  const shA = new Float64Array(NW + 1), shL = new Float64Array(NW + 1); for (let w = 20; w <= K.MKT_LAST; w++) { const s = K.share({ b: f.b, c: f.c }, w - 3, w); shA[w] = s.now * 100; shL[w] = s.ly * 100; }
  const nA = new Float64Array(NW + 1), nL = new Float64Array(NW + 1); for (let w = 20; w <= CW; w++) { nA[w] = agg(f, 'A', w, w).ns; nL[w] = agg(f, 'L', w, w).ns; }
  const mk = [{ w: 34, text: 'Volt Coffee cuts its shelf price 12% in UK convenience' }];
  const table = `<div class="tbl-wrap"><table class="t rgm"><thead><tr>${r.cols.map((c, i) => `<th class="${i ? 'r' : ''}">${c}</th>`).join('')}</tr></thead><tbody>${r.rows.map(y => `<tr class="${/recommended/i.test(y[0]) ? 'rec' : ''}"><td>${esc(y[0])}</td>${y.slice(1, 4).map(v => `<td class="r num">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="rgm-act"><button class="btn" aria-disabled="true" title="Prototype only: opens the RGM tool">Open in RGM tool ↗</button></div>`;
  openLevel({ crumb: 'Your question', title: ASKD.q, ask: true,
    insight: `Bolt Brew lost ${Math.abs(x.chg).toFixed(1)} share points in the UK since Volt Coffee cut its convenience shelf price 12% in Wk 34. About ${x.buyers}M buyers switched, and our price-marked pack is not paying back (${x.pmp.roi.toFixed(2)}x). Best option: a 2-for-£2.20 multibuy.`,
    blocks: [
      { h: `Share fell ${Math.abs(x.chg).toFixed(1)} pts after Volt cut its price`, sub: 'Bolt Brew share of UK coffee, 4-week rolling · vs last year', id: 'b-ask1', html: '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>This year</span><span><i class="dash light"></i>Last year</span><span><i class="dot" style="background:var(--opp)"></i>Competitor move</span></div>', src: 'Market data · to 20 Sep' },
      { h: `Convenience sales ${sPct(x.g)} vs last year`, sub: 'Bolt Brew · UK · convenience · weekly net sales', id: 'b-ask2', html: '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>This year</span><span><i class="dash light"></i>Last year</span></div>', src: 'ERP · actuals to wk 41' },
      { h: 'Why: price gap, lost buyers, weaker consideration', wide: true, html: stats([['Price vs Volt Coffee', '+14%', 'was at parity before Wk 34'], ['Buyers switched to Volt', x.buyers + 'M', 'households · consumer panel'], ['Consideration', x.cons[1].toFixed(0) + '%', dv(x.cons[1] - x.cons[0], 'pts', 1, 'vs last year · significant')], ['Price-marked pack return', x.pmp.roi.toFixed(2) + 'x', 'per $1 · below 1.0 loses money']]), src: 'Market data · consumer panel · brand tracker · RGM tool' },
      { h: 'What to do: options from the RGM tool', sub: r.chip + ' · illustrative', wide: true, html: table, src: 'RGM tool (illustrative)' }, rgmWhyBlock('SHARE')],
    after: () => { lineChart($('#b-ask1'), { x0: 20, x1: K.MKT_LAST, h: 170, yfmt: v => v.toFixed(0) + '%', markers: mk, series: [{ vals: shL, from: 20, to: K.MKT_LAST, color: '#b9bfc7', w: 1.5, dash: '1 3' }, { vals: shA, from: 20, to: K.MKT_LAST, color: 'var(--s1)', end: true }], tip: w => `<div class="th">Wk ${w}</div>${trow('Share', shA[w].toFixed(1) + '%')}${trow('Last year', shL[w].toFixed(1) + '%')}` });
      lineChart($('#b-ask2'), { x0: 20, x1: CW, h: 170, yfmt: fmt$, markers: mk, series: [{ vals: nL, from: 20, to: CW, color: '#b9bfc7', w: 1.5, dash: '1 3' }, { vals: nA, from: 20, to: CW, color: 'var(--s1)', end: true }], tip: w => `<div class="th">Wk ${w}</div>${trow('Net sales', fmt$(nA[w]))}${trow('Last year', fmt$(nL[w]) + ' ' + sPct(vr(nA[w], nL[w])))}` }); } }, true);
  const out = $('#ask-out'); if (out) { out.hidden = false; out.innerHTML = `<span class="ai" data-def="AI">Ask</span> Built a custom view: 4 charts and an answer, from market data, sales, the consumer panel, the brand tracker and the RGM tool.`; }
}
PANEL.ASK = () => openAskView(false);
const sleepD = ms => new Promise(r => setTimeout(r, ms));
async function askBuild() {   // the "building" moment, then the finished view
  OPEN = 'ASK'; PF = { ...ASKD.pf }; drill.stack = []; drill.root = 'ASK';
  const steps = ['Understanding the question', 'Choosing the data: market share, sales, consumer panel, brand tracker, RGM tool', 'Applying filters: Bolt Brew Coffee · UK · convenience · last 13 weeks · vs last year', 'Building 4 charts', 'Writing the answer and the recommendation'];
  openLevel({ crumb: 'Your question', title: 'Building your view…', ask: true, blocks: [{ h: '', wide: true, html: `<ul class="build">${steps.map((s, i) => `<li class="bstep" data-bs="${i}"><span class="ic" aria-hidden="true"></span>${esc(s)}</li>`).join('')}</ul>` }] }, true);
  await sleepD(80); $('#band').scrollIntoView({ behavior: 'smooth', block: 'start' });
  for (let i = 0; i < steps.length; i++) { const li = document.querySelector(`[data-bs="${i}"]`); if (!li) break; li.classList.add('run'); await sleepD(520); li.classList.remove('run'); li.classList.add('done'); }
  await sleepD(250); openAskView(true);
}
function askEmailHtml() {
  const x = askFacts(), link = location.href.split('#')[0] + '#v=' + b64.enc(JSON.stringify({ role: state.role, card: 'ASK', pf: ASKD.pf, period: state.period, comp: state.comp, year: state.year, path: [], chart: null }));
  const body = `Hi Bob, Chloe and Alice,\n\nBolt Brew lost ${Math.abs(x.chg).toFixed(1)} share points in the UK since Volt Coffee cut its convenience shelf price 12% in Wk 34. About ${x.buyers}M buyers switched.\n\n• Convenience sales: ${sPct(x.g)} vs last year (last 13 weeks)\n• Price gap: Bolt Brew now costs 14% more than Volt\n• Our price-marked pack returns ${x.pmp.roi.toFixed(2)}x per $1\n• RGM tool recommends a 2-for-£2.20 multibuy: about ${x.rec[1]} share at ${x.rec[2]} return\n\nCan we agree the multibuy at Thursday's UK review?\n\nOpen the exact view: ${link}`;
  return { body, html: `<dl class="mf"><dt>To</dt><dd><div class="to-chips" id="demo-to"></div></dd><dt>Subject</dt><dd>Bolt Brew in UK convenience: why we are losing share and what to do</dd></dl>
    <textarea id="demo-body" rows="13" readonly>${esc(body)}</textarea>
    <div class="attach">${ICON.print}<span><b>Bolt Brew UK convenience · Pulse view.pdf</b> <span class="muted">· snapshot of this view, data to w/e 11 Oct 2026</span></span></div>
    <div class="m-act"><button class="btn primary" id="demo-send">Send</button><button class="btn" data-close>Cancel</button></div><p class="foot">Demo: nothing is sent from the prototype. In production this opens in your own email app.</p>` };
}
async function askEmail() {
  const m = askEmailHtml(); openModal('Email the results', m.html);
  for (const [n, role, e] of ASKD.to) { await sleepD(380); const el = $('#demo-to'); if (!el) return; el.insertAdjacentHTML('beforeend', `<span class="to-chip" title="${esc(n)} · ${esc(e)}"><b>${esc(role)}</b> <span class="muted">${esc(n)}</span></span>`); }
  const s = $('#demo-send'); if (s) s.classList.add('demo-ring');
}
async function askSend() {
  const s = $('#demo-send'); if (s) { s.classList.remove('demo-ring'); s.textContent = 'Sending…'; s.disabled = true; await sleepD(650); s.textContent = '✓ Sent (demo)'; }
  await sleepD(550); closeModal(); toast('Demo: email prepared for Bob, Chloe and Alice · nothing was sent');
}
async function askSave() {
  if (OPEN !== 'ASK') openAskView(false);
  const b = $('#band-tools [data-bookmark]'); $('#band').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (b) { b.classList.add('demo-ring'); await sleepD(900); b.classList.remove('demo-ring'); }
  const v = { role: state.role, card: 'ASK', pf: { ...ASKD.pf }, period: state.period, comp: state.comp, year: state.year, path: [], chart: null }, x = cardIn(v);
  BM = BM.filter(y => y.id !== 'demo-ask'); BM.unshift({ id: 'demo-ask', ts: Date.now(), v, title: ASKD.q, scope: 'Bolt Brew Coffee · UK · Convenience', v0: x.raw, sev0: x.sev, val0: x.value }); saveBM(); renderPins();
  toast('Saved to your watchlist · it reopens this exact view and shows what changed');
  await sleepD(500); const tile = [...document.querySelectorAll('#pins .pin')].find(p => p.querySelector('[data-pin="demo-ask"]'));
  if (tile) { tile.scrollIntoView({ behavior: 'smooth', block: 'center' }); tile.classList.add('new'); }
}
const DEMO_STEPS = [
  { n: 0, t: 'See Ask in action', d: 'One short demo, the same for every role: a plain-English question becomes a custom view, gets emailed to the team and is saved for later.', btn: 'Start' },
  { n: 1, t: 'Ask a question', d: 'Type it the way you would ask an analyst. No menus and no filters to set.', btn: 'Build my view', run: async () => { closeModal(); scrollTo({ top: 0, behavior: 'smooth' }); const i = $('#ask-global-in'), fm = $('#ask-global'); i.value = ''; i.focus(); fm.classList.add('demo-ring'); for (const ch of ASKD.q) { i.value += ch; await sleepD(24); } fm.classList.remove('demo-ring'); } },
  { n: 2, t: 'Pulse builds a custom view', d: 'It works out what you mean, applies the filters (brand, market, channel, period, comparison), picks the charts and writes the answer, with the source under every chart.', btn: 'Email the results', run: async () => { $('#ask-global-in').blur(); await askBuild(); } },
  { n: 3, t: 'Email the results', d: 'Send the answer to the people who need to act. The email carries the summary, a PDF snapshot and a link to this exact view.', btn: 'Send', run: askEmail },
  { n: 3, t: 'Sent', d: 'Bob, Chloe and Alice get the summary and the link. (Demo: nothing leaves the prototype.)', btn: 'Bookmark this view', run: askSend },
  { n: 4, t: 'Bookmark it for later', d: 'Saved to your watchlist. Tomorrow it opens this exact view and shows what changed since today.', btn: 'Finish', run: askSave },
];
let demoAt = -1, demoBusy = false;
function renderCoach() {
  const s = DEMO_STEPS[demoAt], el = $('#coach'); el.hidden = false;
  el.innerHTML = `<span class="k">${s.n ? `Step ${s.n} of 4` : 'Demo'}</span><h4>${esc(s.t)}</h4><p>${esc(s.d)}</p><div class="row"><span class="dots">${[1, 2, 3, 4].map(i => `<i class="${i <= s.n ? 'on' : ''}"></i>`).join('')}</span><span><button class="link" data-demo-exit>Exit</button> <button class="btn primary" data-demo-next ${demoBusy ? 'disabled' : ''}>${demoBusy ? 'Working…' : esc(s.btn)}</button></span></div>`;
}
async function demoNext() {
  if (demoBusy) return;
  if (demoAt >= DEMO_STEPS.length - 1) return demoExit();
  demoAt++; const s = DEMO_STEPS[demoAt]; demoBusy = true; renderCoach();
  try { if (s.run) await s.run(); } finally { demoBusy = false; renderCoach(); }
}
function demoStart() { demoAt = -1; demoBusy = false; closeModal(); demoNext(); }
function demoExit() { demoAt = -1; $('#coach').hidden = true; document.querySelectorAll('.demo-ring').forEach(e => e.classList.remove('demo-ring')); }
// typing the demo question yourself opens the same custom view
const runAskBase = runAsk;
runAsk = function (q, inPanel) { if (/bolt/i.test(q) && /convenience/i.test(q) && /(share|losing)/i.test(q)) { askBuild(); return; } return runAskBase(q, inPanel); };

/* ---------- render ---------- */
function renderHome() {
  const P = win(), ex = withF({}, () => exceptions({}, P)); window.__ex = ex;
  withF({}, () => buildActions(ex, {}, P));
  $('#summary').innerHTML = summaryView(ex);
  const ids = ROLE_CARDS[state.role];
  $('#cards').innerHTML = ids.map((id, i) => cardHtml(id, i)).join('');
  renderPins();
  $('#acts').innerHTML = actionsView();
  $('#act-sum').textContent = `${actionsList().filter(a => a.status !== 'Done').length} open · sorted by priority`;
  if (OPEN) PANEL[OPEN]();
}
function syncControls() {
  $('#view-name').textContent = ROLES[state.role].label;
  const P = win(); $('#period-lab').textContent = `${P.label} · ${compShort()}`;
  seg($('#f-period'), Object.entries(PERIODS).map(([k, v]) => [k, v.label]), state.period, v => { state.period = v; if (!SHORT.includes(v) && state.comp === 'M') state.comp = 'T'; syncControls(); renderHome(); });
  seg($('#f-comp'), [['T', 'Plan'], ['E', 'Latest estimate'], ['L', 'Last year']].concat(SHORT.includes(state.period) ? [['M', 'Last month']] : []), state.comp, v => { state.comp = v; syncControls(); renderHome(); });
  seg($('#f-year'), [['CAL', 'Calendar'], ['FISCAL', 'Fiscal (Apr–Mar)']], state.year, v => { state.year = v; syncControls(); renderHome(); });
  $('#period-desc').textContent = P.desc;
}
function seg(el, opts, cur, on) { el.innerHTML = opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join(''); el.onclick = e => { const b = e.target.closest('button'); if (b) on(b.dataset.v); }; }
const SHORT = ['LW', 'MTD', 'LM', 'R4W'];
const ROLE_INFO = { CEO: 'Growth, profit, market share and cash for the whole company.', CFO: 'Growth quality, gross margin and pricing, EPS vs guidance, cash.', CMO: 'Brand growth, marketing returns, market share, buyers.', CSO: 'Sales vs target, trade spend, distribution, channel stock.', COO: 'Service levels, costs, quality and safety, inventory.' };
function openPicker() { $('#picks').innerHTML = Object.entries(ROLES).map(([k, v]) => `<button class="pick ${k === state.role && state.chosen ? 'cur' : ''}" data-role="${k}"><b>${v.label}</b><span>${ROLE_INFO[k]}</span></button>`).join(''); $('#picker').hidden = false; ($('#picks .cur') || $('#picks .pick')).focus(); }
function chooseRole(r) {
  $('#picker').hidden = true; if (r === state.role && state.chosen) return;
  state.chosen = true; state.role = r; state.period = ROLES[r].period; state.actFilter = 'Open'; state.actPage = 0; state.openAct = null; if (!SHORT.includes(state.period) && state.comp === 'M') state.comp = 'T';
  try { localStorage.setItem('pulse-role', r); } catch (e) { }
  closePanel(); $('#home').classList.add('loading'); $('#loader').hidden = false; $('#loader-t').textContent = `Loading the ${ROLES[r].label} view…`; syncControls();
  setTimeout(() => { $('#loader').hidden = true; renderHome(); $('#home').classList.remove('loading'); }, 650);
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const t = e.target;
  if (!t.closest('.menu-wrap')) closeMenus();
  if (!t.closest('.pop-wrap')) { $('#period-pop').hidden = true; $('#period-btn').setAttribute('aria-expanded', 'false'); }
  const g = (s) => t.closest(s);
  const ga = g('[data-goact]'); if (ga) { const id = ga.dataset.goact; state.actFilter = 'Open'; if (id) { const list = actionsList().filter(a => a.status !== 'Done'), i = list.findIndex(a => a.id === id); state.actPage = Math.max(0, Math.floor(i / 5)); state.openAct = id; } $('#acts').innerHTML = actionsView(); const row = id ? [...document.querySelectorAll('#acts .arow-wrap')].find(r => r.querySelector(`[data-exp="${CSS.escape(id)}"]`)) : $('#acts'); (row || $('#acts')).scrollIntoView({ behavior: 'smooth', block: 'center' }); if (row && id) { row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); } return; }
  if (g('[data-demo]')) { demoStart(); return; }
  const im = g('[data-iss-more]'); if (im) { const hid = document.querySelector('.iss[data-more][hidden]'); document.querySelectorAll('.iss[data-more]').forEach(x => x.hidden = !hid); im.textContent = hid ? 'Show fewer' : `Show ${document.querySelectorAll('.iss[data-more]').length} more issues`; return; }
  if (g('[data-demo-next]')) { demoNext(); return; }
  if (g('[data-demo-exit]')) { demoExit(); return; }
  if (g('#demo-send')) { if (demoAt === 3) demoNext(); else askSend(); return; }
  if (g('#period-btn')) { const p = $('#period-pop'); p.hidden = !p.hidden; $('#period-btn').setAttribute('aria-expanded', !p.hidden); return; }
  if (g('#view-btn')) { openPicker(); return; }
  const pk = g('[data-role]'); if (pk) { chooseRole(pk.dataset.role); return; }
  const op = g('[data-open]'); if (op && !g('#band')) { const id = op.dataset.open; if (OPEN === id && !$('#band').hidden && !op.dataset.then) closePanel(); else { if (OPEN !== id) PF = {}; openCard(id); if (op.dataset.then) goDeeper(() => openCFO(op.dataset.then)); } return; }
  const w = g('[data-watch]'); if (w) { const ws = JSON.parse($('#watch-data').textContent)[+w.dataset.watch]; openCard(ws.go.card, ws.go.f || {}); return; }
  if (g('#band-close')) { closePanel(); return; }
  const cr = g('[data-crumb]'); if (cr) { const n = +cr.dataset.crumb; if (n === 0) openCard(OPEN); else { drill.stack = drill.stack.slice(0, n + 1); paintBand(); } return; }
  if (g('[data-bookmark]')) { addBookmark(null); return; }
  const bc = g('[data-bm-card]'); if (bc) { const cc = bc.closest('.cc'), all = [...document.querySelectorAll('#band-body .cc')]; addBookmark({ i: all.indexOf(cc), h: (cc.querySelector('h3') || {}).textContent || '' }); return; }
  if (g('[data-share]')) { shareLink(); return; }
  if (g('[data-export]')) { exportView(); return; }
  if (g('[data-bm-all]')) { openWatchAll(); return; }
  if (g('[data-panel-action]')) { const lv = drill.stack[drill.stack.length - 1]; $('#acts').scrollIntoView({ behavior: 'smooth', block: 'start' }); newActionForm({ title: 'Follow up: ' + (lv.title || '').split(/[,;:]/)[0], issue: CARD_DEF[OPEN][0], why: lv.title, f: { ...PF } }); return; }
  const rg = g('[data-rgm]'); if (rg) { goDeeper(() => openRgm(rg.dataset.rgm)); return; }
  const ra = g('[data-rgm-action]'); if (ra) { const r = RGM[ra.dataset.rgmAction].alias ? RGM[RGM[ra.dataset.rgmAction].alias] : RGM[ra.dataset.rgmAction]; $('#acts').scrollIntoView({ behavior: 'smooth', block: 'start' }); newActionForm({ title: r.rows.find(x => /recommended/i.test(x[0])) ? 'Switch to: ' + r.rows.find(x => /recommended/i.test(x[0]))[0].replace(/ \(recommended\)/i, '') : r.title, issue: 'RGM check · ' + r.title, why: r.head, f: { ...PF } }); return; }
  if (g('[data-pf-reset]')) { PF = {}; openCard(OPEN, {}); return; }
  const pin = g('[data-pin]'); if (pin) { const b = BM.find(x => x.id === pin.dataset.pin); if (b) { closeModal(); restoreView(b.v); } return; }
  const up = g('[data-unpin]'); if (up) { BM = BM.filter(x => x.id !== up.dataset.unpin); saveBM(); renderPins(); if (!$('#modal').hidden) openWatchAll(); toast('Removed from your watchlist'); return; }
  const af = g('[data-af]'); if (af) { state.actFilter = af.dataset.af; state.actPage = 0; $('#acts').innerHTML = actionsView(); return; }
  const pg = g('[data-page]'); if (pg && !pg.disabled) { state.actPage = +pg.dataset.page; const a = $('#acts'); a.classList.remove('pg-in'); a.innerHTML = actionsView(); void a.offsetWidth; a.classList.add('pg-in'); $('#pg-live').textContent = 'Page ' + (state.actPage + 1); return; }
  const ex_ = g('[data-exp]'); if (ex_) { state.openAct = state.openAct === ex_.dataset.exp ? null : ex_.dataset.exp; $('#acts').innerHTML = actionsView(); return; }
  if (g('[data-new-act]')) { newActionForm(); return; }
  if (g('[data-cancel-new]')) { $('#new-form').hidden = true; return; }
  const mn = g('[data-menu]'); if (mn) { menu(mn.dataset.menu, mn); return; }
  const st = g('[data-step]'); if (st) { const [id, s] = st.dataset.step.split('|'); ACTS[id] = { ...(ACTS[id] || {}), status: s, ...(s === 'Assigned' ? { assigned: TODAY } : {}) }; saveNew(); closeMenus(); $('#acts').innerHTML = actionsView(); renderSummaryOnly(); toast(s === 'Done' ? 'Marked done' : 'Status: ' + s); return; }
  const m = g('[data-mail]'); if (m) { closeMenus(); mailModal(findAct(m.dataset.mail)); return; }
  const mt = g('[data-meet]'); if (mt) { closeMenus(); meetModal(findAct(mt.dataset.meet)); return; }
  const asg = g('[data-assign]'); if (asg) { closeMenus(); assignModal(findAct(asg.dataset.assign)); return; }
  const see = g('[data-see]'); if (see) { closeMenus(); const a = findAct(see.dataset.see); openCard(cardFor((window.__ex.find(x => x.id === a.id) || { d: {} }).d.cls), a.f || {}); return; }
  const cp = g('[data-copy]'); if (cp) { const txt = decodeURIComponent(cp.dataset.copy); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Copied')).catch(() => toast('Select the text and copy it')); return; }
  if (g('[data-close]') || t.id === 'modal') { closeModal(); return; }
});
document.addEventListener('change', e => { const s = e.target.closest('[data-pf]'); if (s) { const k = s.dataset.pf; if (s.value) PF[k] = [s.value]; else delete PF[k]; openCard(OPEN, PF); } });
document.addEventListener('submit', e => { if (e.target.id === 'ask-panel') { e.preventDefault(); runAsk($('#ask-panel-in').value, true); } if (e.target.id === 'ask-global') { e.preventDefault(); runAsk($('#ask-global-in').value, false); $('#ask-global-in').blur(); } });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#modal').hidden) closeModal(); else if (!$('#coach').hidden) demoExit(); else if (document.querySelector('.menu')) closeMenus(); else if (!$('#picker').hidden && state.chosen) $('#picker').hidden = true; else if (!$('#band').hidden) closePanel(); }
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('#ask-global-in').focus(); }
});
document.addEventListener('mouseover', e => { const i = e.target.closest('[data-def]'); if (!i) return; const d = DEF[i.dataset.def]; if (!d) return; const tp = tip(); tp.innerHTML = `<div class="th">${d[0]}</div>${d[1]}${d[2] ? `<div class="f">Formula: ${d[2]}</div>` : ''}`; tp.hidden = false; const r = i.getBoundingClientRect(); tp.style.left = Math.max(8, Math.min(innerWidth - 310, r.left)) + 'px'; tp.style.top = (r.bottom + 6) + 'px'; });
document.addEventListener('mouseout', e => { if (e.target.closest('[data-def]')) hideTip(); });
function renderSummaryOnly() { $('#summary').innerHTML = summaryView(window.__ex || []); }

/* ---------- boot ---------- */
let stored = null; try { stored = localStorage.getItem('pulse-role'); } catch (e) { }
const hm = /^#v=/.test(location.hash) ? null : (location.hash || '').slice(1).toUpperCase().match(/^(CEO|CFO|CMO|CSO|COO)(?:-([A-Z]+))?$/);
if (hm) stored = hm[1];
if (stored && ROLES[stored]) { state.role = stored; state.period = ROLES[stored].period; state.chosen = true; }
syncControls(); renderHome();
if (hm && hm[2] && CARD_DEF[hm[2]] && ROLE_CARDS[state.role].includes(hm[2])) requestAnimationFrame(() => openCard(hm[2]));
if (!state.chosen) openPicker();
const vm = (location.hash || '').match(/^#v=([\w-]+)$/);
if (vm) { try { restoreView(JSON.parse(b64.dec(vm[1]))); } catch (e) { toast('That link could not be opened'); } }
})();
