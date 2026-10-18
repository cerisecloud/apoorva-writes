/* Pulse: executive dashboard application logic (views, exceptions engine, charts, drill panel). Synthetic data only. */
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
const pcn = (v, d = 0) => (Math.abs(v) * 100).toFixed(d) + '%';
const sBps = v => sgn(v, Math.round(Math.abs(v)) + ' bps');
const s$ = v => sgn(v, fmt$(Math.abs(v)));
function dv(v, kind, good, suffix) {   // ▲ (+x) / ▼ (−x), coloured by whether the move is good for the business
  if (v == null || !isFinite(v)) return '<span class="dv neu">n/a</span>';
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
  LW: { label: 'Last week', w0: CW, w1: CW, desc: 'Week ' + CW },
  MTD: { label: 'MTD', w0: mtd[0], w1: CW, desc: 'October so far, weeks ' + mtd[0] + ' to ' + CW },
  LM: { label: 'Last month', w0: lastM[0], w1: lastM[lastM.length - 1], desc: 'September, weeks ' + lastM[0] + ' to ' + lastM[lastM.length - 1] },
  R4W: { label: '4 weeks', w0: CW - 3, w1: CW, desc: 'Weeks ' + (CW - 3) + ' to ' + CW },
  QTD: { label: 'QTD', w0: 40, w1: CW, desc: 'Q4 so far, weeks 40 to ' + CW },
  YTD: { label: 'YTD', w0: 1, w1: CW, desc: 'Weeks 1 to ' + CW },
  FY: { label: 'FY outlook', w0: 1, w1: 52, desc: 'Weeks 1 to ' + CW + ' actual, ' + (CW + 1) + ' to 52 forecast' },
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
    if (state.period === 'YTD') { P.w0 = FISCAL_START; P.desc = 'Fiscal year so far, from April (weeks ' + FISCAL_START + ' to ' + CW + ')'; }
    if (state.period === 'QTD') P.desc = 'Fiscal Q3 so far, weeks 40 to ' + CW;
    if (state.period === 'FY') P.desc = 'Fiscal year, April to March, actual plus forecast';
  }
  P.wa = Math.min(P.w1, CW);   // last actual week in window
  return P;
}
const compShort = () => ({ T: 'vs plan', E: 'vs latest estimate', L: 'vs last year', M: 'vs last month' })[state.comp];
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
  p.push(cs && cs.length === 1 ? K.CMAP[cs[0]].name : cs && cs.length < K.COUNTRIES.length ? (K.REGIONS.find(r => r.countries.length === cs.length && r.countries.every(x => cs.includes(x))) || { id: cs.length + ' countries' }).id : 'all markets');
  if (f.ch && f.ch.length === 1) p.push(K.CHMAP[f.ch[0]].name);
  return p[0] + ' in ' + p[1] + (p[2] ? ', ' + p[2].toLowerCase() : '');
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
      d.label = 'Competitor price cut'; d.owner = 'CMO + ' + (c ? K.CMAP[c].name : '') + ' Sales';
      d.chain = [`${comp} price ${sPct(cpi - 1, 0)}`, `our ${chName.toLowerCase()} volume ${sPct(child.r4, 0)}`, `share ${sPts(shChg)}`, `net sales ${s$(d.nsGap)}`];
      d.cause = `${comp} cut its price in ${chName.toLowerCase()} and we are losing share, even though the category grew ${pcn(mktG)}.`;
      d.action = `Answer ${comp} in ${chName.toLowerCase()} with a price-matched pack and better shelf space.`;
      d.value = Math.abs(d.fyCm) * .5; break;
    }
    case 'buying': {
      const trA = S.A.tr / S.A.gs, trC = S.C.tr / S.C.gs, gmA = (S.A.ns - S.A.cogs) / S.A.ns, gmL = (S.L.ns - S.L.cogs) / S.L.ns;
      const promo = K.PROMOS.filter(p => p.b === b && p.c === c && p.roi != null).sort((x, y) => x.roi - y.roi)[0];
      d.label = 'Growth bought with promotions'; d.owner = 'CFO (RGM)';
      d.chain = [`trade spend ${pct1(trA)} vs ${pct1(trC)} plan`, `volume ${sPct(S.A.vol / S.L.vol - 1, 0)} vs last year`, `net sales ${sPct(vr(S.A.ns, S.L.ns))} vs last year`, `gross margin ${sBps((gmA - gmL) * 1e4)} vs last year`];
      d.cause = `Sales are growing because of deep promotions, and they cost more margin than they bring in.${promo ? ` The worst one, "${promo.name}", earns back only ${Math.round(promo.roi * 100)} cents for every dollar it costs.` : ''}`;
      d.action = `Cut promotion depth back to plan and stop events that earn back less than 80 cents per dollar.`;
      d.value = Math.abs(get('trade')) * .6; break;
    }
    case 'cost': {
      d.label = 'Rising input costs'; d.owner = 'CFO + Procurement';
      const cc = S.A.cogs / S.A.vol / (S.C.cogs / S.C.vol) - 1;
      d.chain = [`${K.BMAP[b || 'oats'].mat.toLowerCase()} cost ${sPct(.18, 0)}`, `cost per case ${sPct(cc, 0)} vs ${compName()}`, `price increase delayed at key retailers`, `contribution margin ${s$(d.cmGap)}`];
      d.cause = `The cost of ${K.BMAP[b || 'oats'].mat.toLowerCase()} is up 18% and our price increase is stuck at some retailers. Margin is ${fmt$(Math.abs(d.cmGap))} ${d.cmGap < 0 ? 'below' : 'above'} ${compName()}.`;
      d.action = `Finish the price increase at the delayed retailers and lock in oat prices into next year.`;
      d.value = Math.abs(d.fyCm) * .5; break;
    }
    case 'supply': {
      const breach = c ? retailersOf(c).filter(r => r.c === 'ID' && b === 'orchard' && (r.id === 'pp' || r.id === 'hn')) : [];
      d.label = 'Not enough stock to supply'; d.owner = 'COO';
      d.chain = [`port disruption`, `fill rate ${pct1(fill4).replace('.0', '')}`, `lost sales ${fmt$(agg(f, 'A', 35, CW).lost)}`, `${breach.length} retailers below the on-time, in-full target`];
      d.cause = `Shoppers want it, but late inbound shipments mean we can't supply enough, and retailer contracts are at risk.`;
      d.action = `Rush the inbound shipments and get fill rate back to 95% within 3 weeks.`;
      d.value = agg(f, 'A', 35, CW).lost * 1.5; break;
    }
    case 'market': {
      d.label = 'Category is shrinking'; d.owner = 'CFO + ' + (c ? K.CMAP[c].name : '') + ' GM';
      d.chain = [`category ${sPct(mktG)}`, `${B} ${sPct(vr(S.A.ns, S.L.ns))} vs last year`, `share ${sPts(shChg)}`, `market-driven miss`];
      d.cause = `The whole category is shrinking and we are holding or gaining share. The target is probably too high for this market.`;
      d.action = `Lower the target for this market and protect share without deeper promotions.`;
      d.value = 0; break;
    }
    case 'opportunity': {
      const s0 = K.SERIES.find(s => s.b === b && s.c === c && s.ch === (child && child.ch)), days = b && c ? K.invDays(c, b, CW) : null;
      d.label = 'Opportunity'; d.owner = 'CMO + COO';
      d.chain = [`${chName} sales ${sPct(child.r4, 0)} vs last year`, s0 ? `every $1 of marketing returns ${s0.romi.toFixed(1)}x` : `share ${sPts(shChg)}`, days ? `but only ${days.toFixed(0)} days of stock vs ${K.INV_TARGET_DAYS} target` : `FY ${s$(d.fyNs)}`];
      d.cause = `${chName} demand is strong and marketing is paying off. Stock could run short before the seasonal peak, which would cap the upside.`;
      d.action = `Move marketing money toward ${chName.toLowerCase()} and secure stock before the peak.`;
      d.value = Math.abs(d.fyNs) * .3; break;
    }
    default: {
      d.label = 'Selling fewer cases'; d.owner = 'Chief Sales Officer';
      d.chain = [`volume ${sPct(S.A.vol / S.C.vol - 1)}`, `share ${sPts(shChg)}`, `net sales ${s$(d.nsGap)}`];
      d.cause = `Probably weaker distribution or in-store execution. Check availability and whether promotions are running as planned.`;
      d.action = `Go through distribution, out-of-stocks and in-store execution with the country team.`;
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
    out.push({ id: b + '|' + c, f, S, d, title: K.BMAP[b].name + ' in ' + K.CMAP[c].name });
  }
  // merge the same cause on the same brand across countries into one parent (e.g. oat inflation)
  const merged = [];
  for (const e of out) {
    const twin = merged.find(m => m.d.cls === e.d.cls && e.d.cls === 'cost' && m.f.b[0] === e.f.b[0]);
    if (twin) { twin.children = (twin.children || [twin.f.c[0]]).concat(e.f.c[0]); continue; }
    merged.push(e);
  }
  for (const m of merged) if (m.children) {
    m.f = sub(base, { b: m.f.b, c: m.children }); m.S = slice(m.f, P); const d = diagnose(m.f, m.S, P) || m.d; d.label = m.d.label; m.d = { ...m.d, ...d, cls: 'cost', label: 'Rising input costs', owner: 'CFO + Procurement', chain: m.d.chain.map((x, i) => i === 3 ? `contribution margin ${s$(d.cmGap)}` : x), sev: d.sev === 'opp' ? 'warn' : m.d.sev };
    m.title = K.BMAP[m.f.b[0]].name + ' in ' + (m.children.length === countriesOf(base).length && m.children.length > 2 ? 'all markets' : m.children.map(c => K.CMAP[c].name).join(' and ')); m.id = m.f.b[0] + '|' + m.children.join('+');
  }
  // channel loading: country x channel where channel cover is well above normal
  for (const c of countriesOf(base)) for (const ch of channelsOf(sub(base, { c: [c] }))) {
    const f = sub(base, { c: [c], ch: [ch] }), w = agg(f, 'A', CW, CW), cover = w.stock / w.cons, normal = K.CHMAP[ch].cover;
    if (cover > normal * 1.3) {
      const S = slice(f, P), r4 = agg(f, 'A', CW - 3, CW);
      out.length; merged.push({ id: c + '|' + ch, f, S, title: K.CHMAP[ch].name + ' in ' + K.CMAP[c].name, d: {
        cls: 'loading', label: 'Too much stock in the channel', owner: 'Chief Sales Officer', sev: 'warn', dir: 'worse', cover, normal, nsGap: S.A.ns - S.C.ns, cmGap: 0, fyNs: S.FA.ns - S.FT.ns, fyCm: 0, br: bridge(f, P, 'cm'),
        chain: [`shipments ${pcn(r4.vol / r4.cons - 1)} above what shoppers bought`, `${cover.toFixed(1)} weeks of stock in the channel vs ${normal} normally`, `${fmt$(K.NEAR_EXPIRY.channel[c] || 0)} of stock close to expiry`],
        cause: 'We have shipped more than shoppers are buying, after a distributor incentive pushed stock in. Expect lower orders and more returns in the coming weeks.',
        action: 'Stop the distributor push and let stock settle back to normal.',
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
  svg.querySelectorAll('.mk').forEach(n => { const m = o.markers[+n.dataset.mk]; n.addEventListener('mousemove', e => showTip(e, `<div class="th">Week ${m.w}, outside event</div>${esc(m.text)}`)); n.addEventListener('mouseleave', hideTip); });
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
    n.addEventListener('mousemove', e => showTip(e, `<div class="th">${esc(it.t === 'tot' ? it.l : it.full + ' effect')}</div><div class="num">${it.t === 'tot' ? F(it.v) : SF(it.v)}${opts.pctBase && it.t === 'd' ? ', ' + (it.v >= 0 ? '+' : MINUS) + Math.abs(it.v / opts.pctBase * 100).toFixed(1) + '% ' + (opts.pctLabel || 'of net sales') : ''}</div>${it.t === 'd' && opts.onClick ? '<div class="f">Click to see what is behind it</div>' : ''}`));
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
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="fx" role="img" aria-label="Estimate vs guidance and consensus"><rect x="${X(lo)}" y="14" width="${X(hi) - X(lo)}" height="12" rx="6" fill="var(--surface-3)"/><text x="${(X(lo) + X(hi)) / 2}" y="10" text-anchor="middle" class="ax">Guidance ${fmt(lo)} to ${fmt(hi)}</text><line x1="${X(cons)}" x2="${X(cons)}" y1="10" y2="30" stroke="var(--ink-2)" stroke-width="2"/><text x="${X(cons)}" y="42" text-anchor="middle" class="ax">Consensus ${fmt(cons)}</text><circle cx="${X(est)}" cy="20" r="6" fill="var(--crit)" stroke="#fff" stroke-width="2"/><text x="${X(est)}" y="42" text-anchor="${X(est) < 60 ? 'start' : 'middle'}" class="ax strong">Us ${fmt(est)}</text></svg>`;
}
function spark(a, c) {
  const all = a.concat(c || []).filter(isFinite); let lo = Math.min(...all), hi = Math.max(...all); if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const X = i => 2 + i / (a.length - 1) * 196, Y = v => 26 - (v - lo) / (hi - lo) * 22, p = arr => arr.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join('');
  return `<svg class="spark" viewBox="0 0 200 28" preserveAspectRatio="none" aria-hidden="true">${c ? `<path d="${p(c)}" fill="none" stroke="#9aa1aa" stroke-width="1.2" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>` : ''}<path d="${p(a)} L${X(a.length - 1)} 28 L2 28Z" fill="var(--s1)" opacity=".08"/><path d="${p(a)}" fill="none" stroke="var(--s1)" stroke-width="1.8" vector-effect="non-scaling-stroke"/></svg>`;
}

/* ================= definitions (i) ================= */
const DEF = {
  AI: ['Written by AI', 'Pulse wrote this from the numbers on the page. This prototype uses simple rules, not a real AI model. The causes are likely, not proven.', ''],
  Sh1: ['Net sales', 'What we keep after discounts, trade spend and returns.', 'Gross sales − trade spend − returns'],
  Sh2: ['Organic growth', 'How much the existing business grew against last year, leaving out currency and acquisitions. It is volume growth plus price and mix.', 'Net sales ÷ last year net sales − 1'],
  Sh3: ['Operating profit', 'Profit after all operating costs, for the whole company. It cannot be split by brand or country without dividing up overheads.', 'Contribution margin − overheads'],
  Sh4: ['Contribution margin', 'What each brand and market earns before shared overheads. This is the profit figure that follows your filters.', 'Gross margin − marketing − delivery costs'],
  Sh5: ['FY outlook', 'Where we expect the full year to end: actuals so far plus the forecast for the weeks left.', 'Year to date actual + forecast for weeks 42 to 52'],
  Sh6: ['Value market share', 'Our share of what shoppers spend in the category, from retail tracking data, with our rank and the change since last year.', 'Our sales value ÷ category sales value'],
  Sh7: ['Share price vs peers', 'How our share price has moved this year compared with other consumer goods companies. Company level only.', 'Our % change − peer % change'],
  C1: ['Contribution to growth', 'How much each brand and market added to growth or took away from it, against last year. The pieces add up to total growth.', 'Change in net sales of the slice ÷ total net sales last year'],
  C2: ['Growth vs market', 'Our growth against the category growth in each country. If we are ahead, we are gaining share.', 'Our growth − market growth'],
  C15: ['EPS outlook', 'Earnings per share we expect for the full year, against our plan, what we told investors and what analysts expect.', '(Operating profit − interest) × (1 − tax rate) ÷ shares'],
  C4: ['Total shareholder return', 'Share price change plus dividends so far this year, against peers. Company level only.', '(Price change + dividends) ÷ starting price'],
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
    tip: w => `<div class="th">Week ${w}${w > CW ? ' (forecast)' : ''}</div>${trow(w > CW ? 'Forecast' : 'Actual', fmt$(W.a[w]))}${trow('Plan', fmt$(W.t[w]) + ' ' + sPct(vr(W.a[w], W.t[w])))}${trow('Last year', fmt$(W.l[w]) + ' ' + sPct(vr(W.a[w], W.l[w])))}` });
}
const trow = (a, b) => `<div class="tr"><span>${a}</span><b class="num">${b}</b></div>`;
const LEG_TREND = '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>Actual</span><span><i class="dash" style="border-color:var(--s1)"></i>Forecast</span><span><i class="dash"></i>Plan</span><span><i class="dash light"></i>Last year</span><span><i class="dot" style="background:var(--opp)"></i>Outside event</span></div>';
function breakdownTable(rows, dims) {
  return `<div class="tbl-wrap"><table class="t"><thead><tr><th>${dims}</th><th class="r">Net sales</th><th class="r">${compShort()}</th><th class="r">vs last year</th><th class="r">Margin ${compShort()}</th></tr></thead><tbody>${rows.map(r => `<tr ${r.slice ? `class="click" tabindex="0" data-slice='${JSON.stringify(r.slice)}'` : ''}><td>${esc(r.label)}</td><td class="r num">${fmt$(r.a.ns)}</td><td class="r num">${dv(vr(r.a.ns, r.c.ns), 'pct', 1)}</td><td class="r num">${sPct(vr(r.a.ns, r.l.ns))}</td><td class="r num">${r.c.cm != null ? dv(vr(r.a.cm, r.c.cm), 'pct', 1) : ''}</td></tr>`).join('')}</tbody></table></div>`;
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
  blocks.push({ h: 'Contribution margin, ' + compName() + ' to actual', id: 'b-wf', foot: 'Click a bar to see which brands and markets are behind it. The axis does not start at zero.' });
  const sig = signalsFor(f);
  blocks.push({ h: 'Weekly net sales', id: 'b-tr', html: LEG_TREND });
  const tabs = [];
  if (!(f.ch && f.ch.length === 1) && channelsOf(f).length > 1) tabs.push(['By channel', breakdownTable(rowsBy(f, P, 'ch'), 'Channel')]);
  if (!(f.c && f.c.length === 1)) tabs.push(['By country', breakdownTable(rowsBy(f, P, 'c'), 'Country')]);
  if (!(f.b && f.b.length === 1)) tabs.push(['By brand', breakdownTable(rowsBy(f, P, 'b'), 'Brand')]);
  if (f.b && f.b.length === 1) { const B = K.BMAP[f.b[0]]; tabs.push(['By SKU', breakdownTable(splitRows(B.skus.map(s => s[0]), B.skus.map(s => s[1]), 'sku' + B.id + (f.c || []).join(), A, C, L), 'SKU') + '<p class="foot">These SKU numbers are illustrative.</p>']); }
  if (f.c && f.c.length === 1) { const Cc = K.CMAP[f.c[0]]; tabs.push(['By city', breakdownTable(splitRows(Cc.cities, Cc.cityW, 'city' + Cc.id + (f.b || []).join(), A, C, L), 'City') + '<p class="foot">These city numbers are illustrative.</p>']);
    const rs = K.RETAILERS.filter(r => r.c === Cc.id && (!f.ch || f.ch.includes(r.ch)));
    if (rs.length) tabs.push(['By retailer', breakdownTable(rs.map(r => { const ff = sub(f, { ch: [r.ch] }), a = agg(ff, 'A', P.w0, P.w1), c = compAgg(ff, P), l = agg(ff, 'L', P.w0, P.w1), k = r.share; return { label: r.name + ' (' + K.CHMAP[r.ch].name.toLowerCase() + ')', a: { ns: a.ns * k, cm: a.cm * k }, c: { ns: c.ns * k, cm: c.cm * k }, l: { ns: l.ns * k } }; }), 'Retailer') + '<p class="foot">Retailer numbers use each retailer\'s share of its channel (illustrative).</p>']); }
  if (tabs.length) blocks.push({ h: 'Breakdown', html: `<div class="seg sm" id="b-tabs">${tabs.map((t, i) => `<button type="button" data-i="${i}" aria-pressed="${i === 0}">${t[0]}</button>`).join('')}</div><div id="b-tab"></div>` });
  if (sig.length) blocks.push({ h: 'What happened outside', html: sig.map(x => `<div class="sig"><span class="wk num">Wk ${x.w}</span><span>${esc(x.text)}</span><span class="pill meta">${esc(x.type)}</span></div>`).join('') });
  const after = () => {
    waterfall($('#b-wf'), br, { onClick: it => openContrib(f, P, it.k, it.full) });
    nsTrend('b-tr', f, P, sig.map(s => ({ w: s.w, text: s.text })))();
    if (tabs.length) { const show = i => { $('#b-tab').innerHTML = tabs[i][1]; $('#b-tabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.i === i)); $('#b-tab').querySelectorAll('[data-slice]').forEach(r => { const go = () => openSlice(JSON.parse(r.dataset.slice)); r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter') go(); }; }); }; show(0); $('#b-tabs').onclick = e => { const b = e.target.closest('button'); if (b) show(+b.dataset.i); }; }
  };
  return { blocks, after, A, C, L, br };
}
function diagHtml(d, owned, rankNote) {
  if (!d) return '<p class="muted">Nothing is off track here.</p>';
  return `<dl class="diag"><dt>What's happening</dt><dd>${sevPill(d.sev)} ${dirPill(d.dir)} ${aiTag} <b>${esc(d.cause)}</b></dd><dt>The numbers</dt><dd>${d.chain.map(esc).join('; ')}</dd><dt>What to do</dt><dd>${esc(d.action)}</dd><dt>Owner</dt><dd>${esc(d.owner)}${owned ? ` <span class="pill own">${owned.status}: ${owned.note}</span>` : ''}</dd>${rankNote ? `<dt>Why it is near the top</dt><dd class="muted">${rankNote}</dd>` : ''}</dl>`;
}
function gapStats(S, d, P) {
  return stats([['Sales gap so far', s$(S.A.ns - S.C.ns), `${P.label} ${compShort()}`], ['Margin gap so far', s$(d ? d.cmGap : S.A.cm - S.C.cm), `${P.label} ${compShort()}`], ['Full-year sales gap', s$(S.FA.ns - S.FT.ns), 'vs plan, if nothing changes'], ['We could win back', d && d.value ? 'about ' + fmt$(d.value) : d && d.cls === 'market' ? 'Lower the target' : 'n/a', 'rough estimate']]);
}
function openSlice(f, reset) {
  const P = win(), S = slice(f, P), d = diagnose(f, S, P), sb = sliceBlocks(f, P);
  openLevel({ crumb: nameOf(f), title: nameOf(f), insight: null, blocks: [{ html: diagHtml(d) }, { html: gapStats(S, d, P) }, ...sb.blocks], after: sb.after, focus: f }, reset);
}
function openEx(id) {
  const e = (window.__ex || []).find(x => x.id === id); if (!e) return;
  const P = win(), d = e.d, sb = sliceBlocks(e.f, P);
  const note = `It ranks here because of the full-year gap to plan if nothing changes: ${s$(d.fyNs)} in sales${d.fyCm ? ' and ' + s$(d.fyCm) + ' in margin' : ''}.${d.dir === 'worse' ? ' The gap has widened over the last 4 weeks.' : ''}`;
  openLevel({ crumb: e.title, title: e.title, insight: null, blocks: [{ html: diagHtml(d, e.owned, note) }, { html: gapStats(e.S, d, P) }, ...sb.blocks], after: sb.after, focus: e.f }, true);
}
function openContrib(f, P, key, label, kind) {
  kind = kind || 'cm';
  const rows = [];
  for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const ff = sub(f, { b: [b], c: [c] }); if (!has(ff)) continue; const br = bridge(ff, P, kind); const it = br.items.find(i => i[2] === key); if (!it) continue; rows.push({ label: K.BMAP[b].name + ' in ' + K.CMAP[c].name, v: key === 'mix' ? br.perSeriesVol - br.items[0][1] : it[1], slice: ff }); }
  rows.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)); const top = rows.slice(0, 8);
  const expl = { vol: 'Selling more or fewer cases, valued at the planned margin per case.', mix: 'Selling more through higher-margin or lower-margin channels.', price: 'The prices we actually got against plan, on the cases we sold.', trade: 'Discounts, trade spend and returns against plan. A negative number means deeper discounting.', cogs: 'What it cost to make each case against plan (ingredients, packaging, production).', dist: 'What it cost to store and deliver each case against plan.', ap: 'Marketing spend against budget. A negative number means we overspent.' }[key];
  openLevel({ crumb: label, title: label + ' effect', insight: expl, blocks: [{ h: 'Biggest contributors', html: divBars(top.map(r => ({ label: r.label, v: r.v })), v => s$(v), { click: true }) }], after: () => { $('#band-body').querySelectorAll('.dbar.click').forEach(n => { const go = () => openSlice(top[+n.dataset.i].slice); n.onclick = go; n.onkeydown = e => { if (e.key === 'Enter') go(); }; }); } });
}
function openTile(id) {
  if (/^F\d/.test(id)) return openCFO(id);
  const f = filter(), P = win(), D = stripData();
  if (id === 'Sh1' || id === 'C1') {
    const rows = []; const Ltot = agg(f, 'L', P.w0, P.w1).ns;
    for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const ff = sub(f, { b: [b], c: [c] }); if (!has(ff)) continue; const a = agg(ff, 'A', P.w0, P.w1), cc = compAgg(ff, P), l = agg(ff, 'L', P.w0, P.w1); rows.push({ label: K.BMAP[b].name + ' in ' + K.CMAP[c].name, gap: a.ns - cc.ns, contrib: (a.ns - l.ns) / Ltot * 100, slice: ff }); }
    const isGap = id === 'Sh1'; rows.sort((a, b) => isGap ? a.gap - b.gap : b.contrib - a.contrib);
    const shown = isGap ? rows.slice(0, 4).concat(rows.slice(-3)) : rows.slice(0, 5).concat(rows.slice(-3));
    openLevel({ crumb: isGap ? 'Net sales' : 'Contribution to growth', title: isGap ? 'Net sales ' + compShort() : 'Contribution to growth vs last year', insight: isGap ? `${P.label} net sales are ${fmt$(D.A.ns)}, ${pcn(vr(D.A.ns, D.C.ns), 1)} ${D.A.ns >= D.C.ns ? 'above' : 'below'} ${compName()}. The biggest gap is ${rows[0].label} ${s$(rows[0].gap)} and the biggest beat is ${rows[rows.length - 1].label} ${s$(rows[rows.length - 1].gap)}.` : `Net sales ${D.A.ns >= D.L.ns ? 'grew' : 'fell'} ${pcn(D.A.ns / D.L.ns - 1, 1)} on last year. ${rows[0].label} added the most and ${rows[rows.length - 1].label} took away the most.`,
      blocks: [{ h: 'Weekly net sales', id: 'b-tr', html: LEG_TREND }, { h: isGap ? 'Where the gap is' : 'What is adding to growth and what is taking away', html: divBars(shown.map(r => ({ label: r.label, v: isGap ? r.gap : r.contrib })), isGap ? (v => s$(v)) : (v => sPts(v).replace(' pts', '')), { click: true }), foot: 'Click a bar to dig into it.' }],
      after: () => { nsTrend('b-tr', f, P)(); $('#band-body').querySelectorAll('.dbar.click').forEach(n => { const go = () => openSlice(shown[+n.dataset.i].slice); n.onclick = go; n.onkeydown = e => { if (e.key === 'Enter') go(); }; }); } }, true);
  } else if (id === 'Sh2') {
    const br = bridge(f, { ...P, w0: P.w0, w1: P.w1, wa: P.wa }, 'ns');
    const saved = state.comp; state.comp = 'L'; const brL = bridge(f, P, 'ns'); state.comp = saved;
    openLevel({ crumb: 'Organic growth', title: 'Organic growth, split into volume, price and mix', insight: `Compared with last year: volume ${s$(brL.items[0][1])}, mix ${s$(brL.items[1][1])}, price ${s$(brL.items[2][1])}, discounts and promotions ${s$(brL.items[3][1])}.`,
      blocks: [{ h: 'Net sales, last year to actual', id: 'b-wf' }, { h: 'Net sales, ' + compName() + ' to actual', id: 'b-wf2' }], after: () => { waterfall($('#b-wf'), brL, { startLabel: 'Last year', onClick: it => openContrib(f, P, it.k, it.full) }); waterfall($('#b-wf2'), br, { onClick: it => openContrib(f, P, it.k, it.full) }); } }, true);
  } else if (id === 'Sh3' || id === 'Sh4' || id === 'C15') {
    const w1 = P.w1 > CW ? NW : P.w1, A = K.finance({}, 'A', P.w0, w1), T = K.finance({}, 'T', P.w0, w1), L = K.finance({}, 'L', P.w0, w1);
    const lines = [['Net sales', 'ns'], ['Gross margin', 'gm'], ['Contribution margin', 'cm'], ['Overheads', 'overhead', -1], ['Operating profit', 'op'], ['Net profit', 'np']];
    const cascade = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Company P&amp;L, ${P.label}</th><th class="r">Actual</th><th class="r">vs plan</th><th class="r">vs last year</th></tr></thead><tbody>${lines.map(([l, k, g]) => `<tr><td>${l}</td><td class="r num"><b>${fmt$(A[k])}</b></td><td class="r num">${dv(vr(A[k], T[k]), 'pct', g || 1)}</td><td class="r num">${sPct(vr(A[k], L[k]))}</td></tr>`).join('')}<tr><td>EPS (FY outlook)</td><td class="r num"><b>$${D.fyA.eps.toFixed(2)}</b></td><td class="r num">${dv(D.fyA.eps - D.fyT.eps, 'eps', 1)}</td><td class="r num">${sPct(vr(D.fyA.eps, K.finance({}, 'L', 1, NW).eps))}</td></tr></tbody></table></div>`;
    const br = bridge(f, P, 'cm');
    openLevel({ crumb: 'Profit', title: id === 'C15' ? 'Net profit and EPS' : id === 'Sh3' ? 'Operating profit' : 'Contribution margin', insight: `Operating profit is ${pcn(vr(A.op, T.op), 1)} ${A.op >= T.op ? 'above' : 'below'} plan. Margin before overheads is ${pcn(vr(D.A.cm, D.C.cm), 1)} ${D.A.cm >= D.C.cm ? 'above' : 'below'} ${compName()}, and lower overheads are covering part of the gap.`,
      blocks: [{ h: 'Company profit and loss', html: cascade }, ...(id === 'C15' ? [{ h: 'EPS outlook against guidance and what analysts expect', html: rangePlot(K.FIN.guidance.eps[0], K.FIN.guidance.eps[1], K.FIN.consensus.eps, D.fyA.eps, v => '$' + v.toFixed(2), Math.min(DW(), 420)) + `<p class="foot">We expect EPS of $${D.fyA.eps.toFixed(2)}. That is $${(K.FIN.consensus.eps - D.fyA.eps).toFixed(2)} below what analysts expect and $${(K.FIN.guidance.eps[0] - D.fyA.eps).toFixed(2)} below the bottom of our guidance. Organic growth is heading for ${pcn(D.FA.ns / agg({}, 'L', 1, NW).ns - 1, 1)}, against ${pcn(K.FIN.consensus.organic, 1)} expected.</p>` }] : []), { h: 'Contribution margin, ' + compName() + ' to actual (follows your filters)', id: 'b-wf', foot: 'Click a bar to see what is behind it.' }],
      after: () => waterfall($('#b-wf'), br, { onClick: it => openContrib(f, P, it.k, it.full) }) }, true);
  } else if (id === 'Sh5') {
    const cumA = new Float64Array(NW + 1), cumT = new Float64Array(NW + 1), cumL = new Float64Array(NW + 1), lo = new Float64Array(NW + 1), hi = new Float64Array(NW + 1); let a = 0, t = 0, l = 0;
    for (let w = 1; w <= NW; w++) { a += agg(f, 'A', w, w).ns; t += agg(f, 'T', w, w).ns; l += agg(f, 'L', w, w).ns; cumA[w] = a; cumT[w] = t; cumL[w] = l; const u = w > CW ? (w - CW) / (NW - CW) * .02 : 0; lo[w] = a * (1 - u); hi[w] = a * (1 + u); }
    const ytdA = cumA[CW], fyT = cumT[NW], remain = NW - CW, need = (fyT - ytdA) / remain, cur = agg(f, 'A', CW - 3, CW).ns / 4;
    const rows = []; for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const ff = sub(f, { b: [b], c: [c] }); if (!has(ff)) continue; const FA = agg(ff, 'A', 1, NW), FT = agg(ff, 'T', 1, NW), sh = K.share(ff, K.MKT_LAST - 3, K.MKT_LAST), s0 = K.SERIES.filter(s => s.b === b && s.c === c), romi = s0.reduce((x, s) => x + s.romi, 0) / s0.length, days = K.invDays(c, b, CW); rows.push({ label: K.BMAP[b].name.split(' ')[0] + ' in ' + K.CMAP[c].name, gap: FA.ns - FT.ns, mom: sh.ourGrowth - sh.mktGrowth, romi, days, slice: ff }); }
    rows.sort((x, y) => x.gap - y.gap); rows.splice(5, Math.max(0, rows.length - 10));
    const icon = (ok, t) => `<span class="hr ${ok ? 'ok' : 'no'}" title="${t}">${ok ? '●' : '○'}</span>`;
    const catch_ = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Brand and country</th><th class="r">Full-year gap</th><th class="c">Momentum</th><th class="c">Marketing return</th><th class="c">Stock cover</th></tr></thead><tbody>${rows.map(r => `<tr class="click" tabindex="0" data-slice='${JSON.stringify(r.slice)}'><td>${esc(r.label)}</td><td class="r num">${dv(r.gap, '$', 1)}</td><td class="c">${icon(r.mom > 0, 'Growing faster than market')}</td><td class="c">${icon(r.romi >= 1.5, 'Marketing return ' + r.romi.toFixed(1) + 'x')}</td><td class="c">${icon(r.days >= 15, r.days.toFixed(0) + ' days')}</td></tr>`).join('')}</tbody></table></div><p class="foot">These are the 5 biggest gaps and the 5 biggest beats. A filled dot means there is room to deliver more. An empty dot means something is holding it back: growing slower than the market, a marketing return under 1.5x, or less than 15 days of stock.</p>`;
    openLevel({ crumb: 'FY outlook', title: 'Full-year outlook and catch-up', insight: `To hit the full-year plan we need to sell ${fmt$(need)} a week for the last ${remain} weeks. We are selling ${fmt$(cur)} a week now${need > cur ? `, so that means ${pcn(need / cur - 1)} more every week` : ', so we are already ahead of that pace'}.`,
      blocks: [{ h: 'Sales so far plus forecast, against plan', id: 'b-cum', html: '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>Actual and forecast (range)</span><span><i class="dash"></i>Plan</span><span><i class="dash light"></i>Last year</span></div>' },
        { h: 'Weekly sales we need against what we sell now', html: bullet(cur, need, fmt$) }, { h: 'Who needs to deliver more, and who has room', html: catch_ }],
      after: () => lineChart($('#b-cum'), { x0: 1, x1: NW, h: 190, zero: true, today: CW + .5, yfmt: fmt$, series: [{ vals: cumL, from: 1, to: NW, color: '#b9bfc7', w: 1.5, dash: '1 3' }, { vals: cumT, from: 1, to: NW, color: '#7b828b', w: 1.5, dash: '5 3' }, { vals: cumA, from: 1, to: CW, color: 'var(--s1)', end: true }, { vals: cumA, from: CW, to: NW, color: 'var(--s1)', dash: '4 3', range: [lo, hi] }], tip: w => `<div class="th">Wk ${w}</div>${trow('Actual or forecast', fmt$(cumA[w]))}${trow('Plan', fmt$(cumT[w]))}` }) }, true);
  } else if (id === 'Sh6' || id === 'C2') {
    const rows = []; for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const ff = sub(f, { b: [b], c: [c] }); if (!has(ff)) continue; const sh = K.share(ff, K.MKT_LAST - 3, K.MKT_LAST), m = K.MKT[c + '|' + K.BMAP[b].sub], others = [m.comp1A[K.MKT_LAST], m.shareLY[2], m.shareLY[3]], rank = 1 + others.filter(x => x > sh.now).length, lead = Math.max(...others); rows.push({ label: K.BMAP[b].name + ' in ' + K.CMAP[c].name, sh, rank, rel: sh.now / lead, top3: [sh.now, ...others].sort((x, y) => y - x).slice(0, 3).reduce((x, y) => x + y, 0), slice: ff }); }
    rows.sort((x, y) => x.sh.chg - y.sh.chg);
    const tbl = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Brand and country</th><th class="r">Share</th><th class="r">vs last year</th><th class="r">Rank</th><th class="r">vs leader</th><th class="r">Market</th><th class="r">Top 3 combined</th></tr></thead><tbody>${rows.map(r => `<tr class="click" tabindex="0" data-slice='${JSON.stringify(r.slice)}'><td>${esc(r.label)}</td><td class="r num">${pct1(r.sh.now)}</td><td class="r num">${dv(r.sh.chg * 100, 'pts', 1)}</td><td class="r num">#${r.rank}</td><td class="r num">${r.rel.toFixed(2)}x</td><td class="r num">${sPct(r.sh.mktGrowth)}</td><td class="r num">${pct1(r.top3)}</td></tr>`).join('')}</tbody></table></div><p class="foot">Market data covers the 4 weeks to 20 September 2026 and only the channels that are tracked (coverage: ${countriesOf(f).map(c => K.CMAP[c].name + ' ' + Math.round(K.CMAP[c].coverage * 100) + '%').join(', ')}). A "vs leader" above 1.0x means we lead. The channel filter does not apply here.</p>`;
    const crow = countriesOf(f).filter(c => has(sub(f, { c: [c] }))).map(c => { const sh = K.share(sub(f, { c: [c] }), K.MKT_LAST - 3, K.MKT_LAST); return { label: K.CMAP[c].name, a: sh.mktGrowth, b: sh.ourGrowth, note: sPts(sh.chg * 100).replace(' pts', '') }; });
    openLevel({ crumb: 'Market share', title: 'Market share and growth vs market', insight: `Our share is ${pct1(D.sh.now)}, ${D.sh.chg >= 0 ? 'up' : 'down'} ${Math.abs(D.sh.chg * 100).toFixed(1)} points on last year.${rows.length > 1 && rows[0].sh.chg < 0 ? ` The biggest loss is ${rows[0].label} ${sPts(rows[0].sh.chg * 100)}.` : ''}${rows.length > 1 && rows[rows.length - 1].sh.chg > 0 ? ` The biggest gain is ${rows[rows.length - 1].label} ${sPts(rows[rows.length - 1].sh.chg * 100)}.` : ''}`,
      blocks: [{ h: 'Our growth against the market, by country', html: dumbbell(crow, { W: DW() }) }, { h: 'Share by brand and country, worst first', html: tbl }] }, true);
  } else if (id === 'Sh7' || id === 'C4') {
    const sp = K.SHARE_PRICE, us = new Float64Array(CW + 1), pe = new Float64Array(CW + 1); for (let w = 1; w <= CW; w++) { us[w] = sp.us[w] / sp.start * 100; pe[w] = sp.peer[w]; }
    openLevel({ crumb: 'Shareholder value', title: 'Share price and TSR vs peers', insight: `Our shares are ${D.us >= 0 ? 'up' : 'down'} ${pcn(D.us, 1)} this year and peers are ${D.peer >= 0 ? 'up' : 'down'} ${pcn(D.peer, 1)}. The gap opened after the Q2 results in week 30. Investors are watching organic growth, margin and an EPS outlook that is below guidance.`,
      blocks: [{ h: 'Indexed share price (start of year = 100)', id: 'b-sp', html: '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>Northstar</span><span><i class="dash"></i>Peer index</span></div>' }, { h: 'What investors are reacting to', html: stats([['Organic growth (full year)', pcn(D.FA.ns / agg({}, 'L', 1, NW).ns - 1, 1), 'analysts expect ' + pcn(K.FIN.consensus.organic, 1)], ['EPS (full-year outlook)', '$' + D.fyA.eps.toFixed(2), 'analysts expect $' + K.FIN.consensus.eps.toFixed(2)], ['Contribution margin', sPct(vr(D.A.cm, D.C.cm)), compShort()], ['Market share', pct1(D.sh.now), sPts(D.sh.chg * 100) + ' vs last year']]) }],
      after: () => lineChart($('#b-sp'), { x0: 1, x1: CW, h: 180, yfmt: v => v.toFixed(0), series: [{ vals: pe, from: 1, to: CW, color: '#7b828b', w: 1.5, dash: '5 3', label: 'Peers' }, { vals: us, from: 1, to: CW, color: 'var(--s1)', end: true, label: 'Northstar' }], markers: [{ w: 30, text: 'Q2 results' }], tip: w => `<div class="th">Wk ${w}</div>${trow('Northstar', us[w].toFixed(1))}${trow('Peers', pe[w].toFixed(1))}` }) }, true);
  }
}
const DW = () => { const b = $('#band'); const w = (b && b.clientWidth) || Math.min(1400, innerWidth); return Math.max(260, Math.min(560, (innerWidth > 1000 ? w / 2 : w) - 70)); };
const TWid = () => { const t = $('#tiles'); const w = t ? t.clientWidth : 700; return Math.max(240, (innerWidth <= 640 ? w : (w - 10) / 2) - 34); };
function bullet(actual, target, fmt) {
  const mx = Math.max(actual, target) * 1.15, W = DW();
  return `<svg viewBox="0 0 ${W} 44" width="${W}" height="44" class="fx" role="img" aria-label="Current vs required"><rect x="0" y="12" width="${W}" height="14" rx="4" fill="var(--surface-3)"/><rect x="0" y="15" width="${actual / mx * W}" height="8" rx="3" fill="var(--s1)"/><line x1="${target / mx * W}" x2="${target / mx * W}" y1="6" y2="32" stroke="var(--ink)" stroke-width="2.5"/><text x="2" y="42" class="ax">Now ${fmt(actual)} a week</text><text x="${W - 2}" y="42" text-anchor="end" class="ax strong">Needed ${fmt(target)} a week</text></svg>`;
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
    const pcase = (x, k) => x[k] / x.vol, comps = [['Materials', 'mat'], ['Packaging', 'pack'], ['Conversion', 'conv'], ['Inbound freight', 'inb']];
    const cb = { kind: 'cpc', start: C.cogs / C.vol, end: A.cogs / A.vol, items: comps.map(([l, k]) => [l, pcase(A, k) - pcase(C, k), k]) };
    openLevel({ crumb: 'Gross margin', title: 'Gross margin %', insight: `Gross margin is ${pct1((A.ns - A.cogs) / A.ns)}, ${Math.round(Math.abs(((A.ns - A.cogs) / A.ns - (C.ns - C.cogs) / C.ns) * 1e4))} bps ${(A.ns - A.cogs) / A.ns >= (C.ns - C.cogs) / C.ns ? 'above' : 'below'} ${compName()}. Cost per case is ${pcn(cb.end / cb.start - 1, 1)} ${cb.end >= cb.start ? 'higher' : 'lower'}, mostly because of materials.`,
      blocks: [{ h: 'Gross margin, ' + compName() + ' to actual', id: 'b-wf', foot: 'Click a bar to see which brands and markets are behind it.' }, { h: 'Cost per case, ' + compName() + ' to actual', id: 'b-wf2', foot: 'Per standard case. Materials went up with commodity prices. Conversion goes up when volume falls, because the fixed costs are spread over fewer cases.' }, { h: 'Marketing spend against budget', html: stats([['Marketing spend', fmt$(A.ap), dv(vr(A.ap, C.ap), 'pct', -1, compShort())], ['Marketing as % of net sales', pct1(A.ap / A.ns), ''], ['Delivery as % of net sales', pct1(A.dist / A.ns), dv(vr(A.dist / A.vol, C.dist / C.vol), 'pct', -1, 'per case')], ['Flow-through', Math.abs(A.ns - C.ns) > Math.abs(C.ns) * .01 && Math.abs((A.cm - C.cm) / (A.ns - C.ns)) < 2 ? pct1((A.cm - C.cm) / (A.ns - C.ns)) : 'n/a', Math.abs(A.ns - C.ns) > Math.abs(C.ns) * .01 ? 'How much of the sales change reached margin' : 'Sales are close to plan, so this means little']]) }],
      after: () => { waterfall($('#b-wf'), brg, { onClick: it => openContrib(f, P, it.k, it.full, 'gm') }); waterfall($('#b-wf2'), cb, { fmt: v => '$' + v.toFixed(2), sfmt: v => (v >= 0 ? '+' : MINUS) + '$' + Math.abs(v).toFixed(2), costUp: true }); } }, true);
  } else if (id === 'F2') {
    const rows = [];
    for (const c of countriesOf(f)) for (const r of K.RETAILERS.filter(x => x.c === c && (!f.ch || f.ch.includes(x.ch)))) { const ff = sub(f, { c: [c], ch: [r.ch] }); if (!has(ff)) continue; const a = agg(ff, 'A', P.w0, P.w1), cc = compAgg(ff, P); rows.push({ label: r.name + ', ' + K.CMAP[c].name, ch: K.CHMAP[r.ch].name, tr: a.tr * r.share, rate: a.tr / a.gs, plan: cc.tr / cc.gs }); }
    rows.sort((x, y) => (y.rate - y.plan) - (x.rate - x.plan));
    const tbl = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Key account</th><th>Channel</th><th class="r">Trade spend</th><th class="r">% gross sales</th><th class="r">${compShort()}</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td><td>${esc(r.ch)}</td><td class="r num">${fmt$(r.tr)}</td><td class="r num">${pct1(r.rate)}</td><td class="r num">${dv((r.rate - r.plan) * 1e4, 'bps', -1)}</td></tr>`).join('')}</tbody></table></div><p class="foot">Key account numbers use each account's share of its channel (illustrative).</p>`;
    let pv = 0, tv = 0; for (const p of promosIn(f)) { if (p.upcoming) continue; const ff = { b: [p.b], c: [p.c], ch: [p.ch] }; const w0 = Math.max(p.w0, P.w0), w1 = Math.min(p.w1, P.wa); if (w1 >= w0) pv += agg(ff, 'A', w0, w1).vol; } tv = A.vol;
    const ret = countriesOf(f).filter(c => has(sub(f, { c: [c] }))).map(c => { const ff = sub(f, { c: [c] }), a = agg(ff, 'A', P.w0, P.w1), t = agg(ff, 'T', P.w0, P.w1); return { label: K.CMAP[c].name, ret: a.ret, prov: a.gs * t.ret / t.gs }; });
    const rq = []; for (const c of countriesOf(f)) for (const ch of channelsOf(sub(f, { c: [c] }))) { const ff = sub(f, { c: [c], ch: [ch] }), r4 = agg(ff, 'A', CW - 3, CW), w = agg(ff, 'A', CW, CW); rq.push({ label: K.CHMAP[ch].name + ' in ' + K.CMAP[c].name, gap: r4.vol / r4.cons - 1, cover: w.stock / w.cons, normal: K.CHMAP[ch].cover }); }
    rq.sort((x, y) => y.gap - x.gap);
    openLevel({ crumb: 'Trade spend', title: 'Trade spend and gross-to-net', insight: `Trade spend is ${pct1(A.tr / A.gs)} of gross sales, ${Math.round(Math.abs((A.tr / A.gs - C.tr / C.gs) * 1e4))} bps ${A.tr / A.gs >= C.tr / C.gs ? 'higher' : 'lower'} than ${compName()}. That comes to ${fmt$(A.tr)}. ${pct1(pv / tv)} of our volume was sold on promotion.`,
      blocks: [{ h: 'Promotion ROI', html: (() => { const ev = promosIn(f).filter(p => p.roi != null), roi = ev.length ? ev.reduce((x, p) => x + p.incGM, 0) / ev.reduce((x, p) => x + p.spend, 0) : NaN; return stats([['Promotion ROI', isFinite(roi) ? roi.toFixed(2) + 'x' : 'n/a', 'plan 1.20x'], ['Events below 0.8x', String(ev.filter(p => p.roi < .8).length), 'of ' + ev.length], ['Volume on promotion', pct1(pv / tv), 'of volume']]) + '<button class="link go" data-go="F5">All promotion results ›</button>'; })() }, { h: 'Trade spend by key account (largest overspend first)', html: tbl }, { h: 'Returns against what we set aside', html: `<div class="tbl-wrap"><table class="t"><thead><tr><th>Country</th><th class="r">Returns</th><th class="r">Set aside</th><th class="r">Gap</th></tr></thead><tbody>${ret.map(r => `<tr><td>${r.label}</td><td class="r num">${fmt$(r.ret)}</td><td class="r num">${fmt$(r.prov)}</td><td class="r num">${dv(r.ret - r.prov, '$', -1)}</td></tr>`).join('')}</tbody></table></div>` },
        { h: 'Are we shipping more than shoppers buy? (last 4 weeks)', html: `<div class="tbl-wrap"><table class="t"><thead><tr><th>Channel and country</th><th class="r">Shipments vs shopper purchases</th><th class="r">Stock in the channel</th></tr></thead><tbody>${rq.slice(0, 6).map(r => `<tr><td>${r.label}</td><td class="r num">${dv(r.gap, 'pct', -1)}</td><td class="r num">${r.cover.toFixed(1)} wks <span class="muted">(normally ${r.normal})</span></td></tr>`).join('')}</tbody></table></div><p class="foot">When we ship well ahead of what shoppers buy, we borrow sales from the future and returns go up later.</p>` }] }, true);
  } else if (id === 'F3') {
    const byC = countriesOf(f).filter(c => has(sub(f, { c: [c] }))).map(c => { const p = pricing(sub(f, { c: [c] }), P); return { label: K.CMAP[c].name, ...p }; });
    const byB = brandsOf(f).filter(b => has(sub(f, { b: [b] }))).map(b => { const ff = sub(f, { b: [b] }), p = pricing(ff, P), a = agg(ff, 'A', P.w0, P.w1), l = agg(ff, 'L', P.w0, P.w1); return { label: K.BMAP[b].name, ...p, volG: a.vol / l.vol - 1 }; });
    const nb = bridge(f, P, 'ns'), pz = pricing(f, P), ev = promosIn(f).filter(p => p.roi != null), roi = ev.length ? ev.reduce((x, p) => x + p.incGM, 0) / ev.reduce((x, p) => x + p.spend, 0) : NaN;
    const g = k => nb.items.find(i => i[2] === k)[1];
    const lever = [['Pricing', sPct(pz.plan), sPct(pz.real), (pz.real - pz.plan) * 100, g('price')], ['Promotions & trade terms', pct1(C.tr / C.gs) + ' of gross sales', pct1(A.tr / A.gs), -(A.tr / A.gs - C.tr / C.gs) * 100, g('trade')], ['Mix', 'neutral', s$(g('mix')), g('mix') / C.ns * 100, g('mix')], ['Promotion ROI', '1.20x', isFinite(roi) ? roi.toFixed(2) + 'x' : 'n/a', isFinite(roi) ? (roi - 1.2) * 10 : 0, null], ['Pack sizes and prices', 'new packs (+0.4%)', '(+0.2%)', -.2, -.002 * C.ns]];
    const sc = `<div class="tbl-wrap"><table class="t"><thead><tr><th>RGM lever</th><th class="r">Plan</th><th class="r">Actual</th><th class="r">$ impact ${compShort()}</th><th class="r">Status</th></tr></thead><tbody>${lever.map(r => { const st = r[3] >= -.1 ? 'good' : r[3] >= -1 ? 'warn' : 'crit'; return `<tr><td>${r[0]}</td><td class="r num">${r[1]}</td><td class="r num"><b>${r[2]}</b></td><td class="r num">${r[4] == null ? 'n/a' : dv(r[4], '$', 1)}</td><td class="r">${sevPill(st)}</td></tr>`; }).join('')}</tbody></table></div><p class="foot">The pack and price numbers are illustrative.</p>`;
    const pt = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Country</th><th class="r">Actual vs last year</th><th class="r">Plan</th><th class="r">Gap</th><th class="r">Worth about</th></tr></thead><tbody>${byC.map(r => `<tr><td>${r.label}</td><td class="r num">${sPct(r.real)}</td><td class="r num">${sPct(r.plan)}</td><td class="r num">${dv((r.real - r.plan) * 100, 'pts', 1)}</td><td class="r num">${s$(r.short$)}</td></tr>`).join('')}</tbody></table></div>`;
    const sig = K.SIGNALS.filter(x => x.type === 'Pricing');
    openLevel({ crumb: 'Pricing', title: 'Pricing against plan', insight: `Our prices are ${pz.real >= 0 ? 'up' : 'down'} ${pcn(pz.real, 1)} on last year, and the plan was ${pz.plan >= 0 ? 'up' : 'down'} ${pcn(pz.plan, 1)}. That leaves us about ${fmt$(Math.abs(pz.short$))} ${pz.short$ >= 0 ? 'ahead of' : 'short of'} plan on gross sales. ${sig.length ? sig[0].text : ''}`,
      blocks: [{ h: 'RGM scorecard, plan against actual', html: sc }, { h: 'Pricing by country', html: pt }, { h: '', html: '<button class="link go" data-go="F4">See how cost increases flow through to margin ›</button>' }, { h: 'Did higher prices cost us volume?', html: elasticity(byB, DW()) + '<p class="foot">Each dot is a brand. Across is how much its price changed on last year, and up is how much its volume changed. Brands in the lower right raised prices and lost volume.</p>' }] }, true);
  } else if (id === 'F4') {
    const b = 'oats', ff = sub(f, { b: [b] }), fa = agg(ff, 'A', P.w0, P.w1), fl = agg(ff, 'L', P.w0, P.w1), pz = pricing(ff, P);
    const steps = has(ff) ? [['Oat cost vs budget', sPct(.18, 0)], ['Cost per case vs last year', sPct(fa.cogs / fa.vol / (fl.cogs / fl.vol) - 1)], ['Net price per case vs last year', sPct(fa.ns / fa.vol / (fl.ns / fl.vol) - 1)], ['Volume vs last year', sPct(fa.vol / fl.vol - 1)], ['Gross margin vs last year', sBps(((fa.ns - fa.cogs) / fa.ns - (fl.ns - fl.cogs) / fl.ns) * 1e4)], ['Inflation recovery', isFinite(pz.recovery) ? (pz.recovery * 100).toFixed(0) + '%' : 'n/a']] : [];
    const byB = brandsOf(f).filter(x => has(sub(f, { b: [x] }))).map(x => ({ label: K.BMAP[x].name, ...pricing(sub(f, { b: [x] }), P) })).sort((a, c) => (a.recovery || 9) - (c.recovery || 9));
    openLevel({ crumb: 'Cost recovery', title: 'How cost increases flow through to margin', insight: `For ${nameOf(f)}, price increases have won back ${(pricing(f, P).recovery * 100).toFixed(0)}% of the cost increase since last year. Sunrise Oats is the biggest gap: oat costs are 18% over budget and only 40% of our oat needs are locked in.`,
      blocks: [{ h: 'Sunrise Oats: from oat costs to margin', html: steps.length ? `<div class="chain">${steps.map((s, i) => `<div class="step"><span>${s[0]}</span><b class="num">${s[1]}</b></div>${i < steps.length - 1 ? '<i>→</i>' : ''}`).join('')}</div>` : '<p class="muted">Sunrise Oats is outside your filters.</p>' },
        { h: 'Recovery by brand (worst first)', html: `<div class="tbl-wrap"><table class="t"><thead><tr><th>Brand</th><th class="r">Price gain vs last year</th><th class="r">Cost increase</th><th class="r">Recovered</th></tr></thead><tbody>${byB.map(r => `<tr><td>${r.label}</td><td class="r num">${s$(r.price$)}</td><td class="r num">${s$(r.cost$)}</td><td class="r num"><b>${isFinite(r.recovery) ? (r.recovery * 100).toFixed(0) + '%' : 'n/a'}</b></td></tr>`).join('')}</tbody></table></div>` },
        { h: 'Commodity prices against budget', html: `<div class="tbl-wrap"><table class="t"><thead><tr><th>Commodity</th><th class="r">vs budget</th><th class="r">Price locked in</th></tr></thead><tbody>${K.COMMODITIES.map(x => `<tr><td>${x.name}</td><td class="r num">${dv(x.vsBudget, 'pct', -1)}</td><td class="r num">${pct1(x.hedge).replace('.0', '')}</td></tr>`).join('')}</tbody></table></div><p class="foot">The COO owns this day to day, and the same numbers show in the COO view.</p>` }] }, true);
  } else if (id === 'F5') {
    const ev = promosIn(f).filter(p => p.roi != null).sort((a, b) => a.roi - b.roi);
    const tbl = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Promotion</th><th>Where</th><th class="r">Spend</th><th class="r">Lift vs plan</th><th class="r">ROI</th><th class="r">Call</th></tr></thead><tbody>${ev.map(p => { const v = verdict(p.roi), r = K.RETAILERS.find(x => x.id === p.ka); return `<tr class="click" tabindex="0" data-promo="${p.id}"><td><b>${esc(p.name)}</b><br><span class="muted">${esc(K.BMAP[p.b].name)}, weeks ${p.w0} to ${p.w1}</span></td><td>${esc(K.CMAP[p.c].name)}${r ? ', ' + esc(r.name) : ', ' + esc(K.CHMAP[p.ch].name)}</td><td class="r num">${fmt$(p.spend)}</td><td class="r num">${sPct(p.lift, 0)} <span class="muted">plan ${sPct(p.planLift, 0)}</span></td><td class="r num"><b>${p.roi.toFixed(2)}x</b></td><td class="r">${sevPill(v[0]).replace(SEV[v[0]], v[1])}</td></tr>`; }).join('')}</tbody></table></div><p class="foot">ROI is the extra gross margin divided by what the promotion cost, measured after the event against a modelled baseline. Repeat above 1.2x, optimise between 0.8x and 1.2x, stop below 0.8x.</p>`;
    openLevel({ crumb: 'Promotion ROI', title: 'Promotion results', insight: ev.length ? `${ev.filter(p => p.roi < .8).length} of ${ev.length} promotions lost money (below 0.8x). The two Crunch Chips USA events alone cost ${fmt$(ev.filter(p => p.b === 'crunch').reduce((x, p) => x + p.spend - p.incGM, 0))} more than they earned back.` : 'No promotions have been evaluated for this selection.',
      blocks: [{ h: 'Promotions, lowest ROI first (click one for detail)', html: tbl }], after: () => $('#band-body').querySelectorAll('[data-promo]').forEach(r => { const go = () => openPromo(r.dataset.promo); r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter') go(); }; }) }, true);
  } else if (id === 'F6') {
    const fyA = K.finance({}, 'A', 1, NW), fyT = K.finance({}, 'T', 1, NW), sh = K.FIN.shares, k = (1 - K.FIN.taxRate) / sh;
    const eb = { kind: 'eps', start: fyT.eps, end: fyA.eps, items: [['Contribution margin', (fyA.cm - fyT.cm) * k, 'cm'], ['Overhead savings', -(fyA.overhead - fyT.overhead) * k, 'oh'], ['Interest, tax, shares', 0, 'it']] };
    const g = K.FIN.guidance, cons = K.FIN.consensus, org = agg({}, 'A', 1, NW).ns / agg({}, 'L', 1, NW).ns - 1, pe = K.SHARE_PRICE.us[CW] / fyA.eps;
    const gapTxt = (v, lo, hi, c, f2, unit) => `<span class="pills">${v < lo ? `<span class="pill sev crit">${f2(lo - v)} below guidance</span>` : v > hi ? `<span class="pill sev good">${f2(v - hi)} above guidance</span>` : `<span class="pill sev warn">Within guidance, ${f2(v - lo)} above the low end</span>`}<span class="pill sev ${v < c ? 'crit' : 'good'}">${f2(Math.abs(c - v))} ${v < c ? 'below' : 'above'} analyst estimates</span></span>`;
    const tbl = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Metric</th><th class="r">Our outlook</th><th class="r">Guidance</th><th class="r">Analyst estimate</th><th>Gap</th></tr></thead><tbody>
      <tr><td>EPS</td><td class="r num"><b>$${fyA.eps.toFixed(2)}</b></td><td class="r num">$${g.eps[0].toFixed(2)} to ${g.eps[1].toFixed(2)}</td><td class="r num">$${cons.eps.toFixed(2)}</td><td>${gapTxt(fyA.eps, g.eps[0], g.eps[1], cons.eps, v => '$' + v.toFixed(2))}</td></tr>
      <tr><td>Organic growth</td><td class="r num"><b>${sPct(org)}</b></td><td class="r num">${pct1(g.organic[0]).replace('.0', '')} to ${pct1(g.organic[1]).replace('.0', '')}</td><td class="r num">${pct1(cons.organic)}</td><td>${gapTxt(org, g.organic[0], g.organic[1], cons.organic, v => (v * 100).toFixed(1) + ' pts')}</td></tr>
      <tr><td>Net sales</td><td class="r num"><b>${fmt$(D.FA.ns)}</b></td><td class="r num">n/a</td><td class="r num">${fmt$(cons.ns)}</td><td><span class="pill sev ${D.FA.ns < cons.ns ? 'crit' : 'good'}">${fmt$(Math.abs(cons.ns - D.FA.ns))} ${D.FA.ns < cons.ns ? 'below' : 'above'} analyst estimates</span></td></tr></tbody></table></div>`;
    openLevel({ crumb: 'Outlook against guidance', title: 'Outlook against guidance and analyst estimates', insight: `We expect EPS of $${fyA.eps.toFixed(2)}. That is $${(cons.eps - fyA.eps).toFixed(2)} below analyst estimates and $${(g.eps[0] - fyA.eps).toFixed(2)} below the bottom of our guidance. Weaker margins are only partly made up by lower overheads.`,
      blocks: [{ h: 'What investors expect', html: tbl }, { h: 'EPS, plan to outlook', id: 'b-eps', foot: 'Click Contribution margin to see the brands and markets behind it.' }, { h: 'Valuation', html: stats([['Our P/E (outlook EPS)', pe.toFixed(1) + 'x', ''], ['Peer P/E', K.FIN.peerPE.toFixed(1) + 'x', dv(pe - K.FIN.peerPE, 'x', 1, 'vs peers')], ['Share price this year', sPct(D.us), 'peers ' + sPct(D.peer)], ['Shares', (sh / 1e6).toFixed(1) + 'M', '']]) }],
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
  return g + `<text x="${W - M.r}" y="${H - 1}" text-anchor="end" class="ax">Price change vs last year</text></svg>`;
}
function openPromo(pid) {
  const p = K.PROMOS.find(x => x.id === pid); if (!p) return; const v = verdict(p.roi), r = K.RETAILERS.find(x => x.id === p.ka);
  const why = p.b === 'crunch' ? 'Deep discounts in a market where shoppers are trading down pulled sales forward and gave money to people who would have bought anyway. The extra margin does not cover the cost.' : p.b === 'bolt' ? 'The price-marked pack arrived after the competitor cut its price, and the discount was too small to win shoppers back. The promotion needs a redesign.' : p.roi >= 1.2 ? 'It brought in a lot of extra volume without giving much away on sales we would have made anyway.' : 'It made money, but less than planned. Look at the depth, the timing and how well the retailer ran it.';
  openLevel({ crumb: p.name, title: p.name, insight: `${K.BMAP[p.b].name} in ${K.CMAP[p.c].name}${r ? ', ' + r.name : ''}, weeks ${p.w0} to ${p.w1}`, blocks: [{ html: stats([['Spend', fmt$(p.spend), 'depth ' + pct1(p.depth).replace('.0', '')], ['Volume lift', sPct(p.lift, 0), 'plan ' + sPct(p.planLift, 0)], ['Extra gross margin', fmt$(p.incGM), ''], ['ROI', p.roi.toFixed(2) + 'x', sevPill(v[0]).replace(SEV[v[0]], v[1])]]) }, { html: `<dl class="diag"><dt>Why</dt><dd>${aiTag} ${esc(why)}</dd><dt>Execution</dt><dd>The retailer ran ${pct1(p.compliance).replace('.0', '')} of the agreed activity, and volume was ${pcn(p.volVsPlan - 1)} ${p.volVsPlan >= 1 ? 'above' : 'below'} forecast.</dd><dt>How we measure it</dt><dd class="muted">We compare sales after the event with a modelled baseline, and take out sales stolen from our other products and shoppers stocking up (illustrative).</dd></dl>` }] });
}


/* ================= shared calculations kept from the strip ================= */
function rankText(f) {
  let lead = 0, n = 0, single = null;
  for (const c of countriesOf(f)) for (const b of brandsOf(f)) {
    const m = K.MKT[c + '|' + K.BMAP[b].sub], sh = K.share({ c: [c], b: [b] }, K.MKT_LAST - 3, K.MKT_LAST).now;
    const others = [m.comp1A[K.MKT_LAST], m.shareLY[2], m.shareLY[3]], rank = 1 + others.filter(x => x > sh).length; n++; if (rank === 1) lead++;
    single = { rank, leader: Math.max(...others), sh };
  }
  if (n === 1) return single.rank === 1 ? `Market leader, ${(single.sh / single.leader).toFixed(1)}x the next brand` : `No. ${single.rank} in this market. The leader has ${pct1(single.leader)}.`;
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
  for (const c of countriesOf(f)) for (const ch of channelsOf({ ...f, c: [c] })) { const ff = { b: f.b, c: [c], ch: [ch] }, w = agg(ff, 'A', CW, CW), r4 = agg(ff, 'A', CW - 3, CW); out.push({ c, ch, label: K.CHMAP[ch].name + ' in ' + K.CMAP[c].name, cover: w.stock / w.cons, normal: K.CHMAP[ch].cover, gap: r4.vol / r4.cons - 1, slice: ff }); }
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

/* ================= focus-band clusters (T2, with deeper levels swapping in place) ================= */
function goDeeper(fn) { drill.pushNext = true; fn(); }
function band(id) {
  if (!drill.pushNext) drill.root = id;
  const f = filter(), P = win(), D = stripData(), L = (crumb, title, insight, blocks, after, focus) => openLevel({ crumb, title, insight, blocks, after, focus, root: id }, true);
  const deeperLink = (txt, key) => `<button class="link go" data-go="${key}">${esc(txt)} ›</button>`;
  switch (id) {
    case 'C1': {
      const saved = state.comp; state.comp = 'L'; const brL = bridge(f, P, 'ns'); state.comp = saved;
      const Ltot = D.L.ns, rows = []; for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const ff = sub(f, { b: [b], c: [c] }); if (!has(ff)) continue; rows.push({ label: K.BMAP[b].name + ' in ' + K.CMAP[c].name, v: (agg(ff, 'A', P.w0, P.w1).ns - agg(ff, 'L', P.w0, P.w1).ns) / Ltot * 100, slice: ff }); }
      rows.sort((a, b) => b.v - a.v); const shown = rows.slice(0, 4).concat(rows.slice(-3));
      const cum = agg(f, 'A', 1, CW).ns, need = (D.FT.ns - cum) / (NW - CW), cur = agg(f, 'A', CW - 3, CW).ns / 4;
      return L('Organic growth', 'Organic growth and full-year outlook', `We are ${D.A.ns >= D.L.ns ? 'growing' : 'shrinking'} ${pcn(D.A.ns / D.L.ns - 1, 1)} against a plan of ${pcn(D.T.ns / D.L.ns - 1, 1)}. The full year is heading for ${fmt$(D.FA.ns)}, ${pcn(vr(D.FA.ns, D.FT.ns), 1)} ${D.FA.ns >= D.FT.ns ? 'above' : 'below'} plan. To hit plan we need to sell ${fmt$(need)} a week, and we are selling ${fmt$(cur)}.`,
        [{ h: 'Growth, last year to actual', id: 'b-wf', foot: READ_BRIDGE }, { h: 'What is adding to growth and what is taking away', html: divBars(shown, v => sPts(v).replace(' pts', ''), { click: true }), foot: 'Click a bar to see that brand and market.' }, { h: 'Weekly sales needed for the rest of the year', html: bullet(cur, need, fmt$) + deeperLink('Who can deliver more', 'catchup') }],
        () => { waterfall($('#b-wf'), brL, { startLabel: 'Last year', pctBase: D.L.ns, onClick: it => openContrib(f, P, it.k, it.full, 'ns') }); bindBars(shown); });
    }
    case 'C2': return openTile('Sh3');
    case 'C3': return openTile('Sh6');
    case 'C4': {
      const l = lrpData(f);
      const tb = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Category</th><th class="r">Our yearly growth</th><th class="r">Plan</th><th class="r">Industry</th><th class="r">Status</th></tr></thead><tbody>${l.rows.map(r => `<tr><td>${r.cat}</td><td class="r num"><b>${sPct(r.act)}</b></td><td class="r num">${sPct(r.plan)}</td><td class="r num">${sPct(r.ind)}</td><td class="r">${sevPill(sevOf((r.act - Math.max(r.plan, r.ind)) * 100, 'pts'))}</td></tr>`).join('')}</tbody></table></div>`;
      const mix = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Portfolio mix</th><th class="r">2024</th><th class="r">2026 outlook</th><th class="r">2027 plan</th></tr></thead><tbody>${l.rows.map(r => `<tr><td>${r.cat}</td><td class="r num">${pct1(r.n24 / l.t24)}</td><td class="r num">${pct1(r.n26 / l.t26)}</td><td class="r num">${pct1(r.p27 / l.tp)}</td></tr>`).join('')}</tbody></table></div>`;
      return L('3-year plan', '3-year growth against plan and industry', `We are growing ${pcn(l.act, 1)} a year. The plan is ${pcn(l.plan, 1)} and our categories are growing ${pcn(l.ind, 1)}. Personal Care is carrying the plan, while Food and Beverages are growing slower than their markets.`,
        [{ h: 'Net sales, 2024 to 2027', html: lrpChart(l) }, { h: 'By category', html: tb }, { h: 'Is the portfolio shifting toward growth?', html: mix }]);
    }
    case 'F1': return openCFO('F1');
    case 'F2': { const br = bridge(f, P, 'cm');
      return L('Contribution margin', 'Contribution margin against plan', `Contribution margin is ${fmt$(D.A.cm)}, ${pcn(vr(D.A.cm, D.C.cm), 1)} ${D.A.cm >= D.C.cm ? 'above' : 'below'} ${compName()}. ${Math.abs(D.A.ns - D.C.ns) > Math.abs(D.C.ns) * .01 && Math.abs((D.A.cm - D.C.cm) / (D.A.ns - D.C.ns)) < 2 ? `${pct1((D.A.cm - D.C.cm) / (D.A.ns - D.C.ns))} of the change in sales reached margin.` : ''}`,
        [{ h: 'Contribution margin, ' + compName() + ' to actual', id: 'b-wf', foot: READ_BRIDGE }, { h: 'By brand (worst first)', html: breakdownTable(rowsBy(f, P, 'b'), 'Brand') }, { h: 'By country', html: breakdownTable(rowsBy(f, P, 'c'), 'Country') }],
        () => waterfall($('#b-wf'), br, { pctBase: D.A.ns, onClick: it => openContrib(f, P, it.k, it.full) }));
    }
    case 'F3': return openCFO('F2');
    case 'F4': return openCFO('F3');
    case 'F5': return openCFO('F6');
    case 'M1': {
      const rows = brandsOf(f).filter(b => has({ ...f, b: [b] })).map(b => { const sh = K.share({ ...f, b: [b] }, K.MKT_LAST - 3, K.MKT_LAST); return { label: K.BMAP[b].name, a: sh.mktGrowth, b: sh.ourGrowth, chg: sh.chg * 100, note: sPts(sh.chg * 100).replace(' pts', '') }; }).sort((x, y) => x.chg - y.chg);
      const comp = []; for (const c of countriesOf(f)) for (const b of brandsOf(f)) { if (!has({ b: [b], c: [c] })) continue; const m = K.MKT[c + '|' + K.BMAP[b].sub]; const g1 = (m.comp1A[K.MKT_LAST] - m.shareLY[1]) * 100; comp.push({ who: m.competitors[0], where: K.BMAP[b].sub + ' in ' + K.CMAP[c].name, g: g1, sig: K.SIGNALS.find(s => s.b === b && s.c === c && s.type === 'Competitor') }); }
      comp.sort((a, b) => b.g - a.g);
      const ct = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Competitor</th><th>Where</th><th class="r">Share change</th><th>Likely move</th></tr></thead><tbody>${comp.filter(x => x.g > .05).slice(0, 5).map(x => `<tr><td><b>${esc(x.who)}</b></td><td>${esc(x.where)}</td><td class="r num">${dv(x.g, 'pts', -1)}</td><td>${x.sig ? esc(x.sig.text) : 'none'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No competitor is gaining more than 0.05 points.</td></tr>'}</tbody></table></div>`;
      return L('Brand share', 'Brand growth vs market', `${rows.filter(r => r.chg < 0).length} of ${rows.length} brands are losing share. The biggest loss is ${rows[0].label} ${sPts(rows[0].chg)}.`,
        [{ h: 'Our growth against the market, by brand (last 4 weeks)', html: dumbbell(rows, { W: DW() }) + DUMB_LEG }, { h: 'Competitors gaining share', html: ct }, { h: '', html: deeperLink('Share by brand and country', 'share') }]);
    }
    case 'M2': {
      const rows = brandsOf(f).filter(b => has({ ...f, b: [b] })).map(b => { const a = agg({ ...f, b: [b] }, 'A', P.w0, P.w1), t = agg({ ...f, b: [b] }, 'T', P.w0, P.w1); return { label: K.BMAP[b].name, r: a.inc / a.ap, p: t.inc / t.ap, ap: a.ap }; }).sort((x, y) => y.r - x.r);
      const A = D.A, base = A.inc / A.ap, sh = { TV: A.apTv, Digital: A.apDig, Other: A.apOth };
      const media = Object.entries(K.MEDIA_ROMI).map(([m, k]) => ({ m, r: base * k / ((A.apTv * K.MEDIA_ROMI.TV + A.apDig * K.MEDIA_ROMI.Digital + A.apOth * K.MEDIA_ROMI.Other) / A.ap), spend: sh[m] }));
      const tb = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Brand</th><th class="r">Marketing return</th><th class="r">Plan</th><th class="r">Marketing spend</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td><td class="r num"><b>${r.r.toFixed(2)}x</b></td><td class="r num">${r.p.toFixed(2)}x</td><td class="r num">${fmt$(r.ap)}</td></tr>`).join('')}</tbody></table></div>`;
      const mt = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Media</th><th class="r">Spend</th><th class="r">Marketing return</th></tr></thead><tbody>${media.map(x => `<tr><td>${x.m}</td><td class="r num">${fmt$(x.spend)}</td><td class="r num"><b>${x.r.toFixed(2)}x</b></td></tr>`).join('')}</tbody></table></div>`;
      return L('Marketing ROI', 'Marketing ROI', `Every $1 of marketing brings back $${base.toFixed(2)} in extra margin. ${rows[0].label} returns the most (${rows[0].r.toFixed(2)}x) and ${rows[rows.length - 1].label} the least (${rows[rows.length - 1].r.toFixed(2)}x). Digital is beating TV.`,
        [{ h: 'By brand', html: tb }, { h: 'By media', html: mt, foot: 'From the marketing mix model, which is updated every quarter (latest update: Q2).' }, { h: '', html: deeperLink('Campaign results', 'M4') }]);
    }
    case 'M3': {
      const ca = new Float64Array(NW + 1), cb = new Float64Array(NW + 1); let a = 0, t = 0; for (let w = 1; w <= NW; w++) { a += agg(f, 'A', w, w).ap; t += agg(f, 'T', w, w).ap; ca[w] = a; cb[w] = t; }
      const rows = brandsOf(f).filter(b => has({ ...f, b: [b] })).map(b => { const ff = { ...f, b: [b] }; return { label: K.BMAP[b].name, a: agg(ff, 'A', P.w0, P.w1), c: compAgg(ff, P) }; }).sort((x, y) => vr(y.a.ap, y.c.ap) - vr(x.a.ap, x.c.ap));
      const tb = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Brand</th><th class="r">Spend</th><th class="r">${compShort()}</th><th class="r">Working media</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td><td class="r num">${fmt$(r.a.ap)}</td><td class="r num">${dv(vr(r.a.ap, r.c.ap), 'pct', -1)}</td><td class="r num">${pct1((r.a.apTv + r.a.apDig) / r.a.ap)}</td></tr>`).join('')}</tbody></table></div>`;
      return L('Marketing spend', 'Marketing spend against budget', `We have spent ${fmt$(D.A.ap)}, ${pcn(vr(D.A.ap, D.C.ap), 1)} ${D.A.ap >= D.C.ap ? 'above' : 'below'} ${compName()}. ${rows[0].label} is furthest over budget.`,
        [{ h: 'Spend so far against budget', id: 'b-cum' }, { h: 'By brand', html: tb, foot: 'Working media is the spend that buys ads shoppers actually see (TV and digital).' }],
        () => lineChart($('#b-cum'), { x0: 1, x1: NW, h: 170, zero: true, today: CW + .5, yfmt: fmt$, series: [{ vals: cb, from: 1, to: NW, color: '#7b828b', w: 1.5, dash: '5 3', label: 'Budget' }, { vals: ca, from: 1, to: CW, color: 'var(--s1)', end: true, label: 'Actual' }], tip: w => `<div class="th">Wk ${w}</div>${trow('Actual', fmt$(ca[w]))}${trow('Budget', fmt$(cb[w]))}` }));
    }
    case 'M4': {
      const cs = K.CAMPAIGNS.filter(c => (!f.c || f.c.includes(c.c)) && (!f.b || f.b.includes(c.b)));
      const tb = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Campaign</th><th>Where</th><th class="r">Spend</th><th class="r">Lift vs plan</th><th class="r">Status</th></tr></thead><tbody>${cs.map(c => `<tr class="click" tabindex="0" data-camp="${c.id}"><td><b>${esc(c.name)}</b><br><span class="muted">Weeks ${c.w0} to ${c.w1}${c.w1 >= CW ? ', live' : ''}</span></td><td>${esc(K.BMAP[c.b].name)} in ${esc(K.CMAP[c.c].name)}</td><td class="r num">${fmt$(c.spend)}</td><td class="r num">${sPct(c.lift, 0)} <span class="muted">plan ${sPct(c.planLift, 0)}</span></td><td class="r">${sevPill(c.lift >= c.planLift ? 'good' : 'crit')}</td></tr>`).join('')}</tbody></table></div>`;
      return L('Campaigns', 'Campaign performance', cs.some(c => c.lift < c.planLift) ? `${cs.filter(c => c.lift < c.planLift).map(c => c.name).join(', ')} is below its planned sales lift. The competitor price cut is probably holding it back.` : 'Every campaign is at or above its planned lift.',
        [{ h: 'Campaigns (click one to see sales during the campaign)', html: tb }], () => $('#band-body').querySelectorAll('[data-camp]').forEach(r => { const go = () => openCampaign(r.dataset.camp); r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter') go(); }; }));
    }
    case 'S1': {
      const hs = headsData(f).sort((a, b) => a.pv - b.pv);
      const tb = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Sales head and region</th><th class="r">Month to date</th><th class="r">vs MTD target</th><th class="r">Projected month</th><th class="r">vs month target</th><th class="r">Status</th></tr></thead><tbody>${hs.map(h => `<tr class="click" tabindex="0" data-slice='${JSON.stringify(h.slice)}'><td><b>${esc(h.name)}</b><br><span class="muted">${esc(h.region)}, ${K.CMAP[h.c].name}</span></td><td class="r num">${fmt$(h.a)}</td><td class="r num">${dv(h.att - 1, 'pct', 1)}</td><td class="r num">${fmt$(h.proj)}</td><td class="r num">${dv(h.pv - 1, 'pct', 1)}</td><td class="r">${sevPill(headSev(h))}</td></tr>`).join('')}</tbody></table></div>`;
      const PM = { ...P, w0: monthWk()[0], w1: CW, wa: CW }, br = bridge(f, PM, 'ns');
      return L('Sales heads', 'October: will each sales head make the month?', `${hs.filter(h => h.pv < 1).length} of ${hs.length} sales heads will miss October at the current pace. The biggest gap is ${hs[0].name} (${hs[0].region}), heading for ${pcn(hs[0].pv - 1)} ${hs[0].pv >= 1 ? 'above' : 'below'} target.`,
        [{ h: 'Sales heads, worst first (click one to see their market)', html: tb, foot: 'The projection takes sales so far this month, divides by the weeks gone, and multiplies by the weeks in the month.' }, { h: 'Why: the gap to target so far this month', id: 'b-wf', foot: READ_BRIDGE }],
        () => waterfall($('#b-wf'), br, { startLabel: 'MTD target', pctBase: agg(f, 'A', monthWk()[0], CW).ns, onClick: it => openContrib(f, PM, it.k, it.full, 'ns') }));
    }
    case 'S2': {
      const hs = K.SALES_HEADS.filter(h => !f.c || f.c.includes(h.c)).map(h => ({ ...h, ...K.REACH[h.id] })).sort((a, b) => a.outlets / a.target - b.outlets / b.target);
      const tb = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Region and head</th><th class="r">Weighted distribution</th><th class="r">vs last year</th><th class="r">Outlets</th><th class="r">vs target</th></tr></thead><tbody>${hs.map(h => `<tr><td><b>${esc(h.region)}</b><br><span class="muted">${esc(h.name)}, ${K.CMAP[h.c].name}</span></td><td class="r num">${pct1(h.wd)}</td><td class="r num">${dv((h.wd - h.wdLY) * 100, 'pts', 1)}</td><td class="r num">${(h.outlets / 1000).toFixed(1)}K</td><td class="r num">${dv(h.outlets / h.target - 1, 'pct', 1)}</td></tr>`).join('')}</tbody></table></div>`;
      const ls = K.LISTINGS.filter(x => !f.c || f.c.includes(x.c)), lt = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Product</th><th>Retailer</th><th>Change</th><th class="r">Week</th></tr></thead><tbody>${ls.map(x => `<tr><td>${esc(x.sku)}</td><td>${esc(K.RETAILERS.find(r => r.id === x.ka).name)}</td><td>${x.type.startsWith('Listed') ? sevPill('good').replace('On track', 'Listed') : sevPill('crit').replace('Off track', esc(x.type))}</td><td class="r num">Wk ${x.w}</td></tr>`).join('')}</tbody></table></div>`;
      return L('Distribution', 'Penetration & distribution', `${hs[0].region} is furthest behind on outlets reached (${pcn(hs[0].outlets / hs[0].target - 1)} ${hs[0].outlets >= hs[0].target ? 'above' : 'below'} target). Distribution there is ${hs[0].wd >= hs[0].wdLY ? 'up' : 'down'} ${Math.abs((hs[0].wd - hs[0].wdLY) * 100).toFixed(1)} points on last year.`,
        [{ h: 'By region (furthest behind first)', html: tb }, { h: 'Listings gained and lost', html: lt }]);
    }
    case 'S3': {
      const ac = accountsData(f, P).sort((a, b) => a.gap - b.gap);
      const bars = divBars(ac.map(a => ({ label: a.name + ', ' + a.c, v: a.gap, slice: a.slice })), v => s$(v), { click: true });
      const tb = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Account</th><th class="r">Sales</th><th class="r">${compShort()}</th><th class="r">Promo compliance</th><th class="r">OTIF</th></tr></thead><tbody>${ac.map(a => `<tr class="click" tabindex="0" data-slice='${JSON.stringify(a.slice)}'><td><b>${esc(a.name)}</b><br><span class="muted">${K.CMAP[a.c].name}, ${K.CHMAP[a.ch].name}</span></td><td class="r num">${fmt$(a.a)}</td><td class="r num">${dv(a.att - 1, 'pct', 1)}</td><td class="r num">${a.compliance != null ? pct1(a.compliance) : 'n/a'}</td><td class="r num ${a.otif < a.otifT ? 'unf' : ''}">${pct1(a.otif)}</td></tr>`).join('')}</tbody></table></div><p class="foot">Account numbers use each account's share of its channel (illustrative).</p>`;
      return L('Key accounts', 'Key account performance', ac.length ? `${ac[0].name} has the biggest gap, ${fmt$(Math.abs(ac[0].gap))} ${ac[0].gap < 0 ? 'below' : 'above'} ${compName()}.` : 'No key accounts in scope.',
        [{ h: 'Gap to target by account', html: bars }, { h: 'Account scorecard', html: tb }], () => bindBars(ac.map(a => ({ slice: a.slice }))));
    }
    case 'S4': {
      const cs = channelStock(f), w = cs[0];
      const tb = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Channel and country</th><th class="r">Weeks of stock</th><th class="r">Normal</th><th class="r">Shipments vs shopper purchases (4 wks)</th></tr></thead><tbody>${cs.map(r => `<tr class="click" tabindex="0" data-slice='${JSON.stringify(r.slice)}'><td>${esc(r.label)}</td><td class="r num"><b>${r.cover.toFixed(1)}</b></td><td class="r num">${r.normal}</td><td class="r num">${dv(r.gap, 'pct', -1)}</td></tr>`).join('')}</tbody></table></div>`;
      const sv = new Float64Array(NW + 1), cv = new Float64Array(NW + 1); for (let i = 20; i <= CW; i++) { const x = agg(w.slice, 'A', i, i); sv[i] = x.vol; cv[i] = x.cons; }
      return L('Channel stock', 'Channel stock health', w ? `${w.label} holds ${w.cover.toFixed(1)} weeks of stock, against ${w.normal} normally. We shipped ${pcn(w.gap)} more than shoppers bought, and ${fmt$(K.NEAR_EXPIRY.channel[w.c] || 0)} of the stock in the channel is close to expiry.` : '',
        [{ h: 'Shipments against shopper purchases: ' + (w ? w.label : ''), id: 'b-flow', html: '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>Shipments</span><span><i class="dot" style="background:var(--s3)"></i>Shopper purchases</span></div>' }, { h: 'Weeks of stock by channel and country', html: tb }],
        () => lineChart($('#b-flow'), { x0: 20, x1: CW, h: 170, yfmt: v => (v / 1000).toFixed(0) + 'K cs', series: [{ vals: cv, from: 20, to: CW, color: 'var(--s3)', label: 'Purchases' }, { vals: sv, from: 20, to: CW, color: 'var(--s1)', end: true, label: 'Shipments' }], tip: i => `<div class="th">Wk ${i}</div>${trow('Shipments', (sv[i] / 1000).toFixed(1) + 'K cs')}${trow('Purchases', (cv[i] / 1000).toFixed(1) + 'K cs')}` }));
    }
    case 'O1': {
      const wh = warehouseData(f), rk = stockRisk(f), cs = channelStock(f);
      const wt = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Warehouse</th><th class="r">Days of stock (average)</th><th class="r">Target</th><th class="r">Items at risk</th><th class="r">Status</th></tr></thead><tbody>${wh.map(w => { const n = rk.filter(x => x.wh === w.name).length, crit = rk.some(x => x.wh === w.name && x.days < x.lead * .5); return `<tr><td>${esc(w.name)}, ${K.CMAP[w.c].name}</td><td class="r num"><b>${w.days.toFixed(0)}</b></td><td class="r num">${K.INV_TARGET_DAYS}</td><td class="r num">${n || 'none'}</td><td class="r">${sevPill(crit || w.days < 12 ? 'crit' : n || w.days < 18 ? 'warn' : 'good')}</td></tr>`; }).join('')}</tbody></table></div>`;
      const rt = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Product</th><th>Location</th><th class="r">Days of stock</th><th class="r">Time to restock</th></tr></thead><tbody>${rk.map(r => `<tr><td>${esc(r.sku)}</td><td>${esc(r.wh)}</td><td class="r num unf"><b>${r.days.toFixed(0)}</b></td><td class="r num">${r.lead} days</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nothing at risk.</td></tr>'}</tbody></table></div>`;
      const st = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Stores and distributors (Sales owns this stock)</th><th class="r">Weeks of stock</th><th class="r">Normal</th></tr></thead><tbody>${cs.slice(0, 5).map(r => `<tr><td>${esc(r.label)}</td><td class="r num">${r.cover.toFixed(1)}</td><td class="r num">${r.normal}</td></tr>`).join('')}</tbody></table></div>`;
      return L('Stock health', 'Stock health in warehouses and stores', `${rk.length} products at specific warehouses will run out before we can restock them. ${rk[0] ? rk[0].sku + ' at ' + rk[0].wh + ' has ' + rk[0].days.toFixed(0) + ' days of stock left and needs ' + rk[0].lead + ' days to restock.' : ''} Only 55% of the stock for the upcoming Orchard promotion at FreshMart is ready.`,
        [{ h: 'Items at risk of stock-out', html: rt }, { h: 'Warehouse stock', html: wt }, { h: 'Store and distributor stock', html: st, foot: `Stock close to expiry: ours ${fmt$(Object.values(K.NEAR_EXPIRY.own).reduce((x, y) => x + y, 0))}, in the channel ${fmt$(Object.values(K.NEAR_EXPIRY.channel).reduce((x, y) => x + y, 0))}.` }]);
    }
    case 'O2': {
      const P4 = { ...P, w0: CW - 3, w1: CW, wa: CW }, ac = accountsData(f, P4).sort((a, b) => (a.otif - K.RETAILERS.find(r => r.id === a.id).otif) - (b.otif - K.RETAILERS.find(r => r.id === b.id).otif));
      const tb = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Account</th><th class="r">OTIF (4 wks)</th><th class="r">Contract</th><th class="r">Estimated fines</th></tr></thead><tbody>${ac.map(a => { const thr = K.RETAILERS.find(r => r.id === a.id).otif; return `<tr><td><b>${esc(a.name)}</b>, ${K.CMAP[a.c].name}</td><td class="r num ${a.otif < thr ? 'unf' : ''}"><b>${pct1(a.otif)}</b></td><td class="r num">${pct1(thr).replace('.0', '')}</td><td class="r num">${a.otif < thr ? fmt$(a.fines) : 'none'}</td></tr>`; }).join('')}</tbody></table></div>`;
      const causes = [{ label: 'Supply shortage', v: 48 }, { label: 'Forecast error', v: 22 }, { label: 'Transport delay', v: 18 }, { label: 'Production', v: 12 }];
      const fr = {}; for (const c of countriesOf(f)) { fr[c] = new Float64Array(NW + 1); for (let i = 20; i <= CW; i++) fr[c][i] = agg({ ...f, c: [c] }, 'A', i, i).fill * 100; }
      return L('Customer service', 'Customer service (OTIF)', `${ac.filter(a => a.otif < K.RETAILERS.find(r => r.id === a.id).otif).map(a => a.name).join(' and ') || 'No account'} ${ac.filter(a => a.otif < K.RETAILERS.find(r => r.id === a.id).otif).length > 1 ? 'are' : 'is'} below the contract target. About half of failed orders come from not having the stock.`,
        [{ h: 'By account, against the contract target', html: tb }, { h: 'Why orders failed (share of failed cases, last 4 weeks)', html: divBars(causes.map(c => ({ label: c.label, v: c.v })), v => v + '%') }, { h: 'Fill rate by country', id: 'b-fr', html: '<div class="legend">' + countriesOf(f).map((c, i) => `<span><i class="dot" style="background:${['var(--s1)', 'var(--s2)', 'var(--s3)', '#7b828b'][i]}"></i>${K.CMAP[c].name}</span>`).join('') + '</div>' }],
        () => lineChart($('#b-fr'), { x0: 20, x1: CW, h: 160, yfmt: v => v.toFixed(0) + '%', series: countriesOf(f).map((c, i) => ({ vals: fr[c], from: 20, to: CW, color: ['var(--s1)', 'var(--s2)', 'var(--s3)', '#7b828b'][i], w: 1.8, label: c })), tip: i => `<div class="th">Wk ${i}</div>` + countriesOf(f).map(c => trow(K.CMAP[c].name, fr[c][i].toFixed(1) + '%')).join('') }));
    }
    case 'O3': {
      const A = D.A, C = D.C, pcase = (x, k) => x[k] / x.vol;
      const cb = { start: C.cogs / C.vol, end: A.cogs / A.vol, items: [['Materials', pcase(A, 'mat') - pcase(C, 'mat'), 'mat'], ['Packaging', pcase(A, 'pack') - pcase(C, 'pack'), 'pack'], ['Conversion', pcase(A, 'conv') - pcase(C, 'conv'), 'conv'], ['Inbound freight', pcase(A, 'inb') - pcase(C, 'inb'), 'inb']] };
      const db = { start: C.dist / C.vol, end: A.dist / A.vol, items: [['Warehousing', pcase(A, 'wh') - pcase(C, 'wh'), 'wh'], ['Freight', pcase(A, 'fr') - pcase(A, 'rush') - pcase(C, 'fr'), 'fr'], ['Rush shipments', pcase(A, 'rush'), 'rush'], ['Handling', pcase(A, 'hd') - pcase(C, 'hd'), 'hd']] };
      const money = { fmt: v => '$' + v.toFixed(2), sfmt: v => (v >= 0 ? '+' : MINUS) + '$' + Math.abs(v).toFixed(2), costUp: true };
      return L('Unit costs', 'Unit costs against budget', `Cost of goods per case is ${pcn(cb.end / cb.start - 1, 1)} ${cb.end >= cb.start ? 'higher' : 'lower'} than ${compName()}, mostly because of materials. Delivery cost per case is ${pcn(db.end / db.start - 1, 1)} ${db.end >= db.start ? 'higher' : 'lower'}, with rush shipments in Indonesia adding to it.`,
        [{ h: 'Cost of goods per case, ' + compName() + ' to actual', id: 'b-c1' }, { h: 'Delivery cost per case, ' + compName() + ' to actual', id: 'b-c2' }, { h: 'By brand', html: breakdownTable(rowsBy(f, P, 'b'), 'Brand') }],
        () => { waterfall($('#b-c1'), cb, { ...money, startLabel: 'Budget', endLabel: 'Actual' }); waterfall($('#b-c2'), db, { ...money, startLabel: 'Budget', endLabel: 'Actual' }); });
    }
    case 'O4': return openCFO('F4');
    case 'O5': {
      const cp = new Float64Array(NW + 1), tg = new Float64Array(NW + 1); for (let i = 1; i <= CW; i++) { cp[i] = K.COMPLAINTS[i]; tg[i] = K.QUALITY.cpmuTarget; }
      return L('Quality', 'Quality & compliance', 'No recalls and no open regulatory or legal cases. Complaints are running below target.',
        [{ h: 'Complaints per million units', id: 'b-q' }, { h: 'Open cases', html: '<p class="muted">No open recalls, quality holds or regulatory or legal cases. Recalls, regulatory actions and large cases go straight to the CEO.</p>' }],
        () => lineChart($('#b-q'), { x0: 1, x1: CW, h: 160, yfmt: v => v.toFixed(1), series: [{ vals: tg, from: 1, to: CW, color: '#7b828b', w: 1.5, dash: '5 3', label: 'Plan' }, { vals: cp, from: 1, to: CW, color: 'var(--s1)', end: true }], tip: i => `<div class="th">Wk ${i}</div>${trow('Complaints per million', cp[i].toFixed(2))}` }));
    }
  }
}
const READ_BRIDGE = 'How to read it: the first bar is what we compare against, each bar in the middle adds or takes away, and the last bar is the actual. Blue helped, red hurt. Click a bar to see who is behind it.';
const DUMB_LEG = '<div class="legend"><span><i class="ring"></i>Market growth</span><span><i class="dot" style="background:var(--s1)"></i>Us, gaining share</span><span><i class="dot" style="background:var(--neg)"></i>Us, losing share</span><span>Right: change in share (points)</span></div>';
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
  openLevel({ crumb: c.name, title: c.name, insight: `${K.BMAP[c.b].name} in ${K.CMAP[c.c].name}, ${c.media}, weeks ${c.w0} to ${c.w1}. Sales lifted ${pcn(c.lift)} against a plan of ${pcn(c.planLift)}, on ${fmt$(c.spend)} of spend.`,
    blocks: [{ h: 'Weekly net sales around the campaign (shaded)', id: 'b-camp' }],
    after: () => lineChart($('#b-camp'), { x0: Math.max(1, c.w0 - 10), x1: Math.min(NW, c.w1 + 4), h: 170, band: [c.w0, Math.min(c.w1, CW)], today: CW + .5, yfmt: fmt$, series: [{ vals: Wk.l, from: Math.max(1, c.w0 - 10), to: Math.min(NW, c.w1 + 4), color: '#b9bfc7', w: 1.5, dash: '1 3', label: 'Last year' }, { vals: Wk.a, from: Math.max(1, c.w0 - 10), to: Math.min(CW, c.w1 + 4), color: 'var(--s1)', end: true }], tip: w => `<div class="th">Wk ${w}</div>${trow('Actual', fmt$(Wk.a[w]))}${trow('Last year', fmt$(Wk.l[w]))}` }) });
}

/* ================= actions ================= */
const TODAY = Date.UTC(2026, 9, 12), DAY = 864e5;
const fmtD = t => t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'n/a';
let ACTS = {}; try { ACTS = JSON.parse(localStorage.getItem('ns-actions') || '{}'); } catch (e) { ACTS = {}; }
const saveActs = () => { try { localStorage.setItem('ns-actions', JSON.stringify(ACTS)); } catch (e) { } };
const PURVIEW = { CEO: null, CFO: ['buying', 'cost', 'market', 'guidance'], CMO: ['competitor', 'opportunity', 'market', 'campaign'], CSO: ['loading', 'volume', 'competitor', 'supply', 'heads'], COO: ['supply', 'cost', 'loading', 'stockrisk'] };
const POC_BY = (cls, c, b) => ({ competitor: c === 'UK' ? 'UK_SALES' : c === 'US' ? 'US_SALES' : 'CMO', buying: 'RGM', cost: 'RGM', supply: 'ID_SUPPLY', market: c === 'UK' ? 'UK_GM' : 'CFO', opportunity: b === 'glow' ? 'BRAND_GLOW' : 'CMO', loading: 'IN_SALES', volume: (c || 'UK') + '_SALES' })[cls] || 'CSO';
const TARGET = { supply: 'Fill rate at 95% or more by 1 November', competitor: 'Convenience volume back to 10% below last year by week 48', buying: 'Trade spend at 18% of gross sales or less from week 44', cost: 'Win back 80% of the cost increase by week 48', market: 'Lower target approved by 23 October', opportunity: 'At least 20 days of stock for Diwali by week 43', loading: 'No more than 4 weeks of stock in the channel by week 46', volume: 'Back to target pace within 4 weeks' };
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
  if (!pv || pv.includes('heads')) headsData(f).filter(h => h.pv < .97).forEach(h => out.push({ id: 'head|' + h.id, title: `Agree a recovery plan with ${h.name} to close the October gap.`, issue: `${h.name}, ${h.region}`, why: `At the current pace, ${h.region} will finish October ${pcn(h.pv - 1)} below target.`, chain: [`${sPct(h.att - 1)} against target so far this month`, `heading for ${fmt$(h.proj)} against a target of ${fmt$(h.tm)}`], poc: h.name + ', Regional Sales Head', urgency: h.pv < .94 ? 'High' : 'Medium', target: 'Back on target by week 43', value: h.tm - h.proj, sev: h.pv < .94 ? 'crit' : 'warn', f: h.slice, assigned: null, due: TODAY + 5 * DAY, status: 'New' }));
  if (!pv || pv.includes('stockrisk')) { const rk = stockRisk(f).filter(r => r.c === 'IN'); if (rk.length) out.push({ id: 'risk|glow-in', title: `Secure Diwali stock for ${rk.length} Glow Skincare products in India, by air freight or by moving stock from elsewhere.`, issue: 'Glow Skincare stock in India', why: `There are only ${rk[0].days.toFixed(0)} days of stock, it takes ${rk[0].lead} days to restock, and the Diwali peak is coming.`, chain: [`${rk.length} items have less stock than the time it takes to restock`, 'Diwali demand up 25% in week 44'], poc: K.PEOPLE.COO, urgency: 'High', target: 'At least 20 days of stock by week 43', value: 0, sev: 'crit', f: { b: ['glow'], c: ['IN'] }, assigned: null, due: TODAY + 4 * DAY, status: 'New' }); }
  if (!pv || pv.includes('guidance')) { const e = K.finance({}, 'A', 1, NW).eps; if (e < K.FIN.guidance.eps[0]) out.push({ id: 'guidance', title: 'Prepare a guidance decision for the board: keep it with a recovery plan, or lower it.', issue: 'EPS outlook below guidance', why: `We expect EPS of $${e.toFixed(2)}. Guidance is $${K.FIN.guidance.eps[0].toFixed(2)} to $${K.FIN.guidance.eps[1].toFixed(2)} and analysts expect $${K.FIN.consensus.eps.toFixed(2)}.`, chain: ['margins are under pressure', 'overhead savings are not enough'], poc: K.PEOPLE.CFO, urgency: 'High', target: 'Board decision by 30 October', value: 0, sev: 'crit', f: {}, assigned: TODAY - 2 * DAY, due: Date.UTC(2026, 9, 30), status: 'In progress' }); }
  if (!pv || pv.includes('campaign')) K.CAMPAIGNS.filter(c => c.w1 >= CW && c.lift < c.planLift && (!f.c || f.c.includes(c.c))).forEach(c => out.push({ id: 'camp|' + c.id, title: `Decide on "${c.name}": move the rest of the TV budget to digital, or pause it.`, issue: `${K.BMAP[c.b].name} campaign in ${K.CMAP[c.c].name}`, why: `Sales lifted ${pcn(c.lift)} against a plan of ${pcn(c.planLift)}, and TV earns less than digital.`, chain: [`${fmt$(c.spend)} spent`, `lift of ${pcn(c.lift)} against ${pcn(c.planLift)} planned`], poc: K.PEOPLE.BRAND_BOLT, urgency: 'Medium', target: 'Decision by 23 October', value: c.spend * .3, sev: 'warn', f: { b: [c.b], c: [c.c] }, assigned: null, due: TODAY + 10 * DAY, status: 'New' }));
  // apply saved changes
  for (const a of out) { const s = ACTS[a.id]; if (s) Object.assign(a, s); if (a.status !== 'Done' && a.due < TODAY) a.overdue = true; }
  const rank = { High: 0, Medium: 1, Low: 2 };
  __acts = out.sort((a, b) => (a.status === 'Done') - (b.status === 'Done') || (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0) || rank[a.urgency] - rank[b.urgency]);
  return __acts;
}
function emailDraft(a, follow) {
  const me = K.PEOPLE[state.role] || K.PEOPLE.CEO, first = a.poc.split(', ')[0].split(' ')[0];
  const subj = `${follow ? 'Follow-up: ' : ''}${a.issue}: ${a.title.split('.')[0]}`;
  const body = `Hi ${first},\n\n${follow ? 'Following up on this. ' : ''}${a.why}\n\nWhat the numbers show:\n${a.chain.map(x => '• ' + x.replace(/[▲▼]/g, '')).join('\n')}\n\nProposed action: ${a.title}\nTarget: ${a.target || 'none set'}\nDue: ${fmtD(a.due)}\n\nCould you tell me what is missing to fix this, and what you need from me? The full analysis is in Northstar Pulse, under ${a.issue}.\n\nThanks,\n${me.split(', ')[0]}`;
  return { to: a.poc, subj, body };
}
function openModal(title, html, after) { $('#modal-t').textContent = title; $('#modal-b').innerHTML = html; $('#modal').hidden = false; $('#modal .close').focus(); if (after) after(); }
const closeModal = () => { $('#modal').hidden = true; };
function copyBtn(txt) { return `<button class="btn primary" data-copy="${esc(encodeURIComponent(txt))}">Copy</button>`; }
function mailModal(a, follow) {
  const m = emailDraft(a, follow);
  openModal(follow ? 'Follow-up email' : 'Email draft', `<dl class="mf"><dt>To</dt><dd>${esc(m.to)}</dd><dt>Subject</dt><dd>${esc(m.subj)}</dd></dl><textarea id="mail-body" rows="13">${esc(m.body)}</textarea>
    <div class="m-act">${copyBtn('Subject: ' + m.subj + '\n\n' + m.body)}<button class="btn" data-close>Close</button></div><p class="foot">This is a draft for you to send from your own email. Nothing is sent from the dashboard.</p>`,
    () => { $('#mail-body').oninput = e => { const b = $('#modal-b [data-copy]'); b.dataset.copy = encodeURIComponent('Subject: ' + m.subj + '\n\n' + e.target.value); }; });
}
function meetModal(a) {
  const start = new Date(a.due - 2 * DAY + 10 * 3600e3), me = (K.PEOPLE[state.role] || K.PEOPLE.CEO);
  const txt = `Meeting: ${a.issue}, review and next steps\nWhen: ${start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}, 10:00, 30 minutes\nAttendees: ${me}; ${a.poc}\n\nAgenda\n1. What changed: ${a.why}\n2. The numbers: ${a.chain.join('; ').replace(/[▲▼]/g, '')}\n3. Proposed action: ${a.title}\n4. What is missing, owner and date (target: ${a.target || 'none set'})`;
  openModal('Meeting invite', `<pre class="pre">${esc(txt)}</pre><div class="m-act">${copyBtn(txt)}<button class="btn" data-close>Close</button></div><p class="foot">This is a draft for your calendar. Nothing is booked from the dashboard.</p>`);
}
function assignModal(a) {
  const ppl = Object.values(K.PEOPLE).concat(K.SALES_HEADS.map(h => h.name + ', Regional Sales Head')).filter((v, i, s) => s.indexOf(v) === i);
  openModal('Assign action', `<p>${esc(a.title)}</p><label class="lab" for="as-who">Owner</label><select id="as-who">${ppl.map(p => `<option ${p === a.poc ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
    <label class="lab" for="as-due">Due</label><input id="as-due" type="date" value="${new Date(a.due).toISOString().slice(0, 10)}">
    <div class="m-act"><button class="btn primary" id="as-ok">Assign and draft email</button><button class="btn" data-close>Cancel</button></div>`,
    () => { $('#as-ok').onclick = () => { const s = ACTS[a.id] || {}; s.poc = $('#as-who').value; s.due = Date.parse($('#as-due').value) || a.due; s.status = 'Assigned'; s.assigned = TODAY; ACTS[a.id] = s; saveActs(); renderHome(); const na = actions().find(x => x.id === a.id); mailModal(na); }; });
}
function createActionFromBand() {
  const lv = drill.stack[drill.stack.length - 1]; if (!lv) return;
  const id = 'own|' + Date.now();
  ACTS[id] = { custom: true, id, title: 'Review: ' + lv.title, issue: lv.title, why: lv.insight || lv.title, chain: [], poc: K.PEOPLE[state.role], urgency: 'Medium', target: '', value: 0, sev: 'warn', f: lv.focus || filter(), assigned: TODAY, due: TODAY + 7 * DAY, status: 'New', role: state.role };
  saveActs(); renderHome(); toast('Action created from this view. You will find it in My actions.');
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => el.hidden = true, 2600); }


/* ======================================================================
   PULSE v2: home, cards (4-slot framework), panel with its own filters
   and Ask, RGM checks, bookmarks, actions. Desktop only.
   ====================================================================== */
let PF = {};                                   // filters of the open panel (home always uses the whole company)
const withF = (f, fn) => { const s = PF; PF = f; try { return fn(); } finally { PF = s; } };
filter = function () { return { ...PF }; };    // every calculation reads the panel's filters
const NAME = { CEO: 'Sarah', CFO: 'David', CMO: 'Emma', CSO: 'Mike', COO: 'Tom' };
const first = p => (p || '').split(', ')[0].split(' ')[0];
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
const SLOTS = ['Sales', 'Profit and cost', 'Market and outside view', 'Cash, stock and buyers'];
const ROLE_CARDS = { CEO: ['OSG', 'OM', 'SHARE', 'FCF'], CFO: ['OSG', 'GM', 'EPS', 'FCF'], CMO: ['SSG', 'AP', 'SHARE', 'PENF'], CSO: ['SALES', 'TRADE', 'DIST', 'CHINV'], COO: ['OTIF', 'COGS', 'SAFQ', 'RISK'] };
const CARD_DEF = {
  OSG: ['Organic sales growth', 'Net sales (what we ship, after trade spend) against last year, leaving out currency and acquisitions.', 'Net sales ÷ last year net sales − 1'],
  OSGB: ['Organic sales growth', 'How each brand is growing against last year and against plan.', 'Net sales ÷ last year net sales − 1'],
  SSG: ['Shopper sales growth', 'What shoppers bought in stores, from retailer checkout data, against last year and against category growth. It differs from net sales when retailers and distributors hold more or less of our stock.', 'Retail sales value ÷ last year retail sales value − 1'],
  SALES: ['Net sales against target', 'Sales so far this month against the target the sales team is paid on, and whether each sales head will make the month.', 'Net sales this month ÷ sales target this month'],
  OM: ['Operating margin', 'Profit after all running costs, as a share of net sales. Company total.', 'Operating profit ÷ net sales'],
  GM: ['Gross margin (after trade)', 'What is left of net sales after trade spend and the cost of making the product, as a share of net sales. Price, promotions and input costs all show up here.', '(Gross sales − trade spend − returns − cost of goods) ÷ net sales'],
  AP: ['Marketing spend and return', 'Marketing spend against budget, and the extra gross margin each $1 of it earns (from a marketing mix model, updated every quarter).', 'Spend: actual vs budget. Return: extra gross margin ÷ marketing spend'],
  ROMI: ['Marketing ROI', 'Extra gross margin for every $1 of marketing (marketing mix model, updated every quarter).', 'Extra gross margin ÷ marketing spend'],
  TRADE: ['Trade spend', 'Money we give to retailers as a share of gross sales, and what promotions earn back.', 'Trade spend ÷ gross sales'],
  COGS: ['Cost per case', 'What it costs to make one standard case against plan, and the savings delivered against plan.', 'Cost of goods ÷ cases'],
  SHARE: ['Market share', 'Our share of what shoppers spend in the category (market data, tracked channels), with category growth next to it.', 'Our shopper sales ÷ category sales'],
  EPS: ['Earnings per share', 'Earnings per share we expect for the full year, against our guidance and what analysts expect.', '(Operating profit − interest) × (1 − tax) ÷ shares'],
  DIST: ['Store distribution', 'The share of category sales that happen in stores that stock us, and how many outlets we reach.', 'Category sales in stores that stock us ÷ all category sales'],
  QUAL: ['Quality and safety', 'Complaints per million units, recalls, open regulatory cases and site safety.', 'Complaints ÷ units sold × 1,000,000'],
  SAFQ: ['Safety and quality', 'Injuries that cost a worker time off, per million hours worked (rolling 12 months). Then consumer complaints, holds and recalls.', 'Lost-time injuries ÷ hours worked × 1,000,000'],
  FCF: ['Free cash flow', 'Cash left after running the business and investing in it. Books are closed to September.', 'Operating profit + depreciation − tax − interest − capital spending − working capital'],
  PEN: ['Household penetration', 'Share of households that bought our brands in the last 52 weeks (consumer panel).', 'Buying households ÷ all households'],
  PENF: ['Buyers and frequency', 'Share of households that bought our brands in the last 52 weeks, and how often each buyer buys. Losing buyers is a brand problem. Buying less often is usually about price or occasion.', 'Penetration: buying households ÷ all households. Frequency: trips ÷ buyers'],
  CHINV: ['Channel inventory', 'Weeks of our stock sitting with distributors and stores, against normal.', 'Channel stock ÷ weekly shopper sales'],
  OTIF: ['Service level (OTIF)', 'Orders delivered on time and in full (counted by case, within each customer\'s contract window), retailers below their contract target, and sales lost because we could not supply.', 'On-time, in-full cases ÷ ordered cases'],
  INVD: ['Inventory days', 'Days of stock in our warehouses against target, and items about to run out.', 'Inventory ÷ average daily demand'],
  RISK: ['Supply risk, next 13 weeks', 'Products at a warehouse that will run out before we can restock them in the next 13 weeks (from the supply planner, including confirmed recovery plans).', 'Projected days of stock < time to restock'],
};
Object.entries(CARD_DEF).forEach(([k, v]) => DEF[k] = v);
DEF.FRESH = ['How up to date is this?', 'Sales and costs run to the week ending 11 October 2026. September is closed and matches the management accounts, and October is still open. Market share runs to 20 September. Consumer panel and brand tracker data are for September.', ''];
DEF.CLOSE = ['Books and reconciliation', 'September is closed and matches the management accounts. October is still open, so its actuals can change until the close on working day 5.', ''];
const CARD_SLOT = { OSG: 0, OSGB: 0, SSG: 0, SALES: 0, OTIF: 0, OM: 1, GM: 1, AP: 1, ROMI: 1, TRADE: 1, COGS: 1, SHARE: 2, EPS: 2, DIST: 2, QUAL: 2, SAFQ: 2, FCF: 3, PEN: 3, PENF: 3, CHINV: 3, INVD: 3, RISK: 3 };
const compLab = () => ({ T: 'Plan', E: 'Latest estimate', L: 'Last year', M: 'Last month' })[state.comp];
const compProv = () => state.comp === 'E' ? 'FP&A, ' + K.LE.label : state.comp === 'T' ? 'FP&A plan' : 'ERP';

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
    rows.push({ b, c, label: K.BMAP[b].name + ' in ' + K.CMAP[c].name, pen: p[1], penLY: p[0], dp, freq: q[1], freqLY: q[0], df, rep: q[2], w, why: dp < -.3 && df > -.02 ? 'Losing buyers' : dp > -.3 && df < -.03 ? 'Buying less often' : dp < -.3 ? 'Both' : 'Growing or stable', slice: { b: [b], c: [c] } });
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
      if (state.comp === 'L') return { value: plain(g), raw: g, rk: 'pts', rg: 1, delta: dv(A.ns - L.ns, '$', 1, 'vs last year'), sev: g >= 0 ? 'good' : 'crit', per: P.label, ref: `Last year ${fmt$(L.ns)}`, prov: 'ERP', insight: `Full-year forecast ${fmt$(D.FA.ns)}, ${pcn(fy, 1)} ${fy >= 0 ? 'above' : 'below'} plan`, say: `Sales are ${g >= 0 ? 'up' : 'down'} ${plain(Math.abs(g))} on last year.` };
      const gp = C.ns / (state.comp === 'M' ? agg(D.f, 'L', Math.max(1, P.w0 - 4), Math.max(1, P.wa - 4)).ns : L.ns) - 1, d = (g - gp) * 100;
      return { value: plain(g), raw: g, craw: gp, rk: 'pts', rg: 1, delta: dv(d, 'pts', 1, cmp), sev: sevOf(d, 'pts'), per: P.label, ref: `${compLab()} ${plain(gp)}`, prov: state.comp === 'T' ? 'From RGM tool' : compProv(), insight: `Full-year forecast ${fmt$(D.FA.ns)}, ${pcn(fy, 1)} ${fy >= 0 ? 'above' : 'below'} plan`, say: d < -.1 ? `Sales growth is ${plain(g)}, which is ${Math.abs(d).toFixed(1)} points behind ${compName()}.` : `Sales growth is ${plain(g)}, in line with ${compName()}.` }; }
    case 'SSG': { const s = shopper(D.f, P.w0, P.wa), d = (s.g - s.cat) * 100;
      return { value: plain(s.g), raw: s.g, craw: s.cat, rk: 'pts', rg: 1, delta: dv(d, 'pts', 1, 'vs category'), sev: d >= -.2 ? 'good' : d >= -1.5 ? 'warn' : 'crit', per: P.label, ref: `Category ${sPct(s.cat)}, shipments ${sPct(s.ship)}`, prov: 'Retailer data and market data', insight: Math.abs(s.ship - s.g) < .002 ? 'We ship about as much as shoppers buy, so channel stock is steady' : `We are shipping ${s.ship > s.g ? 'more' : 'less'} than shoppers buy, so channel stock is ${s.ship > s.g ? 'building' : 'falling'}`, say: d < -.2 ? `Shopper sales grew ${plain(s.g)}, which is ${Math.abs(d).toFixed(1)} points behind the category.` : `Shopper sales grew ${plain(s.g)}, ahead of the category.` }; }
    case 'SALES': { const hs = withF({}, () => headsData({})), a = hs.reduce((x, h) => x + h.a, 0), t = hs.reduce((x, h) => x + h.t, 0), tm = hs.reduce((x, h) => x + h.tm, 0), miss = hs.filter(h => h.pv < 1).length;
      const el = monthWk().filter(w => w <= CW).length * 7, rem = Math.max(7, (monthWk().length * 7) - el), need = (tm - a) / rem, now = a / el;
      return { value: plain(a / t), raw: a / t, craw: 1, rk: 'pts', rg: 1, delta: dv(a / t - 1, 'pct', 1, 'vs sales target'), sev: a / t >= 1 ? 'good' : a / t >= .98 ? 'warn' : 'crit', per: 'MTD', ref: `We need to sell ${fmt$(need)} a day for the rest of October, and we sell ${fmt$(now)} a day now`, prov: 'Sales target (bonus basis)', insight: `${miss} of ${hs.length} sales heads will miss October`, heads: miss, say: a / t >= 1 ? `Sales are ${pct1(a / t - 1)} ahead of the October target.` : `Sales are ${pct1(1 - a / t)} behind the October target.` }; }
    case 'OM': { const m = D.opA.op / D.opA.ns, mc = D.opC.op / D.opC.ns, d = (m - mc) * 1e4;
      return { value: plain(m), raw: m, craw: mc, rk: 'bps', rg: 1, delta: dv(d, 'bps', 1, cmp), sev: sevOf(d, 'bps'), per: P.label, ref: `${compLab()} ${plain(mc)}, profit ${fmt$(D.opA.op)}`, prov: compProv(), insight: 'Lower overheads are hiding weaker margins on the products', say: d < -10 ? `Operating margin is ${Math.round(Math.abs(d))} bps below ${compName()}.` : `Operating margin is on ${compName()}.` }; }
    case 'GM': { const gm = x => (x.ns - x.cogs) / x.ns, d = (gm(A) - gm(C)) * 1e4;
      return { value: plain(gm(A)), raw: gm(A), craw: gm(C), rk: 'bps', rg: 1, delta: dv(d, 'bps', 1, cmp), sev: sevOf(d, 'bps'), per: P.label, ref: `${compLab()} ${plain(gm(C))}, trade spend ${pct1(A.tr / A.gs)} of gross sales`, prov: compProv(), insight: 'Oat costs are rising faster than prices', say: d < -10 ? `Gross margin is ${Math.round(Math.abs(d))} bps below ${compName()}.` : `Gross margin is on ${compName()}.` }; }
    case 'AP': { const v = vr(A.ap, C.ap), r = A.inc / A.ap, rp = T.inc / T.ap;
      return { value: r.toFixed(2) + 'x', valueUnit: 'per $1', raw: r, craw: rp, rk: 'x', rg: 1, delta: dv(r - rp, 'x', 1, 'return vs plan'), sev: r < rp * .9 ? 'crit' : Math.abs(v) > .05 || r < rp ? 'warn' : 'good', per: P.label, ref: `Spend ${fmt$(A.ap)}, ${pcn(v, 1)} ${v >= 0 ? 'over' : 'under'} ${state.comp === 'T' ? 'budget' : compName()}`, prov: 'Marketing mix model, Q2', insight: 'The Bolt Up TV campaign is lifting sales 3% against 8% planned', say: r < rp ? `Each $1 of marketing brings back $${r.toFixed(2)}, below the $${rp.toFixed(2)} in the plan.` : Math.abs(v) > .05 ? `Marketing spend is ${pct1(Math.abs(v))} ${v > 0 ? 'over' : 'under'} budget.` : `Marketing is on budget and brings back $${r.toFixed(2)} for every $1.` }; }
    case 'ROMI': { const r = A.inc / A.ap, rp = T.inc / T.ap;
      return { value: r.toFixed(2) + 'x', raw: r, craw: rp, rk: 'x', rg: 1, delta: dv(r - rp, 'x', 1, 'vs plan'), sev: r >= rp ? 'good' : r >= rp * .9 ? 'warn' : 'crit', per: P.label, ref: `Plan ${rp.toFixed(2)}x, spend ${fmt$(A.ap)}`, prov: 'Marketing mix model, Q2', insight: 'Glow Skincare e-commerce returns 4.6x', say: `Marketing returns ${r.toFixed(2)}x per dollar.` }; }
    case 'TRADE': { const tr = x => x.tr / x.gs, d = (tr(A) - tr(C)) * 1e4, ev = promosIn(D.f).filter(p => p.roi != null), roi = ev.length ? ev.reduce((x, p) => x + p.incGM, 0) / ev.reduce((x, p) => x + p.spend, 0) : 1.2;
      return { value: plain(tr(A)), raw: tr(A), craw: tr(C), rk: 'bps', rg: -1, delta: dv(d, 'bps', -1, cmp), sev: d > 50 || roi < 1 ? 'crit' : d > 10 ? 'warn' : 'good', per: P.label, ref: `${compLab()} ${plain(tr(C))} of gross sales`, prov: state.comp === 'T' ? 'From RGM tool' : compProv(), insight: `Promotions earn back ${roi.toFixed(2)}x against 1.20x planned`, say: roi < 1 ? `Promotions are losing money. Each $1 spent earns back only ${Math.round(roi * 100)} cents.` : 'Promotions are earning their cost back.' }; }
    case 'COGS': { const u = x => x.cogs / x.vol, v = vr(u(A), u(C)), sv = K.SAVINGS, done = sv.reduce((x, s) => x + s.done, 0), plan = sv.reduce((x, s) => x + s.plan, 0);
      return { value: '$' + u(A).toFixed(2), raw: u(A), craw: u(C), rk: 'pct', rg: -1, delta: dv(v, 'pct', -1, cmp), sev: sevOf(-v, 'pct'), per: P.label, ref: `Savings so far ${fmt$(done)} of a ${fmt$(plan)} plan`, prov: 'Productivity programme', insight: 'Oats are 18% over budget and only 40% is locked in', say: v > .005 ? `Cost per case is ${(v * 100).toFixed(1)}% over ${compName()}, driven by oats.` : `Cost per case is on ${compName()}.` }; }
    case 'SHARE': { const ch = D.sh.chg * 100;
      return { value: plain(D.sh.now), raw: D.sh.now, craw: D.sh.ly, rk: 'pts', rg: 1, delta: dv(ch, 'pts', 1, 'vs last year'), sev: ch >= -.3 ? 'good' : ch >= -1 ? 'warn' : 'crit', per: '4 weeks to 20 Sep', ref: `Category ${sPct(D.sh.mktGrowth)}, ${rankText(D.f)}`, prov: 'Market data', insight: D.f.c || D.f.b ? `Our sales ${sPct(D.sh.ourGrowth)} against category ${sPct(D.sh.mktGrowth)}` : 'Losing UK coffee share to Volt Coffee', say: ch < -.3 ? `Market share slipped ${Math.abs(ch).toFixed(1)} points. Bolt Brew is losing to Volt Coffee in the UK.` : 'Bolt Brew is losing UK share to Volt Coffee, while total share holds.' }; }
    case 'EPS': { const e = D.fyA.eps, g = K.FIN.guidance.eps, cs = K.FIN.consensus.eps;
      return { value: '$' + e.toFixed(2), raw: e, craw: cs, rk: 'eps', rg: 1, delta: dv(e - cs, 'eps', 1, 'vs analyst estimates'), sev: e < g[0] ? 'crit' : e < cs ? 'warn' : 'good', per: 'FY outlook', ref: `Guidance $${g[0].toFixed(2)} to $${g[1].toFixed(2)}, analysts expect $${cs.toFixed(2)}`, prov: 'Investor relations', insight: `$${(g[0] - e).toFixed(2)} below the bottom of guidance`, say: e < g[0] ? `Full-year EPS is heading for $${e.toFixed(2)}, below our guidance.` : 'EPS is within guidance.' }; }
    case 'DIST': { const R = K.SALES_HEADS.map(h => K.REACH[h.id]), o = R.reduce((x, r) => x + r.outlets, 0), tg = R.reduce((x, r) => x + r.target, 0), wd = R.reduce((x, r) => x + r.wd * r.outlets, 0) / o, wl = R.reduce((x, r) => x + r.wdLY * r.outlets, 0) / o;
      return { value: plain(wd), raw: wd, craw: wl, rk: 'pts', rg: 1, delta: dv((wd - wl) * 100, 'pts', 1, 'vs last year'), sev: o / tg >= .99 ? 'good' : o / tg >= .96 ? 'warn' : 'crit', per: 'Sep retail audit', ref: `${(o / 1000).toFixed(0)}K outlets against ${(tg / 1000).toFixed(0)}K planned`, prov: 'Retail audit', insight: 'We are behind plan on reach in North India and Jakarta', say: 'Store reach is behind plan in North India and Jakarta.' }; }
    case 'QUAL': { const q = K.QUALITY;
      return { value: q.cpmu.toFixed(1), raw: q.cpmu, craw: q.cpmuTarget, rk: 'n', rg: -1, delta: dv(q.cpmu - q.cpmuTarget, 'n', -1, 'vs target'), sev: q.recalls || q.openCases ? 'crit' : 'good', per: 'Rolling 12 months', ref: `Target ${q.cpmuTarget}, no recalls`, prov: 'Quality system', insight: `Safety: ${K.SAFETY.ltifr} injuries per million hours`, say: 'Quality and safety are on track.' }; }
    case 'SAFQ': { const s = K.SAFETY, q = K.QUALITY, inc = s.incidents[0], bad = s.ltifr > s.target || q.recalls || q.openCases;
      return { value: s.ltifr.toFixed(2), raw: s.ltifr, craw: s.target, rk: 'n2', rg: -1, delta: `<span class="dv ${s.ltifr <= s.target ? 'fav' : 'unf'}">${s.ltifr <= s.target ? '▼' : '▲'} (${s.ltifr <= s.target ? MINUS : '+'}${Math.abs(s.ltifr - s.target).toFixed(2)}) <small>injuries per million hours, against target</small></span>`, sev: bad ? 'crit' : q.cpmu > q.cpmuTarget ? 'warn' : 'good', per: 'Rolling 12 months', ref: `Complaints ${q.cpmu} per million units against a target of ${q.cpmuTarget}, no recalls`, prov: 'Safety and quality systems', insight: `An injury that cost a worker time off at ${inc.site} in week ${inc.w}. A guard has been fitted.`, say: bad ? 'Safety is above its injury target.' : 'Safety and quality are on track.' }; }
    case 'FCF': { const ca = cash('A', 1, 39), ct = cash('T', 1, 39), v = vr(ca.fcf, ct.fcf);
      return { value: fmt$(ca.fcf), raw: ca.fcf, craw: ct.fcf, rk: '$', rg: 1, delta: dv(v, 'pct', 1, 'vs plan'), sev: sevOf(v, 'pct'), per: 'Jan to Sep, closed', ref: `Plan ${fmt$(ct.fcf)}. We turn ${(ca.conv * 100).toFixed(0)}% of profit into cash, against 90% planned`, prov: 'ERP, books closed', insight: 'India distributors are holding more of our stock on credit', say: v < -.005 ? `Free cash flow is ${Math.abs(v * 100).toFixed(0)}% below plan because India distributors owe us more.` : 'Cash is on plan.' }; }
    case 'PEN': { const p = penetration(D.f);
      return { value: p.now.toFixed(1) + '%', raw: p.now, craw: p.ly, rk: 'pts', rg: 1, delta: dv(p.chg, 'pts', 1, 'vs last year'), sev: sevOf(p.chg, 'pts'), per: '52 weeks to Sep', ref: `Last year ${p.ly.toFixed(1)}%`, prov: 'Consumer panel', insight: 'Bolt Brew UK lost 0.9M buyers to Volt Coffee', say: 'Bolt Brew is losing UK buyers to Volt Coffee.' }; }
    case 'PENF': { const bz = buyers(D.f), dp = bz.pen - bz.penLY, df = bz.freq / bz.freqLY - 1, worst = bz.rows.slice().sort((a, b) => a.dp - b.dp)[0];
      return { value: bz.pen.toFixed(1) + '%', raw: bz.pen, craw: bz.penLY, rk: 'pts', rg: 1, delta: dv(dp, 'pts', 1, 'households vs last year'), sev: worst && worst.dp < -1 ? 'warn' : dp < -.2 ? 'warn' : 'good', per: '52 weeks to Sep', ref: `Frequency ${bz.freq.toFixed(1)} trips a year ${sPct(df)}, repeat rate ${(bz.rep * 100).toFixed(0)}%`, prov: 'Consumer panel', insight: worst ? `${worst.label}: ${worst.why === 'Both' ? 'fewer buyers, buying less often' : worst.why.toLowerCase()} ${sPts(worst.dp)}` : '', say: worst && worst.dp < -1 ? (worst.why === 'Both' ? `${worst.label} is losing buyers, and the ones who stay buy less often.` : `${worst.label} is losing buyers, while the rest buy as often as before. That is a brand problem, not a price problem.`) : 'Buyer numbers are holding.' }; }
    case 'CHINV': { const cs = channelStock(D.f), w = cs[0];
      return { value: w.cover.toFixed(1) + ' wks', raw: w.cover, craw: w.normal, rk: 'wks', rg: -1, delta: `<span class="dv ${w.cover > w.normal * 1.15 ? 'unf' : 'neu'}">vs ${w.normal} wks normal</span>`, sev: w.cover > w.normal * 1.3 ? 'crit' : w.cover > w.normal * 1.15 ? 'warn' : 'good', per: 'Week ' + CW, ref: w.label, prov: 'Distributor system', insight: 'Expect lower orders from India distributors', say: `${w.label} holds ${w.cover.toFixed(1)} weeks of stock, against ${w.normal} normally.` }; }
    case 'OTIF': { const ac = accountsData(D.f, { ...P, w0: CW - 3, w1: CW, wa: CW }), v = ac.reduce((x, a) => x + a.otif * a.a, 0) / (ac.reduce((x, a) => x + a.a, 0) || 1), br = ac.filter(a => a.otif < a.otifT), lost = agg(D.f, 'A', CW - 3, CW).lost;
      return { value: plain(v), raw: v, craw: .95, rk: 'pts', rg: 1, delta: dv((v - .95) * 100, 'pts', 1, 'vs 95% target'), sev: br.length ? 'warn' : v >= .95 ? 'good' : 'warn', per: '4 weeks', ref: `${br.length} retailers below contract, ${fmt$(lost)} of lost sales`, prov: 'Customer contracts', insight: br.length ? `${fmt$(br.reduce((x, a) => x + a.fines, 0))} in fines, caused by the Indonesia port delays` : 'All retailers within contract', say: br.length ? `${br.map(a => a.name).join(' and ')} are below their delivery contracts, and we lost ${fmt$(lost)} of sales in 4 weeks.` : 'All retailers within contract.' }; }
    case 'INVD': { const wh = warehouseData(D.f), avg = wh.reduce((x, w) => x + w.days, 0) / wh.length, rk = stockRisk(D.f);
      return { value: avg.toFixed(0) + ' days', raw: avg, craw: K.INV_TARGET_DAYS, rk: 'days', rg: 0, delta: `<span class="dv neu">vs ${K.INV_TARGET_DAYS}-day target</span>`, sev: rk.length > 4 ? 'crit' : rk.length ? 'warn' : 'good', per: 'Week ' + CW, ref: `${rk.length} items will run out before resupply`, prov: 'Supply planner', insight: 'Orchard Juice in Indonesia has 4 days of stock left', say: `${rk.length} items will run out before they can be restocked.` }; }
    case 'RISK': { const r = supplyRisk(D.f), near = r.filter(x => x.first < 4), later = r.filter(x => x.first >= 4), acc = K.FORECAST_ACC, cs = countriesOf(D.f), fa = cs.reduce((x, c) => x + acc[c], 0) / cs.length, nw = later[0];
      return { value: String(r.length), raw: r.length, rk: 'n0', rg: -1, valueUnit: r.length === 1 ? 'item' : 'items', delta: `<span class="dv ${near.length ? 'unf' : 'neu'}">${near.length} in the next 4 weeks, ${later.length} in weeks 5 to 13</span>`, sev: near.length ? 'crit' : later.length ? 'warn' : 'good', per: `To ${wkLabel(CW + RISK_H)}`, ref: `Forecast accuracy ${(fa * 100).toFixed(0)}%, target ${(acc.target * 100).toFixed(0)}%`, prov: 'Supply planner', insight: nw ? `New: ${K.BMAP[nw.b].name} in ${K.CMAP[nw.c].name} runs short from ${wkLabel(CW + 1 + nw.first)}` : near.length ? `${near[0].sku} at ${near[0].wh} has ${near[0].days.toFixed(0)} days left` : 'No stock-out risk in 13 weeks', say: `${r.length} items will run short in the next 13 weeks${nw ? `, including ${K.BMAP[nw.b].name} in the ${K.CMAP[nw.c].name} holiday peak` : ''}.` }; }
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
// Every card and highlight bar reads in the same order:
// 1 status colour and word, 2 which metric, 3 how far off and in which direction, 4 the actual value, 5 the trend, 6 what is behind it
const VS = { ASK: 'last year', SSG: 'the category', SALES: 'target', SHARE: 'last year', PENF: 'last year', PEN: 'last year', DIST: 'last year', EPS: 'analyst estimates', FCF: 'plan', SAFQ: 'target', QUAL: 'target', CHINV: 'normal', OTIF: 'the 95% target', INVD: 'target' };
function gapOf(id, x) {
  if (x.raw == null || x.craw == null || !isFinite(x.raw) || !isFinite(x.craw)) return null;
  const amt = changeText(id, x.rk, x.craw, x.raw).replace(/[()]/g, '').replace(/^[+−]/, ''), vs = VS[id] || compName(), up = x.raw > x.craw;
  if (!/[1-9]/.test(amt.replace(/\$|bps|pts|wks|days|x/g, ''))) return { arrow: '', amt: '', words: 'In line with ' + vs };
  return { arrow: up ? '▲' : '▼', amt, words: (x.rg > 0 ? (up ? 'ahead of ' : 'behind ') : (up ? 'above ' : 'below ')) + vs };
}
const gapHtml = g => g && g.amt ? `<i>${g.arrow}</i><b class="num">${g.amt}</b> ${g.words}` : g ? g.words : '';
const lowFirst = t => t.charAt(0).toLowerCase() + t.slice(1);
function cardHtml(id, i) {
  const x = withF({}, () => card(id)), t = withF({}, () => trendOf(id)), g = gapOf(id, x);
  const since = id === 'FCF' && t ? `<span class="dv neu">${fmt$(t.a[t.a.length - 1] - t.a[t.a.length - 2])} <small>generated in Sep</small></span>` : t ? changeHtml(id, x, t.a[t.a.length - 2], t.a[t.a.length - 1], t.step === 'week' ? 'vs last week' : t.step === 'month' ? 'vs last month' : 'vs prior read') : '';
  const val = `${x.value}${x.valueUnit ? ' ' + x.valueUnit : ''}`, ref = (x.ref || '').split(/, |\. /)[0];
  const gap = g ? `<span class="c-gap">${g.arrow ? `<i>${g.arrow}</i><b class="num">${g.amt}</b>` : ''}<span>${g.amt ? g.words : `<b class="flat">${g.words}</b>`}</span></span>`
    : `<span class="c-gap"><b class="num">${val}</b></span>`;
  const now = g ? `<span class="c-now">Now <b class="num">${val}</b>${ref && ref.length <= 28 && (id === 'CHINV' || /^(Plan|Last year|Latest estimate|Last month|Guidance|Target)\b/.test(ref)) ? `, ${esc(lowFirst(ref))}` : ''}</span>` : `<span class="c-now">${x.delta}</span>`;
  return `<button class="card s-${x.sev} ${OPEN === id ? 'on' : ''}" data-open="${id}" aria-expanded="${OPEN === id}" style="--d:${i * 50}ms" title="${esc(x.ref + '. Source: ' + x.prov)}">
    <span class="c-head"><span class="c-sig">${SEV[x.sev]}</span><span class="c-per">${esc(x.per)}</span></span>
    <span class="c-name">${esc(CARD_DEF[id][0])}<span class="info" data-def="${id}" aria-hidden="true">i</span></span>
    ${gap}${now}
    <span class="c-tr">${trendSvg(t, x.sev)}<span class="c-tr-l"><span class="c-tr-n">${t ? esc(t.lab) : ''}${t && t.c ? ` <i class="dash-k"></i>${id === 'SHARE' ? 'last year' : id === 'EPS' ? 'consensus' : id === 'SSG' ? 'category' : id === 'SAFQ' || id === 'OTIF' ? 'target' : id === 'CHINV' ? 'normal' : compLab().toLowerCase()}` : ''}</span>${since}</span></span>
    <span class="c-ins"><span>${esc(x.insight)}</span><i class="c-go" aria-hidden="true">→</i></span><span class="c-slot">${SLOTS[CARD_SLOT[id]]}</span></button>`;
}

/* ---------- summary ---------- */
function summaryView(ex) {
  const ids = ROLE_CARDS[state.role], cs = ids.map(id => ({ id, ...withF({}, () => card(id)) })), bad = cs.filter(c => c.sev !== 'good');
  // each headline sentence opens the metric it is about
  const head = bad.length ? bad.slice(0, 2).map(c => `<button class="say" data-open="${c.id}"${c.id === 'TRADE' && /losing money/.test(c.say) ? ' data-then="F5"' : ''} title="Open ${esc(CARD_DEF[c.id][0])}">${emph(c.say)}<span class="say-go" aria-hidden="true"> →</span></button>`).join(' ') : 'Everything you own is on track.';
  const watch = [];
  // other issues: a plain sentence on what is wrong and why, with what it is worth on the right
  const cap = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  const dot = t => /[.!?]$/.test(t) ? t : t + '.';
  if (state.role === 'CSO') { const sc = cs.find(c => c.id === 'SALES'); if (sc && sc.heads > 3) watch.push({ t: 'Sales heads', l: 'Behind target', sev: 'warn', issue: `${sc.heads} of 10 sales heads will miss October at the current pace.`, go: { card: 'SALES' } }); }
  const CARD_WHY = { EPS: 'Oat costs and promotions are hurting margin, and overhead savings only cover part of it', GM: 'Oat costs are rising faster than our prices', OSG: 'Bolt Brew UK and Orchard Juice Indonesia are behind, and Glow India is ahead', CHINV: 'We shipped 13% more than shoppers bought after a distributor incentive', RISK: 'The causes are the Indonesia port delays and Diwali demand in India' };
  bad.slice(2).forEach(c => { const gap = c.raw != null && c.craw != null ? changeText(c.id, c.rk, c.craw, c.raw) : '';
    watch.push({ t: CARD_DEF[c.id][0], l: 'Core metric', sev: c.sev, gap: gapOf(c.id, c) ? gapHtml(gapOf(c.id, c)) : `<b class="num">${c.value}${c.valueUnit ? ' ' + c.valueUnit : ''}</b>`, issue: `${dot(c.say)}${CARD_WHY[c.id] ? ' ' + dot(CARD_WHY[c.id]) : ''}`, imp: gap ? ['Gap', gap, 'unf'] : null, go: { card: c.id } }); });
  ex.filter(e => e.d.sev !== 'good').slice(0, 6 - Math.min(watch.length, 2)).forEach(e => { const d = e.d, imp = d.cls === 'loading' ? ['Close to expiry', fmt$(d.value), 'unf'] : d.cls === 'opportunity' ? ['Full-year upside', '+' + fmt$(Math.abs(d.fyNs)), 'fav'] : d.fyCm ? ['Full-year margin', s$(d.fyCm), d.fyCm < 0 ? 'unf' : 'fav'] : ['Full-year sales', s$(d.fyNs), d.fyNs < 0 ? 'unf' : 'fav'];
    const amt = imp[1].replace(/[()+−]/g, ''), neg = /−/.test(imp[1]);
    const gap = d.cls === 'loading' ? `<b class="num">${amt}</b> of stock close to expiry` : d.cls === 'opportunity' ? `<i>▲</i><b class="num">${amt}</b> upside for the full year` : `<i>${neg ? '▼' : '▲'}</i><b class="num">${amt}</b> full-year ${d.fyCm ? 'margin' : 'sales'} ${neg ? 'below' : 'above'} plan`;
    watch.push({ t: e.title, l: d.label, sev: d.sev, gap, issue: `${dot(d.cause)}${d.dir === 'worse' ? ' It has been getting worse over the last 4 weeks.' : ''}`, imp, go: { card: cardFor(d.cls), f: e.f } }); });
  const roleOf = p => { const r = (p || '').split(', ')[1]; return r ? 'the ' + r : first(p); };
  // next steps = the top open actions from My actions, each with where it came from and why
  const openActs = actionsList().filter(a => a.status !== 'Done');
  const next = openActs.slice(0, 3).map(a => ({ id: a.id, sev: a.sev, t: `Ask ${roleOf(a.poc)} to ${(a.title.charAt(0).toLowerCase() + a.title.slice(1).split(/;|\.(?=\s|$)/)[0].replace(/ and extend.*$/, '')).replace(/\.$/, '')}.`,
    why: a.why.split(/(?<=[.!?])\s/)[0],
    src: `Due ${fmtD(a.due)}${a.overdue ? ' (overdue)' : ''}. ${/^new/.test(a.id) ? `You created it on ${fmtD(a.assigned)}.` : a.status === 'New' ? 'Suggested by Pulse, not assigned yet.' : `You assigned it on ${fmtD(a.assigned)}.`}` }));
  const eps = state.role === 'CEO' ? (() => { const e = K.finance({}, 'A', 1, NW).eps, g = K.FIN.guidance.eps, cs = K.FIN.consensus.eps, below = e < g[0], sev = below ? 'crit' : e < cs ? 'warn' : 'good';
    const gap = below ? `<i>▼</i><b>$${(g[0] - e).toFixed(2)}</b> below the bottom of guidance` : e > g[1] ? `<i>▲</i><b>$${(e - g[1]).toFixed(2)}</b> above guidance` : 'Within guidance';
    return `<button class="kbar s-${sev}" data-open="EPS" title="Open earnings per share"><span class="kb-sig">${below ? 'Below guidance' : SEV[sev]}</span><span class="kb-main"><span class="kb-name">Full-year earnings per share</span><span class="kb-gap">${gap}</span><span class="kb-ctx">Guidance is $${g[0].toFixed(2)} to $${g[1].toFixed(2)} and analysts expect $${cs.toFixed(2)}</span></span><span class="kb-val"><b class="num">$${e.toFixed(2)}</b><small>our outlook</small></span><i class="kb-go" aria-hidden="true">→</i></button>`; })() : '';
  return `<div class="sum-card"><div class="sum-main">
      <p class="sum-meta"><span class="ai" data-def="AI">AI summary</span> Data to 11 Oct <span class="info" data-def="FRESH" tabindex="0" aria-label="Data freshness">i</span></p>
      <h1 class="sum-h">${head}</h1>${eps}
      <div class="sum-watch"><h4>Other issues</h4><div class="iss-list">${watch.slice(0, 6).map((w, i) => `<button class="iss s-${w.sev}" data-watch="${i}" ${i >= 3 ? 'hidden data-more' : ''} title="Open the analysis"><span class="iss-b"><span class="iss-s">${SEV[w.sev] || ''}${w.l && w.l !== SEV[w.sev] ? `<span class="iss-l">${esc(w.l)}</span>` : ''}</span><span class="iss-h"><b>${esc(w.t)}</b>${w.gap ? `<span class="iss-g">${w.gap}</span>` : ''}</span><span class="iss-t">${esc(w.issue || '')}</span></span><span class="iss-go" aria-hidden="true">→</span></button>`).join('') || '<span class="muted">Nothing else needs you.</span>'}</div>${watch.length > 3 ? `<button class="link iss-more" data-iss-more>Show ${Math.min(6, watch.length) - 3} more issues</button>` : ''}</div></div>
    <div class="sum-next"><h4>Next steps <span class="h4-sub">(top ${Math.min(3, openActs.length)} of ${openActs.length} open actions)</span></h4><ul class="next">${next.map(n => `<li><button class="nx" data-goact="${esc(n.id)}" title="Show this action in My actions"><span class="nx-t">${esc(n.t)}</span><span class="nx-w"><b>Why:</b> ${esc(n.why)}</span><span class="nx-s">${esc(n.src)}</span></button></li>`).join('') || '<li class="muted">No open actions.</li>'}</ul>${openActs.length ? '<button class="link nx-all" data-goact="">See all actions ↓</button>' : ''}</div></div>`
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
      { h: `Cash is ${fmt$(Math.abs(A.fcf - T.fcf))} ${A.fcf < T.fcf ? 'short' : 'ahead'} of plan`, sub: 'Free cash flow, plan to actual, whole company, January to September', id: 'b-wf', src: 'ERP, books closed to September' },
      { h: `${(A.conv * 100).toFixed(0)}% of profit turned into cash, against a 90% target`, sub: 'Cash conversion and its drivers', html: stats([['Free cash flow', fmt$(A.fcf), 'plan ' + fmt$(T.fcf)], ['Cash conversion', (A.conv * 100).toFixed(0) + '%', 'target 90%'], ['Capex', fmt$(A.capex), 'plan ' + fmt$(T.capex)], ['Working capital build', fmt$(A.wc), 'plan ' + fmt$(T.wc)]]), src: 'ERP' },
      { h: 'Where cash is tied up', sub: 'Channel stock on credit and our own inventory', html: `<div class="tbl-wrap"><table class="t"><thead><tr><th>Where</th><th class="r">Now</th><th class="r">Normal</th></tr></thead><tbody>${chan.map(r => `<tr class="click" tabindex="0" data-slice='${JSON.stringify(r.slice)}'><td>${esc(r.label)} (distributors)</td><td class="r num">${r.cover.toFixed(1)} wks</td><td class="r num">${r.normal} wks</td></tr>`).join('')}${inv.map(w => `<tr><td>${esc(w.name)} (our warehouse)</td><td class="r num">${w.days.toFixed(0)} days</td><td class="r num">${K.INV_TARGET_DAYS} days</td></tr>`).join('')}</tbody></table></div>`, src: 'Distributor system and supply planner' }],
      after: () => waterfall($('#b-wf'), br, { startLabel: 'Plan', fmt: fmt$, sfmt: v => (v >= 0 ? '+' : MINUS) + fmt$(Math.abs(v)) }) }, true); },
  PEN: () => { const f = filter(), rows = []; for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const p = K.PENETRATION[b + '|' + c]; if (p) rows.push({ label: K.BMAP[b].name + ' in ' + K.CMAP[c].name, now: p[1], ly: p[0], chg: p[1] - p[0] }); }
    rows.sort((a, b) => a.chg - b.chg); const sw = K.SWITCHING.filter(s => !f.c || f.c.map(c => K.CMAP[c].name).includes(s.where));
    openLevel({ crumb: 'Household penetration', title: [rows[0].chg < 0 ? `${rows[0].label} lost the most buyers ${sPts(rows[0].chg)}.` : `No brand is losing buyers here.`, rows.length > 1 && rows[rows.length - 1].chg > 0 ? `${rows[rows.length - 1].label} gained the most ${sPts(rows[rows.length - 1].chg)}.` : ''].join(' ').trim(), blocks: [
      { h: 'Who is gaining and losing buyers', sub: 'Share of households buying in the last 52 weeks, and the change since last year (points)', html: divBars(rows.slice(0, 4).concat(rows.slice(-4)).map(r => ({ label: r.label, v: r.chg })), v => sPts(v).replace(' pts', '')), src: 'Consumer panel, to September' },
      { h: 'Where lost buyers went', sub: 'Buyers who switched to competitors, in millions of households', html: `<div class="tbl-wrap"><table class="t"><thead><tr><th>From</th><th>To</th><th>Where</th><th class="r">Buyers</th><th>Likely reason</th></tr></thead><tbody>${sw.map(s => `<tr><td>${esc(s.from)}</td><td>${esc(s.to)}</td><td>${esc(s.where)}</td><td class="r num">${s.buyers}M</td><td>${esc(s.note)}</td></tr>`).join('')}</tbody></table></div>`, src: 'Consumer panel' }] }, true); },
};
// RGM checks: one analysis from the RGM tool, shown in place
const RGM = {
  SHARE: { label: 'Re-check price and promotion plan', scope: 'Bolt Brew Coffee, UK, convenience', title: 'Bolt Brew UK: which promotion wins back share at a profit?', chip: 'From the RGM tool, scenario run on 14 October 2026', rows: [['Price-marked pack £1.19 (current)', '+0.2 pts', '0.50x', '−£0.4M', 'crit'], ['Deeper 25% price cut', '+1.1 pts', '0.62x', '−£1.1M', 'crit'], ['2 for £2.20 multibuy (recommended)', '+0.8 pts', '1.35x', '+£0.6M', 'good'], ['Hold price, +visibility only', '+0.3 pts', '1.10x', '+£0.1M', 'warn']], cols: ['Option', 'Share won back', 'Promo ROI', 'Margin effect'], head: 'Volt Coffee is 12% cheaper, which makes Bolt Brew 14% more expensive. The current price-marked pack loses money. A 2 for £2.20 multibuy wins back most of the share and still makes a profit.' },
  SALES: { label: 'Re-check promotion plan', scope: 'Orchard Juice, FreshMart, Indonesia', title: 'FreshMart juice bundle: run now, move it, or shrink it?', chip: 'From the RGM tool and supply planner, run on 14 October 2026', rows: [['Run as planned, weeks 43 to 46', '$0.9M', '55% stock ready', 'OTIF breach risk', 'crit'], ['Move to weeks 47 to 50 (recommended)', '$1.3M', '95% stock ready', 'Contract kept', 'good'], ['Halve the volume, keep dates', '$0.6M', '90% stock ready', 'Contract kept', 'warn']], cols: ['Option', 'Sales delivered', 'Stock', 'Delivery contract'], head: 'Only 55% of the stock for the bundle is ready, and Orchard Juice supply stays near 85% until week 44. Moving the bundle to weeks 47 to 50 sells about $0.4M more and keeps FreshMart above its 95% delivery target.' },
  TRADE: { label: 'Review promotion results', scope: 'Crunch Chips, BigBox, USA', title: 'Crunch Chips at BigBox: where did the Buy-2-get-1 money go?', chip: 'From the RGM tool, after-the-event analysis', rows: [['Extra sales margin before checks', '$8.1M', '', '', 'good'], ['Our own sales moving into the deal', '−$2.7M', '', '', 'crit'], ['Shoppers stocking up (sales borrowed from later)', '−$1.4M', '', '', 'crit'], ['Real extra margin', '$5.4M', 'on $9.8M spend', 'ROI 0.55x', 'crit']], cols: ['Step', 'Margin', '', ''], head: 'Sales beat plan, but a third of the extra margin was just our own sales moving into the deal. Each $1 spent on the promotion earned back 55 cents. We recommend replacing it with a multibuy at 20% depth.' },
  GM: { label: 'Review promotion results', alias: 'TRADE' },
};
// why the RGM tool recommends what it does: the rule, the evidence, and what has to hold true
const RGM_WHY = {
  SHARE: { pick: 'the 2 for £2.20 multibuy', rule: 'Pick the option that wins back the most share, earns back more than £1 for every £1 spent, and improves margin.',
    why: [['It closes the gap where shoppers notice it', 'At 2 for £2.20 each can costs £1.10, level with Volt Coffee at £1.09, and we do not have to cut our single-can price. That protects our prices in the other channels.'],
      ['It wins most of the share back, profitably', 'It wins back 0.8 points, about three quarters of what a deeper cut would win. Each £1 earns back £1.35 and margin improves by about £0.6M.'],
      ['The deeper 25% cut buys share at a loss', 'It wins back 1.1 points but earns back only 62p per £1, costs about £1.1M of margin, and Volt can match a price cut within weeks.'],
      ['It fits how the lost buyers shop', 'The consumer panel shows the 0.9M buyers who left are convenience shoppers buying 2 or more cans a week. A multibuy rewards exactly that.'],
      ['Multibuys have paid back here before', 'Sunrise Oats 2 for £5 at GreenGrocer earned back £1.21 per £1 this year. The current price-marked pack earns back 50p, the worst option.']],
    check: ['Volt does not cut its price again in the next 8 weeks', 'CornerShop and the other convenience chains accept the multibuy (the UK Sales Director confirms by 30 October)', 'The extra volume (about 18%) fits plant and warehouse capacity (the Leeds plant is at 74%)', 'We stop the price-marked pack to pay for it, so total trade spend stays on plan'] },
  SALES: { pick: 'moving the bundle to weeks 47 to 50', rule: 'Pick the option that delivers the most sales without breaching a delivery contract.',
    why: [['Stock decides it', 'Only 55% of the bundle stock is ready for weeks 43 to 46, against 95% by week 47.'], ['Running now risks a fine and a breach', 'FreshMart\'s contract requires 95% of orders on time and in full, and a half-stocked promotion would push us further below that.'], ['Moving it sells more', 'About $1.3M of sales against $0.9M if we run it now, because it runs fully stocked.']],
    check: ['FreshMart agrees the new dates', 'Juice supply recovers from week 44, as the supplier has confirmed'] },
  TRADE: { pick: 'replacing Buy-2-get-1 with a 20% multibuy', rule: 'Repeat promotions that earn back at least £1 per £1 spent. Fix or stop the rest.',
    why: [['The headline lift was misleading', 'Sales beat plan, but a third of the extra margin was our own sales moving into the deal, and shoppers stocked up early.'], ['The real return is 55 cents per $1', 'After those effects, $9.8M of spend earned $5.4M of extra margin.'], ['A shallower multibuy keeps most of the volume', 'Past 20% events at BigBox kept about 80% of the lift at half the cost.']],
    check: ['BigBox accepts the change in its joint business plan', 'No competitor runs a deeper deal in the same weeks'] },
};
RGM_WHY.GM = RGM_WHY.TRADE;
function rgmWhyBlock(key) {
  const w = RGM_WHY[key] || RGM_WHY[(RGM[key] || {}).alias]; if (!w) return null;
  return { h: `Why the RGM tool recommends ${w.pick}`, sub: w.rule, wide: true, html: `<div class="why-grid"><ol class="why">${w.why.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ol><div class="why-check"><h4>What has to hold true</h4><ul>${w.check.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div></div>`, src: 'RGM tool, consumer panel and after-the-event analysis (illustrative)' };
}
function openRgm(key) {
  const r = RGM[key].alias ? RGM[RGM[key].alias] : RGM[key];
  openLevel({ crumb: 'RGM check', title: r.head, rgm: true, blocks: [{ h: r.title, sub: r.chip + ' (illustrative)', html: `<div class="tbl-wrap"><table class="t rgm"><thead><tr>${r.cols.map((c, i) => `<th class="${i ? 'r' : ''}">${c}</th>`).join('')}</tr></thead><tbody>${r.rows.map(x => `<tr class="${x[4] === 'good' && /recommended|Real/.test(x[0]) ? 'rec' : ''}"><td>${esc(x[0])}</td>${x.slice(1, 4).map(v => `<td class="r num">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
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
  return { h: 'Below gross margin: marketing, delivery and overheads', sub: `Whole company, ${P.label} ${compShort()}`, html: stats([['Marketing spend', fmt$(a.ap), dv(vr(a.ap, c.ap), 'pct', -1, compShort())], ['Marketing as % of net sales', pct1(a.ap / a.ns), `${compLab().toLowerCase()} ${pct1(c.ap / c.ns)}`], ['Delivery per case', '$' + (a.dist / a.vol).toFixed(2), dv(vr(a.dist / a.vol, c.dist / c.vol), 'pct', -1, compShort())], ['Overheads', fmt$(a.overhead), dv(vr(a.overhead, c.overhead), 'pct', -1, compShort())]]), src: 'ERP and FP&A plan' };
}
const RISKS_OPPS = [
  ['Risk', 'Oat costs stay 18% higher through Q4 as our price lock runs out', -.03, 'Medium', 'COO'],
  ['Risk', 'India distributors cut their stock by more than planned', -.02, 'High', 'CSO'],
  ['Risk', 'Indonesia juice supply recovery slips past week 44', -.01, 'Medium', 'COO'],
  ['Opportunity', 'The overhead freeze is extended through Q4', .02, 'High', 'CFO'],
  ['Opportunity', 'The Diwali Glow digital campaign keeps beating plan', .02, 'Medium', 'CMO'],
  ['Opportunity', 'A UK multibuy replaces the price-marked pack (see the RGM check)', .01, 'Medium', 'CMO'],
];
function riskOppBlock() {
  const e = K.finance({}, 'A', 1, NW).eps, risk = RISKS_OPPS.filter(r => r[2] < 0).reduce((x, r) => x + r[2], 0), opp = RISKS_OPPS.filter(r => r[2] > 0).reduce((x, r) => x + r[2], 0), g = K.FIN.guidance.eps;
  return { h: `Outlook range $${(e + risk).toFixed(2)} to $${(e + opp).toFixed(2)}, against guidance of $${g[0].toFixed(2)} to $${g[1].toFixed(2)}`, sub: 'Risks and opportunities that are not in the outlook, and what each is worth in EPS', wide: true,
    html: tbl(['Type', '<span>What</span>', 'EPS impact', 'Likelihood', 'Owner'], RISKS_OPPS.map(r => `<tr><td>${r[0] === 'Risk' ? '<span class="pill sev crit">Risk</span>' : '<span class="pill sev good">Opportunity</span>'}</td><td>${esc(r[1])}</td><td class="r num">${dv(r[2], 'eps', 1)}</td><td class="r">${r[3]}</td><td class="r">${r[4]}</td></tr>`), 'Even if every opportunity lands, the outlook only reaches the bottom of guidance.'), src: 'FP&A risk and opportunity register' };
}

/* ---------- CFO: gross-to-net ---------- */
function g2nBlocks(f, P) {
  const A = agg(f, 'A', P.w0, P.w1), C = compAgg(f, P), L_ = compLab();
  const br = { start: A.gs, end: A.ns - A.cogs, items: [['Trade spend', -A.tr, 'tr'], ['Returns', -A.ret, 'ret'], ['Net sales', 0, 'ns', 'sub'], ['Cost of goods', -A.cogs, 'cogs']] };
  const r = (l, a, c, rate, rc, good) => `<tr><td>${l}</td><td class="r num">${fmt$(a)}</td><td class="r num">${fmt$(c)}</td><td class="r num">${dv(a - c, '$', good)}</td><td class="r num">${rate == null ? '' : pct1(rate)}</td><td class="r num">${rate == null ? '' : dv((rate - rc) * 1e4, 'bps', good)}</td></tr>`;
  return [{ h: 'Gross-to-net walk: where each $1 of gross sales goes', sub: `${nameOf(f)}, ${P.label}, actual`, id: 'b-g2n', src: 'ERP, trade accrued' },
    { h: `Gross-to-net ${compShort()}`, sub: 'Rates: trade and returns are a % of gross sales, and cost of goods and margin are a % of net sales', html: tbl(['Line', 'Actual', L_, 'Variance', 'Rate', 'Rate change'], [r('Gross sales', A.gs, C.gs, null, null, 1), r('Trade spend', A.tr, C.tr, A.tr / A.gs, C.tr / C.gs, -1), r('Returns', A.ret, C.ret, A.ret / A.gs, C.ret / C.gs, -1), r('<b>Net sales</b>', A.ns, C.ns, null, null, 1), r('Cost of goods', A.cogs, C.cogs, A.cogs / A.ns, C.cogs / C.ns, -1), r('<b>Gross margin</b>', A.ns - A.cogs, C.ns - C.cogs, (A.ns - A.cogs) / A.ns, (C.ns - C.cogs) / C.ns, 1)], 'Trade spend is booked at agreed rates, and deductions are settled about 6 weeks later.'), src: 'ERP, trade accrued' }];
}

/* ---------- CMO: shopper sales, A&P, buyers ---------- */
function openSSG() {
  const f = filter(), P = win(), s = shopper(f, P.w0, P.wa), cs = countriesOf(f).filter(c => has(sub(f, { c: [c] }))), bs = brandsOf(f).filter(b => has(sub(f, { b: [b] })));
  const cell = (b, c) => { const ff = sub(f, { b: [b], c: [c] }); if (!has(ff)) return '<td class="hm na">n/a</td>'; const x = shopper(ff, P.w0, P.wa), d = (x.g - x.cat) * 100, lv = d >= 2 ? 'g2' : d >= 0 ? 'g1' : d >= -2 ? 'r1' : 'r2'; return `<td class="hm ${lv}" ${sliceAttr(ff)} title="Shopper sales ${sPct(x.g)} against category ${sPct(x.cat)}"><b>${sPts(d).replace(' pts', '')}</b><small>${sPct(x.g)}</small></td>`; };
  const grid = `<div class="tbl-wrap"><table class="t hmap"><thead><tr><th>Brand</th>${cs.map(c => `<th class="r">${K.CMAP[c].name}</th>`).join('')}</tr></thead><tbody>${bs.map(b => `<tr><td>${K.BMAP[b].name}</td>${cs.map(c => cell(b, c)).join('')}</tr>`).join('')}</tbody></table></div><p class="foot">Each cell shows shopper sales growth minus category growth, in points, with shopper sales growth underneath. Click a cell to open that brand and market.</p>`;
  const rows = bs.map(b => { const x = shopper(sub(f, { b: [b] }), P.w0, P.wa); return { b, ...x }; }).sort((a, b) => (a.g - a.cat) - (b.g - b.cat));
  const sb = tbl(['Brand', 'Shopper sales', 'Category', 'Shipments', 'Shipments minus shopper sales'], rows.map(r => `<tr ${sliceAttr(sub(f, { b: [r.b] }))}><td>${K.BMAP[r.b].name}</td><td class="r num">${sPct(r.g)}</td><td class="r num">${sPct(r.cat)}</td><td class="r num">${sPct(r.ship)}</td><td class="r num">${dv((r.ship - r.g) * 100, 'pts', 0)} <span class="muted">${r.ship - r.g > .01 ? 'stock building' : r.ship - r.g < -.01 ? 'destocking' : ''}</span></td></tr>`), 'Net sales (shipments) and shopper sales differ when retailers and distributors hold more or less of our stock. When shipments run well ahead of shoppers, it usually reverses later.');
  const ln = K.LAUNCHES.filter(l => (!f.b || f.b.includes(l.b)) && (!f.c || f.c.includes(l.c)));
  const lt = tbl(['Launch', 'Market', 'Weeks live', 'Distribution', 'Trial (% households)', 'Repeat', 'Sales'], ln.map(l => `<tr><td>${esc(l.name)}</td><td class="r">${K.CMAP[l.c].name}</td><td class="r num">${CW - l.w}</td><td class="r num">${vsPlan(l.dist * 100, l.distPlan * 100, v => v.toFixed(0) + '%')}</td><td class="r num">${vsPlan(l.trial, l.trialPlan, v => v.toFixed(1) + '%')}</td><td class="r num">${vsPlan(l.repeat * 100, l.repeatPlan * 100, v => v.toFixed(0) + '%')}</td><td class="r num">${vsPlan(l.sales, l.salesPlan, fmt$)}</td></tr>`), 'If repeat is below plan but trial is on plan, people tried it and did not come back. That points to the product or the price, not awareness.');
  const inn = K.INNOVATION, worstL = ln.slice().sort((a, b) => a.repeat / a.repeatPlan - b.repeat / b.repeatPlan)[0];
  openLevel({ crumb: 'Shopper sales', title: 'Shopper sales against the category', insight: `Shopper sales are ${s.g >= 0 ? 'up' : 'down'} ${pcn(s.g, 1)} on last year, while the category is ${s.cat >= 0 ? 'up' : 'down'} ${pcn(s.cat, 1)}. Shipments are ${s.ship >= 0 ? 'up' : 'down'} ${pcn(s.ship, 1)}, so ${s.ship > s.g ? 'stock is building in the channel' : 'the channel is destocking'}.${worstL ? ` ${worstL.name} is not getting repeat buyers (${(worstL.repeat * 100).toFixed(0)}% against ${(worstL.repeatPlan * 100).toFixed(0)}% planned).` : ''}`,
    blocks: [{ h: 'Where we beat or trail the category', sub: `Shopper sales growth minus category growth, ${P.label}`, html: grid, wide: true, src: 'Retailer checkout data and market data to 20 September' }, { h: 'Shopper sales against shipments, by brand', html: sb, src: 'Retailer checkout data and ERP' },
      { h: 'Launches: are they building?', sub: 'Actual against launch plan', html: lt, src: 'Consumer panel and retail audit' }, { h: `Sales from launches: ${pct1(inn.share)}, against a target of ${pct1(inn.target)}`, sub: 'Share of net sales from products launched in the last 3 years', html: stats([['Innovation share of sales', pct1(inn.share), `target ${pct1(inn.target)}`], ['Last year', pct1(inn.ly), dv((inn.share - inn.ly) * 100, 'pts', 1, 'vs last year')], ['Live launches', String(K.LAUNCHES.length), `${K.LAUNCHES.filter(l => l.sales >= l.salesPlan).length} on or above plan`]]), src: 'ERP' }] }, true);
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
  openLevel({ crumb: 'Marketing spend and return', title: 'Marketing spend and return', insight: `We have spent ${fmt$(A.ap)} on marketing, ${pcn(vr(A.ap, C.ap), 1)} ${A.ap >= C.ap ? 'over' : 'under'} ${state.comp === 'T' ? 'budget' : compName()}. Each $1 brings back $${r.toFixed(2)} (model, Q2), against $${rp.toFixed(2)} in the plan.${mv.length ? ` Moving ${fmt$(mv.reduce((x, m) => x + m.amt, 0))} of the TV budget that is left to digital would add about ${fmt$(mvGain)} of gross margin.` : ''}`,
    blocks: [{ h: 'Marketing spend so far against budget', sub: `${nameOf(f)}, actual to week ${CW}, then the committed plan`, id: 'b-ap', html: '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>Actual and committed</span><span><i class="dash"></i>Budget</span></div>', wide: true, src: 'ERP and media agency plan' },
      { h: 'Return by brand', sub: 'Extra gross margin per $1 of marketing (marketing mix model, Q2)', html: tbl(['Brand', 'Spend', state.comp === 'T' ? 'vs budget' : compShort(), 'Return', 'Plan'], byB.map(x => `<tr ${sliceAttr(x.ff)}><td>${K.BMAP[x.b].name}</td><td class="r num">${fmt$(x.ap)}</td><td class="r num">${dv(vr(x.ap, x.apT), 'pct', 0)}</td><td class="r num"><b>${x.r.toFixed(2)}x</b></td><td class="r num">${x.rp.toFixed(2)}x</td></tr>`)), src: 'Marketing mix model, Q2' },
      { h: 'Return by media', html: tbl(['Media', 'Spend', 'Share', 'Return'], media.map(m => `<tr><td>${m.m}</td><td class="r num">${fmt$(m.spend)}</td><td class="r num">${pct1(m.spend / A.ap)}</td><td class="r num"><b>${m.r.toFixed(2)}x</b></td></tr>`)), src: 'Marketing mix model, Q2' },
      { h: 'Live campaigns, last 4 weeks', sub: 'Sales lift against plan (campaign tracking, weekly)', html: live.length ? tbl(['Campaign', 'Market', 'Media', 'Spend', 'Lift vs plan'], live.map(c => `<tr><td>${esc(c.name)}</td><td class="r">${K.CMAP[c.c].name}</td><td class="r">${c.media}</td><td class="r num">${fmt$(c.spend)}</td><td class="r num">${vsPlan(c.lift * 100, c.planLift * 100, v => (v >= 0 ? '+' : MINUS) + Math.abs(v).toFixed(0) + '%')}</td></tr>`)) : '<p class="muted">No live campaigns in this selection.</p>', src: 'Campaign tracking' },
      { h: mv.length ? `Where to move money: about ${fmt$(mvGain)} more gross margin` : 'Where to move money', sub: 'Move 30% of the TV budget that is left to digital, where it earns more per $1', html: mv.length ? tbl(['Brand and market', 'Move', 'TV return', 'Digital return', 'Extra margin'], mv.map(m => `<tr ${sliceAttr({ b: [m.b], c: [m.c] })}><td>${K.BMAP[m.b].name} in ${K.CMAP[m.c].name}</td><td class="r num">${fmt$(m.amt)}</td><td class="r num">${m.rTv.toFixed(2)}x</td><td class="r num">${m.rDig.toFixed(2)}x</td><td class="r num">${dv(m.gain, '$', 1)}</td></tr>`), 'These are estimates from the marketing mix model. Check reach goals with the agency before moving any TV money.') : '<p class="muted">No TV budget left to move in this selection.</p>', src: 'Marketing mix model' }],
    after: () => lineChart($('#b-ap'), { x0: 1, x1: NW, h: 180, zero: true, today: CW + .5, yfmt: fmt$, series: [{ vals: cb, from: 1, to: NW, color: '#7b828b', w: 1.5, dash: '5 3' }, { vals: ca, from: 1, to: CW, color: 'var(--s1)', end: true }, { vals: ca, from: CW, to: NW, color: 'var(--s1)', dash: '4 3' }], tip: w => `<div class="th">Wk ${w}</div>${trow(w > CW ? 'Committed' : 'Actual', fmt$(ca[w]))}${trow('Budget', fmt$(cb[w]) + ' ' + sPct(vr(ca[w], cb[w])))}` }) }, true);
}
function openPENF() {
  const f = filter(), bz = buyers(f), rows = bz.rows.slice().sort((a, b) => a.dp - b.dp), lose = rows[0], less = rows.filter(r => r.why === 'Buying less often').sort((a, b) => a.df - b.df)[0];
  const pill = w => `<span class="pill sev ${w === 'Losing buyers' || w === 'Both' ? 'crit' : w === 'Buying less often' ? 'warn' : 'good'}">${w}</span>`;
  const sw = K.SWITCHING.filter(s => !f.c || f.c.map(c => K.CMAP[c].name).includes(s.where));
  openLevel({ crumb: 'Buyers and frequency', title: 'Buyers and frequency', insight: [lose && lose.dp < -.3 ? `${lose.label} lost the most buyers ${sPts(lose.dp)}, while the rest kept buying as often. That is a brand problem.` : 'No brand is losing buyers here.', less ? `${less.label} buyers are buying less often ${sPct(less.df)}. That points to price or occasion.` : ''].join(' ').trim(),
    blocks: [{ h: 'Losing buyers or buying less often?', sub: 'Share of households buying (52 weeks) and trips per buyer per year, against last year', wide: true, html: tbl(['Brand and market', 'Penetration', 'Change', 'Frequency', 'Change', 'Repeat', '<span>Diagnosis</span>'], rows.map(r => `<tr ${sliceAttr(r.slice)}><td>${esc(r.label)}</td><td class="r num">${r.pen.toFixed(1)}%</td><td class="r num">${dv(r.dp, 'pts', 1)}</td><td class="r num">${r.freq.toFixed(1)}</td><td class="r num">${dv(r.df, 'pct', 1)}</td><td class="r num">${(r.rep * 100).toFixed(0)}%</td><td>${pill(r.why)}</td></tr>`), 'If we are losing buyers, fix the brand (relevance, competitors, availability). If buyers buy less often, look at price, pack size and occasions.'), src: 'Consumer panel, 52 weeks to September' },
      { h: 'Where lost buyers went', sub: 'Buyers who switched to competitors, in millions of households', html: sw.length ? tbl(['From', 'To', 'Where', 'Buyers', '<span>Likely reason</span>'], sw.map(s => `<tr><td>${esc(s.from)}</td><td class="r">${esc(s.to)}</td><td class="r">${esc(s.where)}</td><td class="r num">${s.buyers}M</td><td>${esc(s.note)}</td></tr>`)) : '<p class="muted">No significant switching in this selection.</p>', src: 'Consumer panel' }] }, true);
}
function shareExtras(f) {
  const sov = Object.entries(K.SOV).filter(([k]) => { const [b, c] = k.split('|'); return (!f.b || f.b.includes(b)) && (!f.c || f.c.includes(c)); }).map(([k, v]) => { const [b, c] = k.split('|'); return { b, c, sov: v[0], som: v[1], gap: v[0] - v[1] }; }).sort((a, b) => a.gap - b.gap);
  const bh = Object.entries(K.BRAND_HEALTH).filter(([k]) => { const [b, c] = k.split('|'); return (!f.b || f.b.includes(b)) && (!f.c || f.c.includes(c)); }).map(([k, v]) => { const [b, c] = k.split('|'); return { b, c, v }; }).sort((a, b) => (a.v[1][1] - a.v[1][0]) - (b.v[1][1] - b.v[1][0])).slice(0, 8);
  const hc = (pair) => { const d = pair[1] - pair[0], sig = Math.abs(d) >= 2; return `${pair[1].toFixed(0)}% <span class="dv ${d >= 0 ? 'fav' : 'unf'}">${d >= 0 ? '▲' : '▼'} (${d >= 0 ? '+' : MINUS}${Math.abs(d).toFixed(1)})</span>${sig ? '<sup class="sig" title="Statistically significant (about 1,000 people)">sig</sup>' : ''}`; };
  return [{ h: 'Share of voice against share of market', sub: 'Brands that spend less than their share tend to lose share. Last 13 weeks.', html: sov.length ? tbl(['Brand and market', 'Share of voice', 'Share of market', 'Gap', '<span>Read</span>'], sov.map(r => `<tr><td>${K.BMAP[r.b].name} in ${K.CMAP[r.c].name}</td><td class="r num">${r.sov.toFixed(1)}%</td><td class="r num">${r.som.toFixed(1)}%</td><td class="r num">${dv(r.gap, 'pts', 1)}</td><td>${r.gap < -2 ? 'Spending less than its share' : r.gap > 2 ? 'Spending more than its share' : 'In line'}</td></tr>`)) : '<p class="muted">No media data for this selection.</p>', src: 'Media monitoring and market data' },
    { h: 'Brand health: biggest moves in consideration', sub: 'Share of category buyers, now against last year. Monthly tracker, about 1,000 people per market.', html: tbl(['Brand and market', 'Awareness', 'Consideration', 'Preference'], bh.map(r => `<tr ${sliceAttr({ b: [r.b], c: [r.c] })}><td>${K.BMAP[r.b].name} in ${K.CMAP[r.c].name}</td><td class="r num">${hc(r.v[0])}</td><td class="r num">${hc(r.v[1])}</td><td class="r num">${hc(r.v[2])}</td></tr>`), 'Sig marks a change of 2 points or more, which is big enough to be statistically significant at this sample size.'), src: 'Brand tracker, September' }];
}

/* ---------- COO: safety & quality, 13-week supply risk, cost extras ---------- */
function openSAFQ() {
  const s = K.SAFETY, q = K.QUALITY, f = filter(), sup = K.SUPPLIERS;
  const cpl = new Float64Array(NW + 1), tgt = new Float64Array(NW + 1); for (let w = 1; w <= CW; w++) { cpl[w] = K.COMPLAINTS[w]; tgt[w] = q.cpmuTarget; }
  const months = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  openLevel({ crumb: 'Safety and quality', title: 'Safety and quality', insight: `The injury rate is ${s.ltifr.toFixed(2)} per million hours, against a target of ${s.target.toFixed(2)}. One injury cost a worker time off this quarter, at ${s.incidents[0].site}. Complaints are below target and there are no recalls. Two suppliers are high risk.`,
    blocks: [{ h: `Injury rate ${s.ltifr.toFixed(2)} against a target of ${s.target.toFixed(2)}, improving for 12 months`, sub: 'Lost-time injuries per million hours, rolling 12 months', html: `<div class="mini-bars">${s.history.map((v, i) => `<span style="--h:${(v / .6 * 100).toFixed(0)}%" class="${v > s.target ? 'over' : ''}" title="${months[i]}: ${v.toFixed(2)}"><i></i><em>${months[i]}</em></span>`).join('')}<b class="tline" style="--t:${(s.target / .6).toFixed(3)}" title="Target ${s.target.toFixed(2)}"></b></div>`, src: 'Safety system' },
      { h: 'Incidents this quarter', html: tbl(['Site', 'Incident', 'Week', '<span>Status</span>'], s.incidents.map(x => `<tr><td>${x.site}</td><td class="r">${x.type}</td><td class="r num">Wk ${x.w}</td><td>${x.status}</td></tr>`)), src: 'Safety system' },
      { h: `Complaints ${q.cpmu} per million units, against a target of ${q.cpmuTarget}`, sub: 'Weekly, per million units sold', id: 'b-cpl', html: '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>Complaints</span><span><i class="dash"></i>Target</span></div>', src: 'Quality system' },
      { h: 'Holds, recalls and regulatory cases', html: stats([['Quality holds', String(q.holds), 'open'], ['Recalls', String(q.recalls), 'this year'], ['Regulatory cases', String(q.openCases), 'open'], ['Audits passed', '11 of 11', 'this year']]), src: 'Quality system' },
      { h: 'Supplier delivery and risk', sub: 'Deliveries from suppliers that were on time and in full, last 13 weeks', wide: true, html: tbl(['Supplier', 'Input', 'Delivery (OTIF)', 'Risk', '<span>Why</span>'], sup.map(x => `<tr><td>${x.name}</td><td class="r">${x.input}</td><td class="r num">${pct1(x.otif)}</td><td class="r"><span class="pill sev ${x.risk === 'High' ? 'crit' : x.risk === 'Medium' ? 'warn' : 'good'}">${x.risk}</span></td><td>${esc(x.note)}</td></tr>`)), src: 'Procurement system' }],
    after: () => lineChart($('#b-cpl'), { x0: Math.max(1, CW - 25), x1: CW, h: 160, yfmt: v => v.toFixed(1), series: [{ vals: tgt, from: Math.max(1, CW - 25), to: CW, color: '#7b828b', w: 1.5, dash: '5 3' }, { vals: cpl, from: Math.max(1, CW - 25), to: CW, color: 'var(--s1)', end: true }], tip: w => `<div class="th">Wk ${w}</div>${trow('Complaints per million', cpl[w].toFixed(2))}` }) }, true);
}
function openRISK() {
  const f = filter(), r = supplyRisk(f), weeks = Array.from({ length: RISK_H }, (_, i) => CW + 1 + i), cs = countriesOf(f).filter(c => has(sub(f, { c: [c] }))), near = r.filter(x => x.first < 4), later = r.filter(x => x.first >= 4);
  const heat = r.length ? `<div class="tbl-wrap"><table class="t heat"><thead><tr><th>Item and location</th>${weeks.map(w => `<th class="r">${wkLabel(w).replace(' ', '<br>')}</th>`).join('')}</tr></thead><tbody>${r.map(x => `<tr ${sliceAttr(x.slice)}><td>${esc(x.sku)}<small>${x.wh}, restock takes ${x.lead} days</small></td>${x.wk.map(d => `<td class="hc ${d < x.lead ? 'out' : d < x.lead + 2 ? 'low' : ''}">${d < x.lead + 2 ? d.toFixed(0) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="foot">Numbers are projected days of stock, shown only when they fall below the time it takes to restock plus a 2-day buffer. Red means we run out before a restock can arrive. Confirmed recovery plans are included.</p>` : '<p class="muted">No item runs short in the next 13 weeks.</p>';
  const fa = tbl(['Country', 'Forecast accuracy', 'Target', 'Bias', '<span>What it means</span>'], cs.map(c => { const a = K.FORECAST_ACC[c], b = K.FORECAST_BIAS[c]; return `<tr><td>${K.CMAP[c].name}</td><td class="r num">${(a * 100).toFixed(0)}%</td><td class="r num">${(K.FORECAST_ACC.target * 100).toFixed(0)}%</td><td class="r num">${sgn(b, Math.abs(b * 100).toFixed(0) + '%')}</td><td>${b > .05 ? 'Forecasts are too high, so stock builds up' : b < -.03 ? 'Forecasts are too low, so we run short' : 'No consistent bias'}</td></tr>`; }), 'Accuracy is 1 minus the average forecast error, measured by product and country with a 1-month lag. A plus sign for bias means we forecast more than we sold.');
  const pl = tbl(['Plant', 'Makes', 'OEE', 'Utilisation now', 'Next 13 weeks'], K.PLANTS.filter(p => cs.includes(p.c)).map(p => `<tr><td>${p.name}</td><td class="r">${p.makes}</td><td class="r num">${vsPlan(p.oee * 100, p.oeeT * 100, v => v.toFixed(0) + '%')}</td><td class="r num">${(p.util * 100).toFixed(0)}%</td><td class="r num"><b class="${p.util13 > .95 ? 'neg-t' : ''}">${(p.util13 * 100).toFixed(0)}%</b>${p.util13 > .95 ? ' <span class="pill sev crit">Tight</span>' : p.util13 > .9 ? ' <span class="pill sev warn">Busy</span>' : ''}</td></tr>`), 'Above 95% planned use, there is no room to catch up on production.');
  const wh = warehouseData(f).map(w => { const ff = { b: f.b, c: [w.c] }, cogsDay = agg(ff, 'A', CW - 3, CW).cogs / 28 / K.WAREHOUSES.filter(x => x.c === w.c).length; return { ...w, val: cogsDay * w.days, exp: (K.NEAR_EXPIRY.own[w.c] || 0) / K.WAREHOUSES.filter(x => x.c === w.c).length }; });
  const sv = tbl(['Warehouse', 'Days of stock', 'Stock value', 'Close to expiry (under 30 days)'], wh.map(w => `<tr><td>${w.name}, ${K.CMAP[w.c].name}</td><td class="r num">${w.days.toFixed(0)} <span class="muted">/ ${K.INV_TARGET_DAYS}</span></td><td class="r num">${fmt$(w.val)}</td><td class="r num">${w.exp ? fmt$(w.exp) : 'none'}</td></tr>`), `Stock close to expiry held by distributors and stores: ${fmt$(Object.values(K.NEAR_EXPIRY.channel).reduce((x, y) => x + y, 0))} (mostly India general trade).`);
  const nw = later[0];
  openLevel({ crumb: 'Supply risk, next 13 weeks', title: 'Supply risk, next 13 weeks', insight: r.length === 0 ? `No item runs short in the next 13 weeks. ${(() => { const wc = cs.slice().sort((a, b) => K.FORECAST_BIAS[b] - K.FORECAST_BIAS[a])[0]; return wc && K.FORECAST_BIAS[wc] > .05 ? `${K.CMAP[wc].name} forecasts are ${(K.FORECAST_BIAS[wc] * 100).toFixed(0)}% too high.` : ''; })()}`.trim() : `${r.length} items will run short in the next 13 weeks, ${near.length} of them in the next 4 weeks${near.length ? ` (${[...new Set(near.map(x => K.BMAP[x.b].name + ' in ' + K.CMAP[x.c].name))].join(', ')})` : ''}.${nw ? ` There is a new risk too: ${K.BMAP[nw.b].name} in ${K.CMAP[nw.c].name} from ${wkLabel(CW + 1 + nw.first)}.` : ''} ${(() => { const wc = cs.slice().sort((a, b) => K.FORECAST_BIAS[b] - K.FORECAST_BIAS[a])[0]; return wc && K.FORECAST_BIAS[wc] > .05 ? `${K.CMAP[wc].name} forecasts are ${(K.FORECAST_BIAS[wc] * 100).toFixed(0)}% too high.` : 'Forecasts show no consistent bias.'; })()}`,
    blocks: [{ h: 'Items running short, week by week', sub: `Projected days of stock over the next 13 weeks, to ${wkLabel(CW + RISK_H)}`, html: heat, wide: true, src: 'Supply planner' }, { h: 'Forecast accuracy and bias', html: fa, src: 'Demand planning' }, { h: 'Plant capacity', html: pl, src: 'Manufacturing system' }, { h: 'Stock, value and expiry', html: sv, wide: true, src: 'Supply planner and ERP' }] }, true);
}
function cogsExtras() {
  const sv = K.SAVINGS, tot = k => sv.reduce((x, s) => x + s[k], 0);
  return [{ h: `Savings of ${fmt$(tot('done'))} delivered so far, against a plan of ${fmt$(tot('plan'))}`, sub: `Productivity programme, full-year target ${fmt$(tot('fy'))}`, wide: true, html: tbl(['Lever', 'Full-year target', 'Plan to date', 'Delivered', 'Gap', '<span>Why</span>'], sv.map(s => `<tr><td>${s.lever}</td><td class="r num">${fmt$(s.fy)}</td><td class="r num">${fmt$(s.plan)}</td><td class="r num"><b>${fmt$(s.done)}</b></td><td class="r num">${dv(s.done - s.plan, '$', 1)}</td><td>${esc(s.note)}</td></tr>`)), src: 'Productivity programme' },
    { h: 'Commodity prices against budget', html: tbl(['Commodity', 'vs budget', 'Price locked in'], K.COMMODITIES.map(x => `<tr><td>${x.name}</td><td class="r num">${dv(x.vsBudget, 'pct', -1)}</td><td class="r num">${pct1(x.hedge).replace('.0', '')}</td></tr>`)), src: 'Procurement system' },
    { h: 'Plant efficiency and conversion cost', html: tbl(['Plant', 'OEE', 'Conversion cost per case'], K.PLANTS.map(p => `<tr><td>${p.name}</td><td class="r num">${vsPlan(p.oee * 100, p.oeeT * 100, v => v.toFixed(0) + '%')}</td><td class="r num">${dv(p.convVsPlan, 'pct', -1, 'vs plan')}</td></tr>`)), src: 'Manufacturing system' }];
}
function otifExtras(f) {
  const r4 = agg(f, 'A', CW - 3, CW), ytd = agg(f, 'A', 1, CW), ac = accountsData(f, { ...win(), w0: CW - 3, w1: CW, wa: CW }), br = ac.filter(a => a.otif < a.otifT);
  return { h: `We lost ${fmt$(r4.lost)} of sales to supply problems in 4 weeks`, sub: 'Orders we could not deliver, at net price', html: stats([['Lost sales, 4 weeks', fmt$(r4.lost), `${pct1(r4.lost / (r4.ns + r4.lost))} of demand`], ['Lost sales, year to date', fmt$(ytd.lost), ''], ['Case fill rate, 4 weeks', pct1(r4.fill), 'target 97%'], ['Contract fines, quarterly rate', fmt$(br.reduce((x, a) => x + a.fines, 0)), `${br.length} retailers below contract`]]), src: 'Order management and customer contracts' };
}

/* ---------- CSO: run rate needed and key accounts ---------- */
function salesExtras(f) {
  const hs = headsData(f), a = hs.reduce((x, h) => x + h.a, 0), tm = hs.reduce((x, h) => x + h.tm, 0), M = monthWk(), el = M.filter(w => w <= CW).length * 7, rem = Math.max(7, M.length * 7 - el), need = (tm - a) / rem, now = a / el;
  const PM = { ...win(), w0: M[0], w1: CW, wa: CW, label: 'MTD' }, ac = accountsData(f, PM).map(x => { const s = shopper(x.slice, Math.max(1, CW - 3), CW), r = agg(x.slice, 'A', M[0], CW); return { ...x, sg: s.g, tr: r.tr / r.gs }; }).sort((x, y) => x.gap - y.gap);
  return { pre: [{ h: `We need to sell ${fmt$(need)} a day for the rest of October, and we sell ${fmt$(now)} a day now`, sub: 'Daily sales needed to hit the sales target for the month (the target bonuses are based on)', html: stats([['Needed per day', fmt$(need), `${(rem / 7).toFixed(0)} weeks left`], ['Current per day', fmt$(now), need > now ? pcn(need / now - 1) + ' more needed' : 'on pace to make the month'], ['Month target', fmt$(tm), 'the target bonuses are based on'], ['Heads who will miss', `${hs.filter(h => h.pv < 1).length} of ${hs.length}`, '']]), src: 'ERP sales targets' }],
    post: [{ h: 'Key accounts: month to date', sub: 'Shipments against plan, shopper sales (4 weeks against last year), trade rate, delivery and fines. Worst gap first.', wide: true, html: tbl(['Account', 'Country and channel', 'MTD sales', 'vs plan', 'Shopper sales', 'Trade % gross', 'Delivery (OTIF)', 'Fines'], ac.map(x => `<tr ${sliceAttr(x.slice)}><td>${esc(x.name)}</td><td class="r">${K.CMAP[x.c].name}, ${K.CHMAP[x.ch].name}</td><td class="r num">${fmt$(x.a)}</td><td class="r num">${dv(x.att - 1, 'pct', 1)}</td><td class="r num">${dv(x.sg, 'pct', 1)}</td><td class="r num">${pct1(x.tr)}</td><td class="r num ${x.otif < x.otifT ? 'neg-t' : ''}">${pct1(x.otif)}</td><td class="r num">${x.fines ? fmt$(x.fines) : 'none'}</td></tr>`), 'Account numbers use each account\'s share of its channel (illustrative). Click an account to open its market and channel.'), src: 'ERP, retailer checkout data and contracts' }] };
}

/* ---------- panel map ---------- */
Object.assign(PANEL, {
  SSG: () => openSSG(),
  AP: () => openAP(),
  PENF: () => openPENF(),
  SAFQ: () => openSAFQ(),
  RISK: () => openRISK(),
  GM: () => { const f = filter(), P = win(); openCFO('F1'); const ex = g2nBlocks(f, P), A = agg(f, 'A', P.w0, P.w1);
    extendTop({ drop: /^Marketing spend against budget/, pre: ex, after: () => waterfall($('#b-g2n'), { start: A.gs, end: A.ns - A.cogs, items: [['Trade spend', -A.tr, 'tr'], ['Returns', -A.ret, 'ret'], ['Net sales', 0, 'ns', 'sub'], ['Cost of goods', -A.cogs, 'cogs']] }, { startLabel: 'Gross sales', endLabel: 'Gross margin', cascade: true, pctBase: A.gs, pctLabel: 'of gross sales' }) }); },
  EPS: () => { openCFO('F6'); extendTop({ post: [riskOppBlock(), belowGM()] }); },
  OM: () => { openTile('Sh3'); extendTop({ post: [belowGM()] }); },
  SHARE: () => { const f = filter(); if (state.role === 'CMO') band('M1'); else openTile('Sh6'); extendTop({ post: shareExtras(f) }); },
  SALES: () => { const f = filter(); band('S1'); extendTop(salesExtras(f)); },
  OTIF: () => { const f = filter(); band('O2'); extendTop({ pre: [otifExtras(f)] }); },
  COGS: () => { band('O3'); extendTop({ post: cogsExtras() }); },
});
RGM.SSG = { label: 'Re-check price and promotion plan', alias: 'SHARE' };

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
const srcFor = id => ({ SHARE: 'Market data, 4 weeks to 20 Sep', PEN: 'Consumer panel', ROMI: 'Marketing mix model, Q2', OTIF: 'Supply planner', INVD: 'Supply planner', CHINV: 'Distributor system', DIST: 'Retail execution', EPS: 'FP&A and investor relations', QUAL: 'Quality system' })[id] || 'ERP, actuals to week 41';
function closePanel() { $('#band').hidden = true; OPEN = null; PF = {}; drill.stack = []; document.querySelectorAll('.card').forEach(c => { c.classList.remove('on'); c.setAttribute('aria-expanded', 'false'); }); hideTip(); }
function filterBar() {
  const sel = (k, label, opts) => `<label class="fsel ${PF[k] ? 'set' : ''}"><span>${label}</span><select data-pf="${k}">${opts.map(([v, t]) => `<option value="${v}" ${(PF[k] || [''])[0] === v || (!PF[k] && !v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  return `<form class="ask" id="ask-panel" autocomplete="off"><span class="ask-i" aria-hidden="true">${ICON.search}</span><input id="ask-panel-in" placeholder="Ask about ${esc(CARD_DEF[OPEN][0].toLowerCase())}, e.g. Sunrise Oats in India, large retail" aria-label="Ask a question about this panel"></form>
    <div class="fbar">${sel('c', 'Country', [['', 'All countries']].concat(K.COUNTRIES.map(c => [c.id, c.name])))}${sel('b', 'Brand', [['', 'All brands']].concat(K.BRANDS.map(b => [b.id, b.name])))}${sel('ch', 'Channel', [['', 'All channels']].concat(K.CHANNELS.map(c => [c.id, c.name])))}
    <span class="per">${esc(win().label)}, ${esc(compShort())}</span>${Object.keys(PF).some(k => PF[k]) ? '<button class="link" data-pf-reset>Reset</button>' : ''}</div><p class="ask-out" id="ask-out" hidden></p>`;
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
    if (!ids.includes(target)) via = `It normally lives in the ${ROLES[OWNER_VIEW(target)].label} view.`;
  } else target = inPanel && OPEN ? OPEN : ids[0];
  if (r.per && r.per !== state.period) { state.period = r.per; if (!SHORT.includes(r.per) && state.comp === 'M') state.comp = 'T'; syncControls(); renderHome(); }
  openCard(target, r.f);
  const chips = Object.entries(r.f).map(([k, v]) => k === 'c' ? K.CMAP[v[0]].name : k === 'b' ? K.BMAP[v[0]].name : K.CHMAP[v[0]].name);
  const out = $('#ask-out'); out.hidden = false;
  out.innerHTML = `<span class="ai" data-def="AI">Ask</span> Showing <b>${esc(CARD_DEF[target][0])}</b>${chips.length ? ' for ' + chips.map(c => `<span class="chip-f">${esc(c)}</span>`).join(' ') : ' for the whole company'}${r.per ? `, ${esc(PERIODS[r.per].label)}` : ''}.${via ? ` <span class="muted">${esc(via)}</span>` : ''}${r.unused.length ? ` <span class="muted">Not understood: ${esc(r.unused.slice(0, 4).join(', '))}.</span>` : ''}`;
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
const scopeOf = (pf, lv) => lv && lv.rgm ? (RGM[OPEN].alias ? RGM[RGM[OPEN].alias] : RGM[OPEN]).scope : [pf.c && K.CMAP[pf.c[0]].name, pf.b && K.BMAP[pf.b[0]].name, pf.ch && K.CHMAP[pf.ch[0]].name].filter(Boolean).join(', ') || 'Whole company';
const b64 = { enc: s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), dec: s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))) };

/* ---------- bookmarks = a live watchlist ---------- */
const BM_KEY = 'pulse-bm2';
let BM = null; try { BM = JSON.parse(localStorage.getItem(BM_KEY)); } catch (e) { BM = null; }
const saveBM = () => { try { localStorage.setItem(BM_KEY, JSON.stringify(BM)); } catch (e) { } };
function seedBookmarks() {   // a few views saved a week ago, so the watchlist shows what changed since
  const S = [['CEO', 'OM', { c: ['UK'] }, 'UK operating margin'], ['CEO', 'OSG', { b: ['bolt'], c: ['UK'], ch: ['CONV'] }, 'Bolt Brew in UK convenience'],
    ['CFO', 'GM', { b: ['oats'] }, 'Sunrise Oats gross margin'], ['CFO', 'OSG', { c: ['IN'], ch: ['GT'] }, 'India general trade sales'],
    ['CMO', 'SSG', { b: ['glow'], c: ['IN'] }, 'Glow Skincare India shopper sales'], ['CMO', 'AP', { b: ['bolt'] }, 'Bolt Brew marketing'],
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
  BM = BM.slice(0, 16); saveBM(); renderPins(); syncControls(); toast('Added to your watchlist. It will show the latest number and what has changed.');
}
function watchRow(b) {
  let x; try { x = cardIn(b.v); } catch (e) { return null; }
  const ch = changeHtml(b.v.card, x, b.v0, x.raw, 'since you saved it ' + fmtD(b.ts)), flip = b.sev0 && b.sev0 !== x.sev, rel = b.v0 ? Math.abs(x.raw - b.v0) / Math.abs(b.v0) : 0;
  return { b, x, ch, flip, rank: (flip ? 10 : 0) + rel };
}
function watchTile(r, compact) {
  const b = r.b, x = r.x, deep = (b.v.path || []).length ? ', ' + (b.v.path[b.v.path.length - 1].fn === 'openRgm' ? 'RGM check' : 'deeper view') : '';
  const sc = state.comp; state.comp = b.v.comp || sc; let g; try { g = gapOf(b.v.card, x); } finally { state.comp = sc; }
  return `<div class="pin s-${x.sev} ${r.flip ? 'flip' : ''}"><div class="pin-head"><span class="c-sig">${SEV[x.sev]}</span>${r.flip ? `<span class="pin-was">was ${SEV[b.sev0].toLowerCase()}</span>` : ''}<button class="icon-btn sm" data-unpin="${b.id}" aria-label="Remove from watchlist" title="Remove">${ICON.x}</button></div>
    <button class="pin-open" data-pin="${b.id}" title="Open this view exactly as saved">
    <span class="pin-t">${esc(b.title)}</span>
    <span class="pin-k">${esc(CARD_DEF[b.v.card][0])}, ${esc(b.scope)}, ${b.v.card === 'ASK' ? 'custom view' : esc(PERIODS[b.v.period].label)}${deep}${compact ? `, ${esc(ROLES[b.v.role].label)}` : ''}</span>
    ${g ? `<span class="pin-g">${gapHtml(g)}</span>` : ''}
    <span class="pin-c">Now <b class="num">${x.value}</b>${r.ch ? `, ${r.ch}` : ''}</span></button></div>`;
}
function renderPins() {
  const rows = BM.filter(b => b.v.role === state.role).map(watchRow).filter(Boolean).sort((a, b) => b.rank - a.rank), all = rows.length;   // each role's watchlist is its own
  $('#pins').hidden = false;
  $('#pins').innerHTML = `<div class="sec-row"><h2 class="sec">My watchlist</h2>${all ? `<button class="link" data-bm-all>See all ${all}</button>` : ''}</div>${rows.length ? `<div class="pin-row">${rows.slice(0, 4).map(r => watchTile(r)).join('')}</div>` : `<p class="pin-empty">${ICON.bm} Bookmark any panel or chart and it shows up here with the latest number and what has changed since you saved it.</p>`}`;
  const changed = rows.filter(r => r.flip || !/no change/.test(r.ch)).length;
  $('#bm-count').textContent = changed || ''; $('#bm-count').title = changed ? `${changed} changed since you saved them` : '';
}
function openWatchAll() {   // only the current role's saved views: a watchlist is personal
  const rows = BM.filter(b => b.v.role === state.role).map(watchRow).filter(Boolean).sort((a, b) => b.rank - a.rank), who = ROLES[state.role].label;
  openModal(`${who} watchlist`, rows.length ? `<p class="muted" style="margin:0 0 12px">These are the views you saved as ${esc(who)}, with the latest number. Opening one brings back the exact view, with the same filters, period and comparison. Other roles keep their own watchlists.</p><div class="pin-col">${rows.map(r => watchTile(r)).join('')}</div>` : `<p class="pin-empty">${ICON.bm} Nothing saved yet as ${esc(who)}. Open any metric and use the bookmark button on the panel or on a chart.</p>`);
}

/* ---------- share link and export ---------- */
function shareLink() {
  const url = location.href.split('#')[0] + '#v=' + b64.enc(JSON.stringify(getView(null)));
  openModal('Link to this view', `<p class="muted" style="margin:0 0 10px">This link opens the exact view you have now: ${esc(ROLES[state.role].label)}, ${esc(CARD_DEF[OPEN][0])}, ${esc(scopeOf(PF, drill.stack[drill.stack.length - 1]))}, ${esc(win().label)} ${esc(compShort())}. Anyone you send it to sees the data their own access allows.</p><input class="link-in" readonly value="${esc(url)}" onclick="this.select()"><div class="mb">${copyBtn(url)}<button class="btn" data-close>Close</button></div>`);
}
function exportView() {
  const lv = drill.stack[drill.stack.length - 1];
  $('#print-stamp').innerHTML = `<b>Pulse, ${esc(ROLES[state.role].label)} view, ${esc(CARD_DEF[OPEN][0])}</b><span>${esc(scopeOf(PF, lv))}, ${esc(win().label)} ${esc(compShort())}. Data to the week ending 11 Oct 2026, September books closed. Exported ${esc(new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))}.</span><span>Northstar Consumer Goods is fictional, and all figures are synthetic.</span>`;
  window.print();
}

/* ---------- actions ---------- */
let NEWACTS = []; try { NEWACTS = JSON.parse(localStorage.getItem('pulse-new-acts') || '[]'); } catch (e) { NEWACTS = []; }
const saveNew = () => { try { localStorage.setItem('pulse-new-acts', JSON.stringify(NEWACTS)); localStorage.setItem('ns-actions', JSON.stringify(ACTS)); } catch (e) { } };
// views and actions saved in the browser before the copy was simplified still carry the old separators
const dotFix = s => typeof s === 'string' ? s.replace(/ \u00b7 /g, ', ') : s;
BM.forEach(b => { b.scope = dotFix(b.scope); b.title = dotFix(b.title) === 'Bolt Brew A&P' ? 'Bolt Brew marketing' : dotFix(b.title); });
Object.values(ACTS).forEach(a => { if (a && a.poc) a.poc = dotFix(a.poc); });
NEWACTS.forEach(a => { a.poc = dotFix(a.poc); });
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
      <button class="a-ask" data-exp="${esc(a.id)}" aria-expanded="${state.openAct === a.id}"><span class="chev">${ICON.chev}</span><span><b>${esc(a.title.split(/;/)[0].replace(/\.$/, ''))}</b><span class="a-why">${esc(a.issue)}${a.urgency === 'High' ? ', <em>high priority</em>' : ''}</span></span></button>
      <span class="a-own">${esc(a.poc.split(', ')[1] || a.poc.split(', ')[0])}<small>${esc(a.poc.split(', ')[1] ? a.poc.split(', ')[0] : '')}</small></span>
      <span class="num ${a.overdue ? 'od' : ''}">${fmtD(a.due)}${a.overdue ? '<small>Overdue</small>' : ''}</span>
      <span class="num r">${a.value ? '~' + fmt$(a.value) : 'n/a'}</span>
      <span class="a-st"><i class="dot ${a.status.replace(' ', '-').toLowerCase()}"></i>${a.status}</span>
      <span class="a-btn">${primary(a)}<div class="menu-wrap"><button class="icon-btn sm" data-menu="${esc(a.id)}" aria-label="More actions" aria-haspopup="true">${ICON.more}</button></div></span></div>
      ${state.openAct === a.id ? `<div class="a-exp"><div><h4>Why</h4><p>${esc(a.why)}</p>${a.chain && a.chain.length ? `<p class="muted">${a.chain.map(esc).join('; ')}</p>` : ''}${a.target ? `<p><b>Target:</b> ${esc(a.target)}</p>` : ''}<button class="link" data-see="${esc(a.id)}">Open the analysis →</button></div>
        <div><h4>Progress</h4><ol class="stepper">${STEPS.map((s, i) => `<li class="${STEPS.indexOf(a.status) >= i ? 'done' : ''}"><button data-step="${esc(a.id)}|${s}">${s}</button></li>`).join('')}</ol><p class="muted">Assigned ${fmtD(a.assigned)}, due ${fmtD(a.due)}</p></div></div>` : ''}</div>`).join('') || `<p class="empty">No ${fl.toLowerCase()} actions. New actions appear here when a metric goes off track, or when you create one.</p>`}</div>
    ${pages > 1 ? `<nav class="pager" aria-label="Action pages"><span>${p * 5 + 1} to ${Math.min(list.length, p * 5 + 5)} of ${list.length}</span><button class="icon-btn sm" data-page="${p - 1}" ${p === 0 ? 'disabled' : ''} aria-label="Previous page">‹</button>${Array.from({ length: pages }, (_, i) => `<button class="pg ${i === p ? 'on' : ''}" data-page="${i}" aria-current="${i === p}">${i + 1}</button>`).join('')}<button class="icon-btn sm" data-page="${p + 1}" ${p >= pages - 1 ? 'disabled' : ''} aria-label="Next page">›</button></nav>` : ''}<p class="sr" aria-live="polite" id="pg-live"></p>`;
}
function newActionForm(prefill) {
  const ppl = Object.values(K.PEOPLE).concat(K.SALES_HEADS.map(h => h.name + ', Regional Sales Head')).filter((v, i, s) => s.indexOf(v) === i);
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
// 1 type a question, 2 Pulse builds a custom view with filters, 3 email the results (draft only), 4 save to the watchlist
const ASKD = {
  q: 'Why is Bolt Brew losing share in UK convenience, and what should we do?',
  pf: { b: ['bolt'], c: ['UK'], ch: ['CONV'] },
  applied: [['Brand', 'Bolt Brew Coffee'], ['Market', 'UK'], ['Channel', 'Convenience'], ['Period', 'Last 13 weeks'], ['Compare to', 'Last year']],
  to: [['Bob Smith', 'UK Sales Director', 'bob.smith@northstar.example'], ['Chloe Adams', 'Bolt Brew Brand Director', 'chloe.adams@northstar.example'], ['Alice Brown', 'Head of RGM', 'alice.brown@northstar.example']],
};
CARD_DEF.ASK = ['Ask Pulse', 'A custom view Pulse built from your question.', '']; DEF.ASK = CARD_DEF.ASK;
const cardBase = card; card = function (id) { return id === 'ASK' ? { ...cardBase('SHARE'), per: '4 weeks to 20 Sep' } : cardBase(id); };
const filterBarBase = filterBar;
filterBar = function () {
  if (OPEN !== 'ASK') return filterBarBase();
  return `<form class="ask" id="ask-panel" autocomplete="off"><span class="ask-i" aria-hidden="true">${ICON.search}</span><input id="ask-panel-in" value="${esc(ASKD.q)}" aria-label="Your question"></form>
    <div class="fbar applied">${ASKD.applied.map(([k, v], i) => `<span class="fsel ro" style="--d:${i * 90}ms"><span>${k}</span><b>${v}</b></span>`).join('')}<span class="per">Pulse set these from your question. Edit the question to change them.</span></div><p class="ask-out" id="ask-out" hidden></p>`;
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
    insight: `Bolt Brew has lost ${Math.abs(x.chg).toFixed(1)} share points in the UK since Volt Coffee cut its convenience price by 12% in week 34. About ${x.buyers}M buyers switched, and our price-marked pack is not paying back (${x.pmp.roi.toFixed(2)}x). The best option is a 2 for £2.20 multibuy.`,
    blocks: [
      { h: `Share fell ${Math.abs(x.chg).toFixed(1)} points after Volt cut its price`, sub: 'Bolt Brew share of UK coffee, 4-week rolling, against last year', id: 'b-ask1', html: '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>This year</span><span><i class="dash light"></i>Last year</span><span><i class="dot" style="background:var(--opp)"></i>Competitor move</span></div>', src: 'Market data, to 20 September' },
      { h: `Convenience sales ${sPct(x.g)} against last year`, sub: 'Bolt Brew in UK convenience, weekly net sales', id: 'b-ask2', html: '<div class="legend"><span><i class="dot" style="background:var(--s1)"></i>This year</span><span><i class="dash light"></i>Last year</span></div>', src: 'ERP, actuals to week 41' },
      { h: 'Why: price gap, lost buyers, weaker consideration', wide: true, html: stats([['Price vs Volt Coffee', '+14%', 'level with Volt before week 34'], ['Buyers switched to Volt', x.buyers + 'M', 'households, consumer panel'], ['Consideration', x.cons[1].toFixed(0) + '%', dv(x.cons[1] - x.cons[0], 'pts', 1, 'vs last year, significant')], ['Price-marked pack return', x.pmp.roi.toFixed(2) + 'x', 'per $1, anything below 1.0 loses money']]), src: 'Market data, consumer panel, brand tracker and RGM tool' },
      { h: 'What to do: options from the RGM tool', sub: r.chip + ' (illustrative)', wide: true, html: table, src: 'RGM tool (illustrative)' }, rgmWhyBlock('SHARE')],
    after: () => { lineChart($('#b-ask1'), { x0: 20, x1: K.MKT_LAST, h: 170, yfmt: v => v.toFixed(0) + '%', markers: mk, series: [{ vals: shL, from: 20, to: K.MKT_LAST, color: '#b9bfc7', w: 1.5, dash: '1 3' }, { vals: shA, from: 20, to: K.MKT_LAST, color: 'var(--s1)', end: true }], tip: w => `<div class="th">Wk ${w}</div>${trow('Share', shA[w].toFixed(1) + '%')}${trow('Last year', shL[w].toFixed(1) + '%')}` });
      lineChart($('#b-ask2'), { x0: 20, x1: CW, h: 170, yfmt: fmt$, markers: mk, series: [{ vals: nL, from: 20, to: CW, color: '#b9bfc7', w: 1.5, dash: '1 3' }, { vals: nA, from: 20, to: CW, color: 'var(--s1)', end: true }], tip: w => `<div class="th">Wk ${w}</div>${trow('Net sales', fmt$(nA[w]))}${trow('Last year', fmt$(nL[w]) + ' ' + sPct(vr(nA[w], nL[w])))}` }); } }, true);
  const out = $('#ask-out'); if (out) { out.hidden = false; out.innerHTML = `<span class="ai" data-def="AI">Ask</span> Built a custom view: 4 charts and an answer, from market data, sales, the consumer panel, the brand tracker and the RGM tool.`; }
}
PANEL.ASK = () => openAskView(false);
const sleepD = ms => new Promise(r => setTimeout(r, ms));
async function askBuild() {   // the "building" moment, then the finished view
  OPEN = 'ASK'; PF = { ...ASKD.pf }; drill.stack = []; drill.root = 'ASK';
  const steps = ['Understanding the question', 'Choosing the data: market share, sales, consumer panel, brand tracker, RGM tool', 'Applying filters: Bolt Brew Coffee, UK, convenience, last 13 weeks, against last year', 'Building 4 charts', 'Writing the answer and the recommendation'];
  openLevel({ crumb: 'Your question', title: 'Building your view…', ask: true, blocks: [{ h: '', wide: true, html: `<ul class="build">${steps.map((s, i) => `<li class="bstep" data-bs="${i}"><span class="ic" aria-hidden="true"></span>${esc(s)}</li>`).join('')}</ul>` }] }, true);
  await sleepD(80); $('#band').scrollIntoView({ behavior: 'smooth', block: 'start' });
  for (let i = 0; i < steps.length; i++) { const li = document.querySelector(`[data-bs="${i}"]`); if (!li) break; li.classList.add('run'); await sleepD(520); li.classList.remove('run'); li.classList.add('done'); }
  await sleepD(250); openAskView(true);
}
function askEmailHtml() {
  const x = askFacts(), link = location.href.split('#')[0] + '#v=' + b64.enc(JSON.stringify({ role: state.role, card: 'ASK', pf: ASKD.pf, period: state.period, comp: state.comp, year: state.year, path: [], chart: null }));
  const body = `Hi Bob, Chloe and Alice,\n\nBolt Brew lost ${Math.abs(x.chg).toFixed(1)} share points in the UK since Volt Coffee cut its convenience price by 12% in week 34. About ${x.buyers}M buyers switched.\n\n• Convenience sales: ${sPct(x.g)} against last year (last 13 weeks)\n• Price gap: Bolt Brew now costs 14% more than Volt\n• Our price-marked pack earns back only ${Math.round(x.pmp.roi * 100)} cents per $1\n• The RGM tool recommends a 2 for £2.20 multibuy: about ${x.rec[1]} of share at ${x.rec[2]} return\n\nCan we agree the multibuy at Thursday's UK review?\n\nOpen the exact view: ${link}`;
  return { body, html: `<dl class="mf"><dt>To</dt><dd><div class="to-chips" id="demo-to"></div></dd><dt>Subject</dt><dd>Bolt Brew in UK convenience: why we are losing share and what to do</dd></dl>
    <textarea id="demo-body" rows="13" readonly>${esc(body)}</textarea>
    <div class="attach">${ICON.print}<span><b>Bolt Brew UK convenience, Pulse view.pdf</b> <span class="muted">Snapshot of this view, data to the week ending 11 Oct 2026</span></span></div>
    <div class="m-act"><button class="btn primary" id="demo-send">Send</button><button class="btn" data-close>Cancel</button></div><p class="foot">Demo: nothing is sent from the prototype. In production this opens in your own email app.</p>` };
}
async function askEmail() {
  const m = askEmailHtml(); openModal('Email the results', m.html);
  for (const [n, role, e] of ASKD.to) { await sleepD(380); const el = $('#demo-to'); if (!el) return; el.insertAdjacentHTML('beforeend', `<span class="to-chip" title="${esc(n)}, ${esc(e)}"><b>${esc(role)}</b> <span class="muted">${esc(n)}</span></span>`); }
  const s = $('#demo-send'); if (s) s.classList.add('demo-ring');
}
async function askSend() {
  const s = $('#demo-send'); if (s) { s.classList.remove('demo-ring'); s.textContent = 'Sending…'; s.disabled = true; await sleepD(650); s.textContent = '✓ Sent (demo)'; }
  await sleepD(550); closeModal(); toast('Demo: email prepared for Bob, Chloe and Alice. Nothing was sent.');
}
async function askSave() {
  if (OPEN !== 'ASK') openAskView(false);
  const b = $('#band-tools [data-bookmark]'); $('#band').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (b) { b.classList.add('demo-ring'); await sleepD(900); b.classList.remove('demo-ring'); }
  const v = { role: state.role, card: 'ASK', pf: { ...ASKD.pf }, period: state.period, comp: state.comp, year: state.year, path: [], chart: null }, x = cardIn(v);
  BM = BM.filter(y => y.id !== 'demo-ask'); BM.unshift({ id: 'demo-ask', ts: Date.now(), v, title: ASKD.q, scope: 'Bolt Brew Coffee, UK, Convenience', v0: x.raw, sev0: x.sev, val0: x.value }); saveBM(); renderPins();
  toast('Saved to your watchlist. It reopens this exact view and shows what has changed.');
  await sleepD(500); const tile = [...document.querySelectorAll('#pins .pin')].find(p => p.querySelector('[data-pin="demo-ask"]'));
  if (tile) { tile.scrollIntoView({ behavior: 'smooth', block: 'center' }); tile.classList.add('new'); }
}
const DEMO_STEPS = [
  { n: 0, t: 'See Ask in action', d: 'A short demo that is the same for every role. You ask a question in plain English and Pulse builds a custom view. Then you email it to the team and save it for later.', btn: 'Start' },
  { n: 1, t: 'Ask a question', d: 'Type it the way you would ask an analyst. There are no menus and no filters to set.', btn: 'Build my view', run: async () => { closeModal(); scrollTo({ top: 0, behavior: 'smooth' }); const i = $('#ask-global-in'), fm = $('#ask-global'); i.value = ''; i.focus(); fm.classList.add('demo-ring'); for (const ch of ASKD.q) { i.value += ch; await sleepD(24); } fm.classList.remove('demo-ring'); } },
  { n: 2, t: 'Pulse builds a custom view', d: 'Pulse works out what you mean, sets the filters, picks the charts and writes the answer. Every chart shows its source.', btn: 'Email the results', run: async () => { $('#ask-global-in').blur(); await askBuild(); } },
  { n: 3, t: 'Email the results', d: 'Send the answer to the people who need to act. The email has the summary, a PDF snapshot and a link to this exact view.', btn: 'Send', run: askEmail },
  { n: 3, t: 'Sent', d: 'Bob, Chloe and Alice get the summary and the link. In this demo nothing actually leaves the prototype.', btn: 'Bookmark this view', run: askSend },
  { n: 4, t: 'Bookmark it for later', d: 'It goes on your watchlist. Tomorrow it opens this exact view and shows what has changed since today.', btn: 'Finish', run: askSave },
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

/* ======================================================================
   Metric pyramid: each role sees its L1 metrics as cards. Opening one shows
   the existing analysis plus its L2 metrics; an L2 opens its L3s in a side panel.
   ====================================================================== */
const TREE = {
  CEO: [['OSG', [['OVG', ['PEN', 'BUY', 'REP']], ['PMX', ['PRC', 'MIX', 'TRADE', 'TPR']], ['SHARE', ['CATG', 'DIST', 'OSA']], ['BEQ', ['AWR', 'CONS', 'INNO']]]],
    ['OM', [['GM', ['ICI', 'OEE', 'RCL', 'TRIR']], ['AMS', ['ROMI', 'ROAS', 'ESOV']], ['DEX', ['LCPC']], ['OHD', ['PRODS']]]],
    ['FCFC', [['CCC', ['DIO', 'DSO', 'DPO', 'EO']], ['CAPEX', ['ROIC']]]],
    ['POR', [['OTD', ['COTD', 'OFCT']], ['CFR', ['FA', 'SOTIF']], ['DFD', []], ['ODA', []]]]],
  COO: [['POR', [['OTD', ['COTD', 'OFCT']], ['CFR', ['FA', 'SOTIF']], ['DFD', []], ['ODA', []]]],
    ['GM', [['ICI', []], ['OEE', []], ['DEX', ['LCPC']], ['RCL', []]]],
    ['FCFC', [['CCC', ['DIO', 'DPO', 'EO']], ['CAPEX', ['ROIC']]]],
    ['TRIR', []]],
  CFO: [['OSG', [['OVG', []], ['PMX', ['PRC', 'MIX', 'TRADE', 'TPR']]]],
    ['GM', [['ICI', []], ['PRODS', []], ['RCL', []]]],
    ['OM', [['AMS', ['ROMI']], ['DEX', []], ['OHD', []]]],
    ['FCFC', [['CCC', ['DIO', 'DSO', 'DPO', 'ODA']], ['CAPEX', ['ROIC']]]]],
  CSO: [['OSG', [['OVG', ['PEN', 'BUY']], ['PMX', ['PRC', 'MIX', 'TRADE', 'TPR']]]],
    ['SHARE', [['CATG', []], ['DIST', []], ['OSA', []]]],
    ['POR', [['OTD', []], ['CFR', ['FA']], ['ODA', []]]],
    ['DSO', []]],
  CMO: [['BEQ', [['AWR', []], ['CONS', []], ['INNO', []]]],
    ['OSG', [['OVG', ['PEN', 'BUY', 'REP']], ['PMX', ['MIX', 'PRC']], ['SHARE', ['CATG']]]],
    ['AMS', [['ROMI', []], ['ROAS', []], ['ESOV', []]]]],
};
Object.keys(TREE).forEach(r => { ROLE_CARDS[r] = TREE[r].map(n => n[0]); });
const LOGIC = {
  OSG: 'Organic sales growth = volume growth + price/mix. Market share and brand health explain the why.',
  OM: 'Operating margin = gross margin − marketing − distribution − overheads, each as a % of net sales.',
  FCFC: 'Cash conversion = free cash flow ÷ net earnings. Working capital and capital spending decide it.',
  POR: 'Perfect order = on time × in full × damage free × correct paperwork.',
  GM: 'Gross margin = 1 − cost of goods ÷ net sales. These are the cost levers behind it.',
  SHARE: 'Share change is roughly our growth minus category growth. Distribution and shelf availability show how much of the gap is reach.',
  BEQ: 'Brand equity moves before penetration and share do, so it warns early.',
  AMS: 'How much we spend on brands, and whether that spend pays back.',
  OVG: 'Volume = households × penetration × buying rate.',
  PMX: 'Price/mix = pricing + mix, after trade spend.',
  CCC: 'Cash conversion cycle = inventory days + receivable days − payable days.',
  CAPEX: 'Capital spending should earn a return above our cost of capital.',
  OTD: 'Late deliveries usually start with carriers or slow order handling.',
  CFR: 'Short shipments usually start with a poor forecast or a late supplier.',
  DEX: 'The cost of getting product from the factory to the customer.',
  OHD: 'The cost of the corporate centre, the sales organisation and support functions.',
};

/* ---------- metric registry ---------- */
const MX = {}, BY = { OSG: 'cb', GM: 'cb', TRADE: 'cb', SHARE: 'cb', PEN: 'cb', ROMI: 'b' };
const WIN_ = ['OVG', 'PMX', 'PRC', 'MIX', 'AMS', 'DEX', 'LCPC', 'CFR', 'POR'];
WINDOWED.push(...WIN_);
function mx(id, n, def, formula, o) { MX[id] = { n, ...o }; CARD_DEF[id] = [n, def, formula]; DEF[id] = CARD_DEF[id]; if (o.vs) VS[id] = o.vs; if (o.by) BY[id] = o.by; if (CARD_SLOT[id] == null) CARD_SLOT[id] = 0; }
[['OM', 'Adjusted operating margin'], ['SHARE', 'Value market share'], ['TRADE', 'Trade spend % of gross sales'], ['DIST', 'Weighted distribution'], ['ROMI', 'Marketing ROI'], ['GM', 'Gross margin']].forEach(([k, n]) => { CARD_DEF[k] = [n].concat(CARD_DEF[k].slice(1)); DEF[k] = CARD_DEF[k]; });
const fmtV = (rk, v) => v == null || !isFinite(v) ? 'n/a' : rk === 'pts' || rk === 'bps' ? plain(v) : rk === 'x' ? v.toFixed(2) + 'x' : rk === 'days' ? v.toFixed(1) + ' days' : rk === '$' ? fmt$(v) : rk === 'n2' ? v.toFixed(2) : rk === 'pct' ? v.toFixed(1) : String(Math.round(v));
function autoSev(rk, raw, craw, rg) {
  if (!rg || raw == null || craw == null || !isFinite(raw) || !isFinite(craw)) return 'good';
  const d = (raw - craw) * rg;
  if (rk === 'pts') return sevOf(d * 100, 'pts');
  if (rk === 'bps') return sevOf(d * 1e4, 'bps');
  const rel = d / (Math.abs(craw) || 1); return rel >= -.01 ? 'good' : rel >= -.06 ? 'warn' : 'crit';
}
const ytdNs = f => agg(f, 'A', 1, CW).ns;
const wavgC = (f, map) => { let n = 0, s = 0; for (const c of countriesOf(f)) { const ff = { ...f, c: [c] }; if (!has(ff)) continue; const w = ytdNs(ff); n += w; s += map[c] * w; } return n ? s / n : NaN; };
const worstC = (f, map, rg) => countriesOf(f).filter(c => has({ ...f, c: [c] })).sort((a, b) => (map[a] - map[b]) * rg)[0];
function mkCard(id) {
  const M = MX[id], P = win(), f = filter(), r = M.f(f, P) || {};
  const x = { rk: r.rk || M.rk, rg: r.rg != null ? r.rg : M.rg, ...r };
  x.value = r.value || fmtV(x.rk, x.raw); x.per = r.per || (WIN_.includes(id) ? P.label : M.per || 'Latest');
  x.prov = r.prov || M.prov || 'ERP'; x.sev = r.sev || autoSev(x.rk, x.raw, x.craw, x.rg);
  const g = gapOf(id, x);
  x.ref = r.ref || (x.craw != null ? `${M.refL || 'Plan'} ${fmtV(x.rk, x.craw)}` : '');
  x.delta = g ? gapHtml(g) : ''; x.insight = r.insight || M.why || '';
  x.say = r.say || (g && g.amt ? `${M.n} is ${g.amt.replace(/ pts$/, ' points')} ${g.words}.` : g ? `${M.n} is in line with ${VS[id] || 'plan'}.` : `${M.n} is ${x.value}.`);
  return x;
}
const cardBase3 = card;
card = function (id) { return MX[id] ? mkCard(id) : cardBase3(id); };

/* ---------- growth ---------- */
const grow = (f, P) => ({ A: agg(f, 'A', P.w0, P.w1), T: agg(f, 'T', P.w0, P.w1), L: agg(f, 'L', P.w0, P.w1), C: compAgg(f, P) });
mx('OVG', 'Organic volume growth', 'How many more or fewer cases we sell than last year, before price and mix.', '(Volume ÷ last year volume) − 1', { rk: 'pts', rg: 1, by: 'cb', prov: 'ERP',
  f: (f, P) => { const { A, T, L } = grow(f, P); let dn = 0, n = 0; for (const b of brandsOf(f)) for (const c of countriesOf(f)) { const ff = sub(f, { b: [b], c: [c] }); if (!has(ff)) continue; n++; if (agg(ff, 'A', P.w0, P.w1).vol < agg(ff, 'L', P.w0, P.w1).vol) dn++; }
    return { raw: A.vol / L.vol - 1, craw: T.vol / L.vol - 1, insight: `${dn} of ${n} brand and country pairs are selling fewer cases than last year` }; } });
mx('PMX', 'Price/mix', 'How much of growth comes from what we charge and what we sell, after trade spend.', 'Organic sales growth − organic volume growth', { rk: 'pts', rg: 1, by: 'cb',
  f: (f, P) => { const { A, T, L } = grow(f, P), u = x => x.ns / x.vol, pz = pricing(f, P); return { raw: u(A) / u(L) - 1, craw: u(T) / u(L) - 1, insight: `Pricing adds ${plain(pz.real)} and the rest is mix and trade spend` }; } });
mx('PRC', 'Pricing', 'Price increases that actually stuck at the shelf, after discounts.', 'Change in net price on comparable items', { rk: 'pts', rg: 1, by: 'cb',
  f: (f, P) => { const pz = pricing(f, P); return { raw: pz.real, craw: pz.plan, insight: isFinite(pz.recovery) ? `Price increases have won back ${(pz.recovery * 100).toFixed(0)}% of the cost increase` : '' }; } });
mx('MIX', 'Mix', 'Whether shoppers are trading up or down across packs, products and channels.', 'Change in net sales per case not explained by price', { rk: 'pts', rg: 1, by: 'cb', refL: 'Plan',
  f: (f, P) => { const br = bridge(f, P, 'ns'), C = compAgg(f, P), m = br.items.find(i => i[2] === 'mix')[1] / C.ns; return { raw: m, craw: 0, ref: 'Plan 0.0%', insight: m < 0 ? 'Shoppers are moving to cheaper packs and channels' : 'Shoppers are moving to pricier packs and channels' }; } });
mx('TPR', 'Trade promotion ROI', 'Whether promotions create real extra sales or pay for sales we would have made anyway.', 'Extra gross margin ÷ promotion cost', { rk: 'x', rg: 1, by: 'c', per: 'Evaluated promotions', prov: 'RGM tool',
  f: f => { const ev = promosIn(f).filter(p => p.roi != null); if (!ev.length) return { raw: null, craw: null, value: 'n/a', insight: 'No promotions evaluated here' }; const roi = ev.reduce((x, p) => x + p.incGM, 0) / ev.reduce((x, p) => x + p.spend, 0);
    return { raw: roi, craw: 1.2, insight: `${ev.filter(p => p.roi < .8).length} of ${ev.length} promotions earn back less than 80 cents per dollar` }; } });
mx('CATG', 'Category growth', 'How fast the whole category is growing. Separates growth the market gave us from growth we earned.', 'Category sales ÷ last year category sales − 1', { rk: 'pts', rg: 0, by: 'cb', vs: 'our growth', refL: 'Our growth', per: '4 weeks to 20 Sep', prov: 'Market data',
  f: (f, P) => { const [s0, s1] = shareWin(P), s = K.share(f, s0, s1); return { raw: s.mktGrowth, craw: s.ourGrowth, say: `The category is growing ${plain(s.mktGrowth)}, ${s.mktGrowth > s.ourGrowth ? 'faster' : 'slower'} than our ${plain(s.ourGrowth)}.`, insight: `We are growing ${plain(s.ourGrowth)} in a category growing ${plain(s.mktGrowth)}` }; } });
const OSA_ = { IN: .915, ID: .874, UK: .951, US: .962 };
mx('OSA', 'On-shelf availability', 'Whether being listed actually means being on the shelf when the shopper comes.', 'Store checks where the product is on shelf ÷ all checks', { rk: 'pts', rg: 1, by: 'c', vs: 'target', refL: 'Target', per: 'Store audits, 4 weeks', prov: 'Retail execution',
  f: f => ({ raw: wavgC(f, OSA_), craw: .95, insight: `${K.CMAP[worstC(f, OSA_, 1)].name} has the most empty shelves` }) });

/* ---------- brand and consumer ---------- */
function bh(f, i) { let n = 0, a = 0, l = 0, worst = null; for (const [k, v] of Object.entries(K.BRAND_HEALTH)) { const [b, c] = k.split('|'); if ((f.b && !f.b.includes(b)) || (f.c && !f.c.includes(c)) || !has({ b: [b], c: [c] })) continue; const w = ytdNs({ b: [b], c: [c] }), ly = i == null ? (v[0][0] + v[1][0] + v[2][0]) / 3 : v[i][0], now = i == null ? (v[0][1] + v[1][1] + v[2][1]) / 3 : v[i][1]; n += w; a += now * w; l += ly * w; if (!worst || now - ly < worst.d) worst = { d: now - ly, label: K.BMAP[b].name + ' in ' + K.CMAP[c].name }; } return n ? { now: a / n / 100, ly: l / n / 100, worst } : null; }
const bhCard = i => f => { const h = bh(f, i); return h ? { raw: h.now, craw: h.ly, insight: h.worst && h.worst.d < 0 ? `${h.worst.label} dropped the most (${h.worst.d.toFixed(1)} points)` : 'No brand lost ground' } : { raw: null, craw: null, value: 'n/a' }; };
const bhO = { rk: 'pts', rg: 1, by: 'cb', vs: 'last year', refL: 'Last year', per: 'Sep tracker', prov: 'Brand tracker' };
mx('BEQ', 'Brand equity', 'How strong our brands are in shoppers\' minds: known, considered and preferred. It moves before penetration and share do.', 'Average of awareness, consideration and preference, % of category buyers', { ...bhO, f: bhCard(null) });
mx('AWR', 'Unaided brand awareness', 'Whether people think of the brand when they think of the category.', 'Category buyers who name the brand unprompted ÷ all category buyers', { ...bhO, f: bhCard(0) });
mx('CONS', 'Brand consideration', 'Whether awareness turns into willingness to buy.', 'Category buyers who would consider the brand ÷ all category buyers', { ...bhO, f: bhCard(1) });
mx('INNO', 'Innovation rate', 'Whether the portfolio is being renewed. A low figure means an ageing portfolio.', 'Net sales from products launched in the last 3 years ÷ net sales', { rk: 'pts', rg: 1, vs: 'target', refL: 'Target', per: 'Year to date',
  f: () => ({ raw: K.INNOVATION.share, craw: K.INNOVATION.target, insight: `${K.LAUNCHES.length} launches are live and ${K.LAUNCHES.filter(l => l.sales >= l.salesPlan).length} are on plan` }) });
mx('BUY', 'Buying rate', 'How often each buyer buys. Together with penetration it gives volume.', 'Shopping trips with the brand ÷ buying households', { rk: 'pct', rg: 1, by: 'cb', vs: 'last year', refL: 'Last year', per: '52 weeks to Sep', prov: 'Consumer panel',
  f: f => { const z = buyers(f), w = z.rows.slice().sort((a, b) => a.df - b.df)[0]; return { raw: z.freq, craw: z.freqLY, value: z.freq.toFixed(1) + ' trips', ref: `Last year ${z.freqLY.toFixed(1)} trips`, insight: w && w.df < 0 ? `${w.label} buyers are buying least often` : 'Buyers are buying as often as before' }; } });
mx('REP', 'Repeat rate', 'Whether buyers come back after their first purchase.', 'Households buying 2 or more times ÷ buying households', { rk: 'pts', rg: 1, by: 'cb', vs: 'last year', refL: 'Last year', per: '52 weeks to Sep', prov: 'Consumer panel',
  f: f => { const z = buyers(f); return { raw: z.rep, craw: z.rep + .015, insight: 'Fewer buyers are coming back for Orchard Juice in Indonesia' }; } });

/* ---------- margin and cost ---------- */
mx('ICI', 'Input cost inflation', 'Raw and packaging material cost against budget.', 'Current material price ÷ budget price − 1, weighted by spend', { rk: 'pts', rg: -1, by: 'b', vs: 'budget', refL: 'Budget', per: 'Year to date', prov: 'Procurement system',
  f: (f, P) => { let w = 0, s = 0, worst = null; for (const b of brandsOf(f)) { const B = K.BMAP[b], cm = K.COMMODITIES.find(x => x.name === B.mat); if (!cm || !has({ ...f, b: [b] })) continue; const c = agg({ ...f, b: [b] }, 'A', P.w0, P.w1).cogs * B.matShare; w += c; s += c * cm.vsBudget; if (!worst || cm.vsBudget > worst.vsBudget) worst = cm; }
    return { raw: w ? s / w : 0, craw: 0, ref: 'Budget 0.0%', insight: worst ? `${worst.name} is ${pcn(worst.vsBudget)} over budget and ${pcn(worst.hedge)} is locked in` : '' }; } });
mx('OEE', 'Overall equipment effectiveness', 'How productively the plants use their lines, after downtime, speed losses and waste.', 'Availability × performance × quality', { rk: 'pts', rg: 1, by: 'c', vs: 'target', refL: 'Target', per: 'Last 13 weeks', prov: 'Manufacturing system',
  f: f => { const ps = K.PLANTS.filter(p => countriesOf(f).includes(p.c)); if (!ps.length) return { raw: null, craw: null, value: 'n/a' }; const w = ps.slice().sort((a, b) => (a.oee - a.oeeT) - (b.oee - b.oeeT))[0];
    return { raw: ps.reduce((x, p) => x + p.oee, 0) / ps.length, craw: ps.reduce((x, p) => x + p.oeeT, 0) / ps.length, insight: `${w.name} is furthest behind, at ${pcn(w.oee)} against ${pcn(w.oeeT)}` }; } });
mx('RCL', 'Product recalls', 'Where quality failures become public and costly.', 'Number of recalls and their cost', { rk: 'n0', rg: -1, vs: 'target', refL: 'Target', per: 'This year', prov: 'Quality system',
  f: () => ({ raw: K.QUALITY.recalls, craw: 0, value: K.QUALITY.recalls ? String(K.QUALITY.recalls) : 'None', ref: 'Target none', sev: K.QUALITY.recalls ? 'crit' : 'good', say: K.QUALITY.recalls ? `There have been ${K.QUALITY.recalls} recalls this year.` : 'There have been no recalls this year.', insight: `No quality holds, and complaints are ${K.QUALITY.cpmu} per million units against ${K.QUALITY.cpmuTarget}` }) });
mx('TRIR', 'Total recordable incident rate', 'Workplace safety across plants and warehouses. For the COO it is a licence to operate.', 'Recordable incidents × 200,000 ÷ hours worked', { rk: 'n2', rg: -1, vs: 'target', refL: 'Target', per: 'Rolling 12 months', prov: 'Safety system',
  f: () => { const s = K.SAFETY, i = s.incidents[0]; return { raw: s.ltifr * 2.6, craw: s.target * 2.6, insight: `One injury cost a worker time off at ${i.site} in week ${i.w}. A guard has been fitted.` }; } });
mx('PRODS', 'Productivity savings', 'Whether the savings programme is landing. Shortfalls show up in margin later.', 'Savings delivered so far, against plan', { rk: '$', rg: 1, vs: 'plan', per: 'Year to date', prov: 'Productivity programme',
  f: () => { const sv = K.SAVINGS, d = sv.reduce((x, s) => x + s.done, 0), p = sv.reduce((x, s) => x + s.plan, 0), w = sv.slice().sort((a, b) => (a.done - a.plan) - (b.done - b.plan))[0]; return { raw: d, craw: p, insight: `${w.lever} is furthest behind: ${w.note.charAt(0).toLowerCase() + w.note.slice(1)}` }; } });
mx('AMS', 'Advertising and marketing % of net sales', 'How much we spend on building brands, as a share of sales.', 'Advertising and marketing spend ÷ net sales', { rk: 'bps', rg: -1, by: 'cb', vs: 'budget', refL: 'Budget', prov: 'ERP',
  f: (f, P) => { const A = agg(f, 'A', P.w0, P.w1), C = compAgg(f, P); return { raw: A.ap / A.ns, craw: C.ap / C.ns, insight: 'Glow Skincare in India is over budget on purpose, ahead of Diwali' }; } });
mx('ROAS', 'Return on ad spend', 'How much sales each dollar of media and retail media brings in.', 'Sales from ads ÷ ad spend', { rk: 'x', rg: 1, by: 'cb', prov: 'Marketing mix model, Q2', per: 'Q2 model',
  f: (f, P) => { const A = agg(f, 'A', P.w0, P.w1), T = agg(f, 'T', P.w0, P.w1); return { raw: A.inc / A.ap * 2.4, craw: T.inc / T.ap * 2.4, insight: 'ShopNow sale days returned the most per dollar' }; } });
mx('ESOV', 'Excess share of voice', 'Whether a brand outspends or underspends its market position. Brands that underspend tend to lose share.', 'Share of voice − share of market', { rk: 'pts', rg: 1, by: 'cb', vs: 'share of market', refL: 'Share of market', per: 'Last 13 weeks', prov: 'Media monitoring',
  f: f => { const e = Object.entries(K.SOV).filter(([k]) => { const [b, c] = k.split('|'); return (!f.b || f.b.includes(b)) && (!f.c || f.c.includes(c)); }); if (!e.length) return { raw: null, craw: null, value: 'n/a', insight: 'No media data here' }; const w = e.slice().sort((a, b) => (a[1][0] - a[1][1]) - (b[1][0] - b[1][1]))[0], [wb, wc] = w[0].split('|');
    return { raw: e.reduce((x, [, v]) => x + v[0] - v[1], 0) / e.length / 100, craw: 0, ref: '', insight: `${K.BMAP[wb].name} in ${K.CMAP[wc].name} spends least for its share` }; } });
mx('DEX', 'Distribution expenses % of net sales', 'The cost of getting product from the factory to the customer.', 'Warehousing, freight and handling ÷ net sales', { rk: 'bps', rg: -1, by: 'cb',
  f: (f, P) => { const A = agg(f, 'A', P.w0, P.w1), C = compAgg(f, P); return { raw: A.dist / A.ns, craw: C.dist / C.ns, insight: 'Rush shipments in Indonesia are adding cost' }; } });
mx('LCPC', 'Logistics cost per case', 'How efficient the delivery network is: freight, warehouse cost and drop sizes.', 'Distribution cost ÷ cases', { rk: 'pct', rg: -1, by: 'cb',
  f: (f, P) => { const A = agg(f, 'A', P.w0, P.w1), C = compAgg(f, P), a = A.dist / A.vol, c = C.dist / C.vol; return { raw: a, craw: c, value: '$' + a.toFixed(2), ref: `Plan $${c.toFixed(2)}`, insight: 'Air freight for juice in Indonesia pushed freight per case up' }; } });
mx('OHD', 'Overheads % of net sales', 'The cost of the corporate centre, the sales organisation and support functions.', 'Overheads ÷ net sales', { rk: 'bps', rg: -1, prov: 'ERP',
  f: (f, P) => { const w1 = P.w1 > CW ? NW : P.w1, a = K.finance({}, 'A', P.w0, w1), t = K.finance({}, 'T', P.w0, w1); return { raw: a.overhead / a.ns, craw: t.overhead / t.ns, insight: 'The overhead freeze is keeping costs below plan' }; } });

/* ---------- cash ---------- */
const DSO_ = { IN: 57, ID: 43, UK: 33, US: 30 }, DPO_ = { IN: 48, ID: 52, UK: 58, US: 57 };
const dioOf = f => { const wh = warehouseData(f); return wh.length ? wh.reduce((x, w) => x + w.days, 0) / wh.length + 16 : NaN; };
mx('FCFC', 'Free cash flow conversion', 'How much of our profit turns into cash. A business can be profitable and still run short of cash.', 'Free cash flow ÷ net earnings', { rk: 'pts', rg: 1, vs: 'the 90% target', refL: 'Target', per: 'Jan to Sep, closed', prov: 'ERP, books closed',
  f: () => { const a = cash('A', 1, 39); return { raw: a.conv, craw: .9, insight: 'India distributors are holding more of our stock on credit' }; } });
mx('CCC', 'Cash conversion cycle', 'How many days it takes for stock to turn back into cash after we pay suppliers.', 'Inventory days + receivable days − payable days', { rk: 'days', rg: -1, by: 'c', vs: 'target', refL: 'Target', prov: 'ERP',
  f: f => { const dio = dioOf(f), dso = wavgC(f, DSO_), dpo = wavgC(f, DPO_); return { raw: dio + dso - dpo, craw: 35 + 36 - 60, insight: `Customers take ${dso.toFixed(0)} days to pay, and we pay suppliers in ${dpo.toFixed(0)}` }; } });
mx('DIO', 'Days inventory outstanding', 'How long stock sits in plants and warehouses before it is sold.', 'Inventory ÷ cost of goods per day', { rk: 'days', rg: -1, by: 'c', vs: 'target', refL: 'Target', prov: 'Supply planner',
  f: f => { const wh = warehouseData(f).sort((a, b) => b.days - a.days)[0]; return { raw: dioOf(f), craw: 35, insight: wh ? `${wh.name} holds the most days of stock` : '' }; } });
mx('DSO', 'Days sales outstanding', 'How long customers take to pay us. Payment terms are set by sales, collections are run by finance.', 'Receivables ÷ net sales per day', { rk: 'days', rg: -1, by: 'c', vs: 'target', refL: 'Target', prov: 'ERP',
  f: f => ({ raw: wavgC(f, DSO_), craw: 36, insight: 'India general trade pays slowest since the distributor push' }) });
mx('DPO', 'Days payables outstanding', 'How long we take to pay suppliers.', 'Payables ÷ purchases per day', { rk: 'days', rg: 1, by: 'c', vs: 'target', refL: 'Target', prov: 'ERP',
  f: f => ({ raw: wavgC(f, DPO_), craw: 60, insight: 'Supplier terms are shorter than plan, mainly for oats' }) });
mx('EO', 'Excess and obsolete inventory %', 'Stock that will not sell at full value, usually from poor forecasts or too many products.', 'Stock close to expiry or obsolete ÷ total inventory', { rk: 'pts', rg: -1, by: 'c', vs: 'target', refL: 'Target', prov: 'Supply planner',
  f: f => { const cs = countriesOf(f), ne = cs.reduce((x, c) => x + (K.NEAR_EXPIRY.own[c] || 0), 0), inv = agg(f, 'A', 1, CW).cogs / (CW * 7) * dioOf(f); return { raw: ne / inv, craw: .012, insight: `${fmt$(ne)} of our own stock is close to expiry` }; } });
mx('CAPEX', 'Capital spending % of net sales', 'How much cash we reinvest in plants and equipment, relative to our size.', 'Capital spending ÷ net sales', { rk: 'bps', rg: 0, prov: 'ERP', per: 'Jan to Sep',
  f: () => ({ raw: K.CASH.capexA, craw: K.CASH.capexT, insight: 'Spending is behind plan on the new Midlands distribution centre' }) });
mx('ROIC', 'Return on invested capital', 'Whether the capital we spend earns a return.', 'Operating profit after tax ÷ invested capital', { rk: 'pts', rg: 1, per: 'Last 12 months', prov: 'FP&A',
  f: () => ({ raw: .138, craw: .15, insight: 'Margin fell while capital grew, so returns dipped' }) });

/* ---------- service ---------- */
const OTD_ = { IN: .958, ID: .902, UK: .974, US: .977 }, DFD_ = { IN: .988, ID: .985, UK: .996, US: .995 }, ODA_ = { IN: .962, ID: .978, UK: .989, US: .991 }, COTD_ = { IN: .941, ID: .862, UK: .968, US: .972 }, OFCT_ = { IN: 3.6, ID: 4.5, UK: 2.3, US: 2.5 };
const svc = { rk: 'pts', rg: 1, by: 'c', vs: 'target', refL: 'Target', per: '4 weeks', prov: 'Order management' };
const fillOf = f => agg(f, 'A', CW - 3, CW).fill;
const fillByC = f => Object.fromEntries(countriesOf(f).map(c => [c, has({ ...f, c: [c] }) ? fillOf({ ...f, c: [c] }) : 1]));
mx('POR', 'Perfect order rate', 'How often an order arrives on time, in full, undamaged and with the right paperwork, as the retailer sees it.', 'On time × in full × damage free × correct paperwork', { ...svc,
  f: f => { const fb = fillByC(f), w = worstC(f, fb, 1); return { raw: wavgC(f, OTD_) * fillOf(f) * wavgC(f, DFD_) * wavgC(f, ODA_), craw: .91, insight: w ? `${K.CMAP[w].name} pulls it down most: fill rate there is ${pct1(fb[w])}` : '' }; } });
mx('OTD', 'On-time delivery', 'How punctual our deliveries to customers are.', 'Deliveries in the agreed window ÷ all deliveries', { ...svc, f: f => ({ raw: wavgC(f, OTD_), craw: .96, insight: `${K.CMAP[worstC(f, OTD_, 1)].name} is latest, mostly from carriers` }) });
mx('CFR', 'Case fill rate', 'Whether we ship what the customer ordered. Short shipments mean lost sales and fines.', 'Cases shipped ÷ cases ordered', { ...svc,
  f: f => { const fb = fillByC(f), w = worstC(f, fb, 1); return { raw: fillOf(f), craw: .97, insight: w ? `${K.CMAP[w].name} ships the least in full, at ${pct1(fb[w])}` : '' }; } });
mx('DFD', 'Damage-free delivery', 'How well product survives the warehouse and the trip.', 'Cases delivered undamaged ÷ cases delivered', { ...svc, f: f => ({ raw: wavgC(f, DFD_), craw: .995, insight: 'Most damage happens in transit in Indonesia and India' }) });
mx('ODA', 'Order documentation accuracy', 'Whether invoices and order paperwork are right. Errors cause deductions and slow payment.', 'Orders with correct documents ÷ all orders', { ...svc, f: f => ({ raw: wavgC(f, ODA_), craw: .985, insight: 'Invoice errors are highest in India modern trade' }) });
mx('COTD', 'Carrier on-time delivery', 'How reliable our transport partners are.', 'Carrier deliveries on time ÷ all carrier deliveries', { ...svc, f: f => ({ raw: wavgC(f, COTD_), craw: .95, insight: `${K.CMAP[worstC(f, COTD_, 1)].name} carriers are latest` }) });
mx('OFCT', 'Order fulfillment cycle time', 'How long it takes from order to delivery. A longer cycle makes on time harder.', 'Average days from order to delivery', { ...svc, rk: 'days', rg: -1, f: f => ({ raw: wavgC(f, OFCT_), craw: 3, insight: `Orders in ${K.CMAP[worstC(f, OFCT_, -1)].name} take longest` }) });
mx('FA', 'Forecast accuracy', 'How good the demand plan is. Poor forecasts cause both shortages and excess stock.', '1 − average forecast error, by product and country, 1-month lag', { ...svc, per: 'Last month', prov: 'Demand planning',
  f: f => { const w = worstC(f, K.FORECAST_ACC, 1); return { raw: wavgC(f, K.FORECAST_ACC), craw: K.FORECAST_ACC.target, insight: w ? `${K.CMAP[w].name} forecasts are ${pcn(K.FORECAST_BIAS[w])} ${K.FORECAST_BIAS[w] >= 0 ? 'too high' : 'too low'}` : '' }; } });
mx('SOTIF', 'Supplier OTIF', 'How reliable material and packaging supply is. A late input stops a line.', 'Supplier deliveries on time and in full ÷ all deliveries', { ...svc, by: null, per: 'Last 13 weeks', prov: 'Procurement system',
  f: () => { const s = K.SUPPLIERS; return { raw: s.reduce((x, y) => x + y.otif, 0) / s.length, craw: .95, insight: `${s.filter(x => x.risk === 'High').map(x => x.name).join(' and ')} are least reliable` }; } });

/* ---------- panels for the new L1s, and where each metric's full analysis lives ---------- */
function openBrand() { const f = filter(), h = bh(f, null); openLevel({ crumb: 'Brand equity', title: h ? `Brand equity is ${plain(h.now)}, ${Math.abs(h.now - h.ly) < .0005 ? 'about the same as last year' : `${h.now >= h.ly ? 'up' : 'down'} ${Math.abs((h.now - h.ly) * 100).toFixed(1)} points on last year`}.${h.worst && h.worst.d < 0 ? ` ${h.worst.label} dropped the most.` : ''}` : 'Brand equity', blocks: shareExtras(f).reverse() }, true); }
function openDSO() {
  const f = filter(), cs = countriesOf(f).filter(c => has({ ...f, c: [c] })), d = wavgC(f, DSO_);
  const ac = accountsData(f, win()).map(a => ({ ...a, dso: DSO_[a.c] + (a.ch === 'GT' ? 9 : a.ch === 'LR' ? 3 : a.ch === 'ECOM' ? -6 : 0) })).sort((a, b) => b.dso - a.dso);
  openLevel({ crumb: 'Days sales outstanding', title: `Customers take ${d.toFixed(0)} days to pay, against a target of 36. India is slowest since the distributor push.`, blocks: [
    { h: 'Days to get paid, by country', html: tbl(['Country', 'Days', 'Target', 'Receivables'], cs.map(c => `<tr ${sliceAttr({ c: [c] })}><td>${K.CMAP[c].name}</td><td class="r num"><b>${DSO_[c]}</b></td><td class="r num">36</td><td class="r num">${fmt$(ytdNs({ c: [c] }) / (CW * 7) * DSO_[c])}</td></tr>`)), src: 'ERP' },
    { h: 'Slowest payers', sub: 'Key accounts, days to pay', html: tbl(['Account', 'Country and channel', 'Days'], ac.slice(0, 8).map(a => `<tr ${sliceAttr(a.slice)}><td>${esc(a.name)}</td><td class="r">${K.CMAP[a.c].name}, ${K.CHMAP[a.ch].name}</td><td class="r num ${a.dso > 36 ? 'neg-t' : ''}">${a.dso}</td></tr>`), 'Account numbers are illustrative.'), src: 'ERP' }] }, true);
}
const openCostLevel = () => openLevel({ crumb: 'Costs and savings', title: 'Savings, commodity prices and plant efficiency', blocks: cogsExtras() }, true);
const lead = (id, rest) => { const lv = drill.stack[drill.stack.length - 1]; extendTop({ insight: `${card(id).say} ${rest || (lv && (lv.insight || lv.title)) || ''}`.trim() }); };
Object.assign(PANEL, { POR: () => { band('O2'); extendTop({ pre: [otifExtras(filter())] }); lead('POR'); }, FCFC: () => { PANEL.FCF(); lead('FCFC', 'India distributors are holding more of our stock on credit.'); },
  TRIR: () => { openSAFQ(); lead('TRIR', `One injury cost a worker time off this quarter, at ${K.SAFETY.incidents[0].site}. Complaints are below target and there are no recalls.`); }, DSO: () => openDSO(), BEQ: () => openBrand(), AMS: () => openAP() });
{ const base = PANEL.OSG; PANEL.OSG = () => { base(); if (state.role === 'CSO') extendTop(salesExtras(filter())); }; }
const FULL = { OSG: () => band('C1'), OVG: () => openSSG(), PMX: () => openTile('Sh2'), PRC: () => openCFO('F3'), MIX: () => openContrib(filter(), win(), 'mix', 'Mix', 'ns'), TRADE: () => openCFO('F2'), TPR: () => openCFO('F5'),
  CATG: () => openSSG(), SHARE: () => openTile('Sh6'), DIST: () => band('S2'), OSA: () => band('O1'), BEQ: openBrand, AWR: openBrand, CONS: openBrand, INNO: () => openSSG(), GM: () => openCFO('F1'), ICI: () => openCFO('F4'), OEE: openCostLevel,
  RCL: () => openSAFQ(), TRIR: () => openSAFQ(), OM: () => openTile('Sh3'), AMS: () => openAP(), ROMI: () => band('M2'), ROAS: () => openAP(), ESOV: openBrand, DEX: () => band('O3'), LCPC: () => band('O3'), OHD: () => openTile('Sh3'), PRODS: openCostLevel,
  FCFC: () => PANEL.FCF(), CCC: () => PANEL.FCF(), DIO: () => band('O1'), DSO: openDSO, DPO: () => PANEL.FCF(), EO: () => band('O1'), CAPEX: () => PANEL.FCF(), ROIC: () => PANEL.FCF(),
  POR: () => band('O2'), OTD: () => band('O2'), CFR: () => band('O2'), DFD: () => band('O2'), ODA: () => band('O2'), COTD: () => band('O2'), OFCT: () => band('O2'), FA: () => openRISK(), SOTIF: () => openSAFQ(), PEN: () => openPENF(), BUY: () => openPENF(), REP: () => openPENF() };

/* ---------- L2 tiles inside the panel ---------- */
function nodeKids(l1, l2) { for (const t of [TREE[state.role], TREE.CEO]) { const a = t.find(x => x[0] === l1); if (!a) continue; if (!l2) return a[1].map(x => x[0]); const b = a[1].find(x => x[0] === l2); if (b) return b[1]; } return []; }
function findPath(tree, id) { for (const [l1, kids] of tree) { if (l1 === id) return [l1]; for (const [l2, l3s] of kids) { if (l2 === id) return [l1, l2]; if (l3s.includes(id)) return [l1, l2, id]; } } return null; }
const nowLine = (id, x) => `<span class="c-now">Now <b class="num">${x.value}${x.valueUnit ? ' ' + x.valueUnit : ''}</b></span>`;
const gapLine = (id, x) => { const g = gapOf(id, x); return `<span class="c-gap">${g && g.amt ? `<i>${g.arrow}</i><b class="num">${g.amt}</b><span>${g.words}</span>` : g ? `<b class="flat">${g.words}</b>` : `<b class="num">${x.value}</b>`}</span>`; };
function l2Block(l1) {
  const kids = nodeKids(l1); if (!kids.length) return null;
  const tiles = kids.map(id => { const x = card(id), n = nodeKids(l1, id).length; return `<button class="l2 s-${x.sev}" data-l2="${l1}|${id}"><span class="c-head"><span class="c-sig">${SEV[x.sev]}</span><span class="l2-k">${n ? `${n} driver${n > 1 ? 's' : ''}` : 'Details'} →</span></span><span class="c-name">${esc(CARD_DEF[id][0])}</span>${gapLine(id, x)}${nowLine(id, x)}<span class="l2-i">${esc(x.insight)}</span></button>`; }).join('');
  return { h: `What adds up to ${CARD_DEF[l1][0].toLowerCase()}`, sub: LOGIC[l1] || '', wide: true, html: `<div class="l2-row" style="--n:${kids.length}">${tiles}</div>`, src: 'Same filters and period as this panel. Click a metric to see what drives it.' };
}

/* ---------- side panel: an L2 and its L3s, or one L3 ---------- */
const DR = { path: null };
function openDrawer(path) { DR.path = path; renderDrawer(); const d = $('#drawer'); d.hidden = false; requestAnimationFrame(() => d.classList.add('in')); }
function closeDrawer() { const d = $('#drawer'); if (!d) return; d.classList.remove('in'); d.hidden = true; DR.path = null; }
function byTable(id, dim) {
  const keys = dim === 'c' ? countriesOf(PF).filter(c => has({ ...PF, c: [c] })) : brandsOf(PF).filter(b => has({ ...PF, b: [b] }));
  if (keys.length < 2) return '';
  const rows = keys.map(k => { const s = dim === 'c' ? { c: [k] } : { b: [k] }, y = withF({ ...PF, ...s }, () => card(id)), g = gapOf(id, y); return { k, s, y, g }; });
  return `<h4>By ${dim === 'c' ? 'country' : 'brand'}</h4><div class="dr-by">${rows.map(r => `<button class="dr-row s-${r.y.sev}" data-dr-slice='${JSON.stringify(r.s)}'><span>${dim === 'c' ? K.CMAP[r.k].name : K.BMAP[r.k].name}</span><b class="num">${r.y.value}</b><span class="dr-g">${r.g && r.g.amt ? `${r.g.arrow} ${r.g.amt}` : r.g ? 'in line' : ''}</span></button>`).join('')}</div>`;
}
function renderDrawer() {
  const [l1, l2, l3] = DR.path, id = l3 || l2, x = card(id), t = trendOf(id), kids = l3 ? [] : nodeKids(l1, l2), names = [l1, l2, l3].filter(Boolean);
  const crumbs = names.map((k, i) => i < names.length - 1 ? `<button class="link" data-dr-go="${names.slice(0, i + 1).join('|')}">${esc(CARD_DEF[k][0])}</button>` : `<span>${esc(CARD_DEF[k][0])}</span>`).join('<i>›</i>');
  const scope = Object.keys(PF).some(k => PF[k]) ? `${nameOf(PF)}, ` : '';
  const kidRows = kids.map(k => { const y = card(k); return `<button class="iss s-${y.sev}" data-l3="${k}"><span class="iss-b"><span class="iss-s">${SEV[y.sev]}</span><span class="iss-h"><b>${esc(CARD_DEF[k][0])}</b><span class="iss-g">${gapHtml(gapOf(k, y)) || `<b class="num">${y.value}</b>`}</span></span><span class="iss-t">Now ${y.value}. ${esc(y.insight)}</span></span><span class="iss-go" aria-hidden="true">→</span></button>`; }).join('');
  const by = BY[id] ? (BY[id].includes('c') ? byTable(id, 'c') : '') + (BY[id].includes('b') ? byTable(id, 'b') : '') : '';
  $('#drawer').innerHTML = `<div class="dr-top"><div class="crumbs">${crumbs}</div><button class="icon-btn" data-dr-close aria-label="Close side panel" title="Close (Esc)">${ICON.x}</button></div>
    <div class="dr-body">
      <div class="card dr-card s-${x.sev}"><span class="c-head"><span class="c-sig">${SEV[x.sev]}</span><span class="c-per">${esc(scope + x.per)}</span></span>
        <span class="c-name">${esc(CARD_DEF[id][0])}<span class="info" data-def="${id}" aria-hidden="true">i</span></span>${gapLine(id, x)}${nowLine(id, x)}
        ${t ? `<span class="c-tr">${trendSvg(t, x.sev)}<span class="c-tr-l"><span class="c-tr-n">${esc(t.lab)}</span></span></span>` : ''}
        <span class="c-ins"><span>${esc(x.insight)}</span></span></div>
      <p class="dr-def">${esc(CARD_DEF[id][1])}${LOGIC[id] ? ` <b>How it adds up:</b> ${esc(LOGIC[id])}` : ''}</p>
      ${kids.length ? `<h4>What drives it</h4><div class="iss-list">${kidRows}</div>` : ''}
      ${by}
      ${FULL[id] ? `<button class="btn primary dr-full" data-full="${id}">Open the full analysis</button>` : ''}
      <p class="foot">Source: ${esc(x.prov || 'ERP')}. Same filters and period as the panel.</p>
    </div>`;
  $('#drawer').scrollTop = 0;
}
document.addEventListener('click', e => {
  const t = e.target, g = s => t.closest(s);
  const a = g('[data-l2]'); if (a) { openDrawer(a.dataset.l2.split('|')); return; }
  const b = g('[data-l3]'); if (b && DR.path) { openDrawer([DR.path[0], DR.path[1], b.dataset.l3]); return; }
  const c = g('[data-dr-go]'); if (c) { const p = c.dataset.drGo.split('|'); if (p.length < 2) closeDrawer(); else openDrawer(p); return; }
  if (g('[data-dr-close]')) { closeDrawer(); return; }
  const s = g('[data-dr-slice]'); if (s && DR.path) { const p = DR.path.slice(); openCard(p[0], { ...PF, ...JSON.parse(s.dataset.drSlice) }); openDrawer(p); return; }
  const fu = g('[data-full]'); if (fu) { const id = fu.dataset.full; closeDrawer(); goDeeper(FULL[id]); $('#band').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && DR.path && $('#modal').hidden) { closeDrawer(); e.stopPropagation(); } }, true);

/* ---------- hooks into the existing panel, Ask and summary ---------- */
const openCardBase = openCard;
openCard = function (id, f, keep) { openCardBase(id, f, keep); const b = l2Block(id); if (b) extendTop({ pre: [b] }); if (DR.path) { if (DR.path[0] === id) renderDrawer(); else closeDrawer(); } };
const closePanelBase = closePanel;
closePanel = function () { closePanelBase(); closeDrawer(); };
cardFor = function (cls) { const r = state.role, m = { CEO: { competitor: 'OSG', market: 'OSG', opportunity: 'OSG', supply: 'POR', loading: 'FCFC', cost: 'OM', buying: 'OM', volume: 'OSG' }, CFO: { cost: 'GM', buying: 'GM', loading: 'FCFC', supply: 'OSG', market: 'OSG', competitor: 'OSG', opportunity: 'OSG', volume: 'OSG' }, CMO: { competitor: 'OSG', market: 'OSG', opportunity: 'AMS', buying: 'OSG', cost: 'OSG', supply: 'OSG', loading: 'OSG', volume: 'OSG' }, CSO: { loading: 'OSG', supply: 'POR', competitor: 'SHARE', buying: 'OSG', cost: 'OSG', market: 'SHARE', opportunity: 'OSG', volume: 'OSG' }, COO: { supply: 'POR', cost: 'GM', loading: 'FCFC', buying: 'GM', competitor: 'POR', market: 'POR', opportunity: 'POR', volume: 'POR' } }; return (m[r] || {})[cls] || ROLE_CARDS[r][0]; };
Object.keys(METRIC_WORDS).forEach(k => delete METRIC_WORDS[k]);
Object.assign(METRIC_WORDS, { OSG: ['organic sales growth', 'organic growth', 'sales growth', 'revenue growth', 'net sales', 'revenue', 'growth', 'sales'], OVG: ['volume growth', 'volume', 'cases sold', 'shipments'], PMX: ['price mix', 'price/mix'], PRC: ['pricing', 'price increase', 'price increases', 'price'], MIX: ['mix', 'trading down', 'trading up'],
  TRADE: ['trade spend', 'trade rate', 'gross to net', 'gross-to-net', 'discounts', 'discount'], TPR: ['promotion roi', 'promo roi', 'promotions', 'promotion', 'promos', 'promo'], CATG: ['category growth', 'category', 'market growth'], SHARE: ['market share', 'value share', 'share'], DIST: ['weighted distribution', 'distribution', 'listings', 'outlets'], OSA: ['on shelf availability', 'on-shelf availability', 'shelf', 'osa', 'out of stock', 'stockouts'],
  BEQ: ['brand equity', 'brand health', 'brands'], AWR: ['brand awareness', 'unaided awareness', 'awareness'], CONS: ['brand consideration', 'consideration'], INNO: ['innovation', 'launches', 'launch', 'new products'], PEN: ['household penetration', 'penetration', 'households', 'buyers'], BUY: ['buying rate', 'frequency', 'trips'], REP: ['repeat rate', 'repeat', 'loyalty'],
  OM: ['operating margin', 'operating profit', 'profit', 'margin'], GM: ['gross margin', 'gross profit'], ICI: ['input cost', 'input costs', 'inflation', 'commodities', 'commodity', 'oat cost', 'oats cost', 'hedge', 'hedging'], OEE: ['equipment effectiveness', 'oee', 'plants', 'plant'], RCL: ['recalls', 'recall', 'quality'], TRIR: ['incident rate', 'safety', 'injuries', 'injury', 'trir'],
  AMS: ['marketing spend', 'advertising', 'a&p', 'a & p', 'marketing'], ROMI: ['marketing roi', 'marketing return', 'romi'], ROAS: ['return on ad spend', 'roas', 'retail media'], ESOV: ['share of voice', 'esov', 'sov'], DEX: ['distribution expenses', 'distribution cost', 'logistics'], LCPC: ['cost per case', 'freight'], OHD: ['overheads', 'overhead'], PRODS: ['productivity savings', 'savings', 'productivity'],
  FCFC: ['cash conversion', 'free cash flow', 'cash flow', 'fcf', 'cash'], CCC: ['cash conversion cycle', 'working capital'], DIO: ['inventory days', 'days inventory', 'dio', 'inventory'], DSO: ['receivables', 'days sales outstanding', 'dso', 'collections'], DPO: ['payables', 'dpo', 'supplier terms'], EO: ['obsolete', 'expiry', 'excess stock'], CAPEX: ['capital spending', 'capex'], ROIC: ['roic', 'return on capital'],
  POR: ['perfect order', 'service level', 'service'], OTD: ['on time delivery', 'on-time delivery', 'on time', 'late deliveries'], CFR: ['case fill rate', 'fill rate', 'in full', 'otif', 'lost sales'], DFD: ['damage', 'damaged'], ODA: ['documentation', 'invoice errors', 'deductions'], COTD: ['carrier', 'carriers', 'transport'], OFCT: ['cycle time', 'lead time'], FA: ['forecast accuracy', 'forecast bias'], SOTIF: ['supplier otif', 'suppliers', 'supplier'],
  EPS: ['earnings per share', 'eps', 'earnings', 'guidance', 'consensus'] });
const runAskBase3 = runAsk;
runAsk = function (q, inPanel) {
  if (/bolt/i.test(q) && /convenience/i.test(q) && /(share|losing)/i.test(q)) return runAskBase3(q, inPanel);
  const r = parseAsk(q); if (!r.metric) return runAskBase3(q, inPanel);
  const path = findPath(TREE[state.role], r.metric) || findPath(TREE.CEO, r.metric); if (!path) return runAskBase3(q, inPanel);
  if (r.per && r.per !== state.period) { state.period = r.per; if (!['LW', 'MTD', 'LM', 'R4W'].includes(r.per) && state.comp === 'M') state.comp = 'T'; syncControls(); renderHome(); }
  openCard(path[0], r.f); if (path.length > 1) openDrawer(path); else closeDrawer();
  const owner = ['CMO', 'CSO', 'COO', 'CFO', 'CEO'].find(x => TREE[x].some(n => n[0] === path[0])), via = ROLE_CARDS[state.role].includes(path[0]) ? '' : `It normally lives in the ${owner} view.`;
  const chips = Object.entries(r.f).map(([k, v]) => k === 'c' ? K.CMAP[v[0]].name : k === 'b' ? K.BMAP[v[0]].name : K.CHMAP[v[0]].name);
  const out = $('#ask-out'); out.hidden = false;
  out.innerHTML = `<span class="ai" data-def="AI">Ask</span> Showing <b>${esc(CARD_DEF[r.metric][0])}</b>${path.length > 1 ? ` inside ${esc(CARD_DEF[path[0]][0].toLowerCase())}` : ''}${chips.length ? ' for ' + chips.map(c => `<span class="chip-f">${esc(c)}</span>`).join(' ') : ' for the whole company'}${r.per ? `, ${esc(PERIODS[r.per].label)}` : ''}.${via ? ` <span class="muted">${esc(via)}</span>` : ''}${r.unused.length ? ` <span class="muted">Not understood: ${esc(r.unused.slice(0, 4).join(', '))}.</span>` : ''}`;
  $('#ask-panel-in').value = q;
};
const renderHomeBase = renderHome;
renderHome = function () { renderHomeBase(); $('#cards').style.gridTemplateColumns = `repeat(${ROLE_CARDS[state.role].length},minmax(0,1fr))`; };

/* ---------- render ---------- */
function renderHome() {
  const P = win(), ex = withF({}, () => exceptions({}, P)); window.__ex = ex;
  withF({}, () => buildActions(ex, {}, P));
  $('#summary').innerHTML = summaryView(ex);
  const ids = ROLE_CARDS[state.role];
  $('#cards').innerHTML = ids.map((id, i) => cardHtml(id, i)).join('');
  renderPins();
  $('#acts').innerHTML = actionsView();
  $('#act-sum').textContent = `${actionsList().filter(a => a.status !== 'Done').length} open, sorted by priority`;
  if (OPEN) PANEL[OPEN]();
}
function syncControls() {
  $('#view-name').textContent = ROLES[state.role].label;
  ['period', 'comp'].forEach(k => { const b = $('#cust-' + k); if (b) b.hidden = true; });
  const P = win(); $('#period-lab').textContent = `${P.label}, ${compShort()}`;
  seg($('#f-period'), Object.entries(PERIODS).map(([k, v]) => [k, v.label]).concat([['CUSTOM', 'Custom']]), state.period, v => { if (v === 'CUSTOM') return toggleCustom('period'); state.period = v; if (!SHORT.includes(v) && state.comp === 'M') state.comp = 'T'; syncControls(); renderHome(); });
  seg($('#f-comp'), [['T', 'Plan'], ['E', 'Latest estimate'], ['L', 'Last year']].concat(SHORT.includes(state.period) ? [['M', 'Last month']] : []).concat([['CUSTOM', 'Custom']]), state.comp, v => { if (v === 'CUSTOM') return toggleCustom('comp'); state.comp = v; syncControls(); renderHome(); });
  seg($('#f-year'), [['CAL', 'Calendar'], ['FISCAL', 'Fiscal (April to March)']], state.year, v => { state.year = v; syncControls(); renderHome(); });
  $('#period-desc').textContent = P.desc;
}
// custom date ranges: shown so the idea is visible, switched off in the prototype
function toggleCustom(k) {
  const box = $('#cust-' + k), btn = $(k === 'period' ? '#f-period' : '#f-comp').querySelector('[data-v="CUSTOM"]'), open = box.hidden;
  box.hidden = !open; btn.classList.toggle('open', open);
  if (!open) return;
  const cal = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  const field = l => `<label class="cust-f"><span>${l}</span><div aria-disabled="true">${cal}Pick a date</div></label>`;
  box.innerHTML = `<div class="cust-row">${field(k === 'period' ? 'Start date' : 'Compare from')}<span class="to">to</span>${field(k === 'period' ? 'End date' : 'Compare to')}</div><div class="cust-cal" role="note">${cal.replace('16', '20').replace('16', '20')}Custom is disabled in prototype mode.</div>`;
}
function seg(el, opts, cur, on) { el.innerHTML = opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === cur}"${v === 'CUSTOM' ? ' class="cust-b"' : ''}>${l}</button>`).join(''); el.onclick = e => { const b = e.target.closest('button'); if (b) on(b.dataset.v); }; }
const SHORT = ['LW', 'MTD', 'LM', 'R4W'];
const ROLE_INFO = { CEO: 'Sales growth, operating margin, cash conversion and perfect orders.', CFO: 'Sales growth, gross margin, operating margin and cash conversion.', CMO: 'Brand equity, sales growth and marketing spend.', CSO: 'Sales growth, market share, perfect orders and how fast customers pay.', COO: 'Perfect orders, gross margin, cash conversion and safety.' };
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
  const ra = g('[data-rgm-action]'); if (ra) { const r = RGM[ra.dataset.rgmAction].alias ? RGM[RGM[ra.dataset.rgmAction].alias] : RGM[ra.dataset.rgmAction]; $('#acts').scrollIntoView({ behavior: 'smooth', block: 'start' }); newActionForm({ title: r.rows.find(x => /recommended/i.test(x[0])) ? 'Switch to: ' + r.rows.find(x => /recommended/i.test(x[0]))[0].replace(/ \(recommended\)/i, '') : r.title, issue: 'RGM check: ' + r.title, why: r.head, f: { ...PF } }); return; }
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
