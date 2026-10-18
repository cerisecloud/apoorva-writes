/* Pulse: synthetic data for Northstar Consumer Goods (fictional) (all names and figures are fictional).
   Builds weekly data for FY2026 (calendar year): actuals through week 41, forecast weeks 42-52,
   plus target (budget / RGM plan) and last year. Exposes window.KD (browser) or globalThis.KD (node). */
(function (root) {
'use strict';

function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = rng(20261016);
const nz = s => (R() - .5) * 2 * s;

const NW = 52, CW = 41, MKT_LAST = 38;               // actuals to wk 41; market data to wk 38 (4 wks ending 20 Sep)
const weekEnd = w => new Date(Date.UTC(2026, 9, 11) + (w - 41) * 7 * 864e5);

/* ---------------- master data ---------------- */
const REGIONS = [{ id: 'Asia', countries: ['IN', 'ID'] }, { id: 'Europe', countries: ['UK'] }, { id: 'Americas', countries: ['US'] }];
const COUNTRIES = [
  { id: 'IN', name: 'India', region: 'Asia', ns: 900e6, px: .45, cities: ['Mumbai', 'Delhi', 'Bengaluru'], cityW: [.4, .35, .25], coverage: .72, leadDays: 10 },
  { id: 'ID', name: 'Indonesia', region: 'Asia', ns: 540e6, px: .50, cities: ['Jakarta', 'Surabaya', 'Bandung'], cityW: [.5, .28, .22], coverage: .68, leadDays: 14 },
  { id: 'UK', name: 'UK', region: 'Europe', ns: 640e6, px: 1.05, cities: ['London', 'Manchester', 'Birmingham'], cityW: [.48, .28, .24], coverage: .96, leadDays: 7 },
  { id: 'US', name: 'USA', region: 'Americas', ns: 1120e6, px: 1.0, cities: ['New York', 'Chicago', 'Dallas'], cityW: [.42, .3, .28], coverage: .94, leadDays: 7 },
];
const CHANNELS = [
  { id: 'MT', name: 'Modern trade', px: 1.0, tr: .17, dc: 1.0, cover: 2.5 },
  { id: 'LR', name: 'Large retail', px: .97, tr: .20, dc: .85, cover: 2.0 },
  { id: 'CONV', name: 'Convenience', px: 1.10, tr: .10, dc: 1.4, cover: 1.5 },
  { id: 'ECOM', name: 'E-commerce', px: .98, tr: .18, dc: 1.6, cover: 1.0 },
  { id: 'GT', name: 'General trade', px: 1.0, tr: .08, dc: 1.1, cover: 3.5 },
];
const CH_SPLIT = { US: { MT: .30, LR: .42, CONV: .14, ECOM: .14 }, UK: { MT: .34, LR: .36, CONV: .18, ECOM: .12 }, IN: { MT: .20, LR: .08, CONV: .04, ECOM: .16, GT: .52 }, ID: { MT: .26, LR: .12, CONV: .08, ECOM: .10, GT: .44 } };
const BRANDS = [
  { id: 'bolt', name: 'Bolt Brew Coffee', cat: 'Beverages', sub: 'Coffee', lp: 30, cogs: .40, ap: .11, mat: 'Coffee beans', matShare: .5, skus: [['Bolt Brew Cold Coffee 250ml', .5], ['Bolt Brew Instant 100g', .3], ['Bolt Brew Cold Coffee 4-pack', .2]] },
  { id: 'orchard', name: 'Orchard Juice', cat: 'Beverages', sub: 'Juice', lp: 22, cogs: .48, ap: .07, mat: 'Fruit concentrate', matShare: .55, skus: [['Orchard Orange 1L', .45], ['Orchard Mixed Fruit 1L', .35], ['Orchard Kids Juice Box 6x200ml', .2]] },
  { id: 'oats', name: 'Sunrise Oats', cat: 'Food', sub: 'Oats & cereal', lp: 36, cogs: .46, ap: .07, mat: 'Oats', matShare: .6, skus: [['Sunrise Rolled Oats 500g', .5], ['Sunrise Honey Granola 400g', .3], ['Sunrise Instant Oats 10x40g', .2]] },
  { id: 'crunch', name: 'Crunch Chips', cat: 'Food', sub: 'Chips & snacks', lp: 24, cogs: .42, ap: .08, mat: 'Potatoes & oil', matShare: .5, skus: [['Crunch Sea Salt 150g', .45], ['Crunch Chilli Lime 150g', .3], ['Crunch Party Pack 400g', .25]] },
  { id: 'glow', name: 'Glow Skincare', cat: 'Personal Care', sub: 'Skincare', lp: 90, cogs: .28, ap: .14, mat: 'Actives & oils', matShare: .45, skus: [['Glow Daily Moisturiser 100ml', .45], ['Glow Vitamin C Serum 30ml', .3], ['Glow Sunscreen SPF50 50ml', .25]] },
  { id: 'silk', name: 'Silk Shampoo', cat: 'Personal Care', sub: 'Haircare', lp: 48, cogs: .32, ap: .10, mat: 'Surfactants', matShare: .45, skus: [['Silk Shampoo 340ml', .5], ['Silk Conditioner 340ml', .3], ['Silk Hair Oil 200ml', .2]] },
];
const CATS = ['Food', 'Beverages', 'Personal Care'];
const B_SPLIT = { US: { bolt: .22, orchard: .14, oats: .22, crunch: .24, glow: .10, silk: .08 }, UK: { bolt: .24, orchard: .12, oats: .22, crunch: .16, glow: .12, silk: .14 }, IN: { bolt: .10, orchard: .12, oats: .12, crunch: .24, glow: .22, silk: .20 }, ID: { bolt: .14, orchard: .26, oats: .08, crunch: .20, glow: .16, silk: .16 } };
const AFFINITY = { bolt: { CONV: 1.6 }, crunch: { CONV: 1.3 }, oats: { CONV: .5 }, glow: { ECOM: 1.5, CONV: .4 }, silk: { CONV: .5 } };
const G_PLAN = { IN: .075, ID: .066, UK: .03, US: .034 };     // planned net sales growth vs LY
const G_BRAND = { bolt: .0, orchard: .0, oats: .01, crunch: .0, glow: .02, silk: -.005 };
const RETAILERS = [
  { id: 'bb', c: 'IN', name: 'CityMart', ch: 'MT', share: .45, otif: .92 }, { id: 'mm', c: 'IN', name: 'MegaStore', ch: 'LR', share: .70, otif: .92 }, { id: 'zk', c: 'IN', name: 'ShopNow', ch: 'ECOM', share: .55, otif: .95 },
  { id: 'pp', c: 'ID', name: 'FreshMart', ch: 'MT', share: .50, otif: .95 }, { id: 'hn', c: 'ID', name: 'HyperValue', ch: 'LR', share: .65, otif: .90 }, { id: 'tk', c: 'ID', name: 'BuyOnline', ch: 'ECOM', share: .50, otif: .95 },
  { id: 'hw', c: 'UK', name: 'GreenGrocer', ch: 'LR', share: .45, otif: .95 }, { id: 'pl', c: 'UK', name: 'ValuePlus', ch: 'MT', share: .35, otif: .93 }, { id: 'cc', c: 'UK', name: 'CornerShop', ch: 'CONV', share: .40, otif: .95 },
  { id: 'ng', c: 'US', name: 'BigBox', ch: 'LR', share: .40, otif: .97 }, { id: 'ff', c: 'US', name: 'FreshFields', ch: 'MT', share: .35, otif: .95 }, { id: 'wp', c: 'US', name: 'CarePharmacy', ch: 'MT', share: .15, otif: .95 },
];
const DISTRIBUTORS = { IN: ['North Distributors', 'West Distributors', 'South Distributors'], ID: ['Java Distributors', 'East Java Distributors', 'Bandung Distributors'] };
const COMPETITORS = { Coffee: ['Volt Coffee', 'Morning Roast'], Juice: ['FreshFarm Juice', 'SunSip'], 'Oats & cereal': ['Golden Grain', 'Harvest Bowl'], 'Chips & snacks': ['Krisp Co', 'Salt & Spud'], Skincare: ['Lumina Skin', 'PureDew'], Haircare: ['Shine Hair', 'Kera Care'] };
// LY share structure per country x sub-category: [ours, competitor 1, competitor 2, retailer own brand]
const SHARE_LY = {
  IN: { Coffee: [.12, .28, .15, .03], Juice: [.16, .22, .12, .04], 'Oats & cereal': [.14, .30, .10, .05], 'Chips & snacks': [.09, .18, .11, .04], Skincare: [.11, .17, .10, .02], Haircare: [.13, .24, .16, .03] },
  ID: { Coffee: [.13, .30, .14, .03], Juice: [.21, .19, .13, .05], 'Oats & cereal': [.12, .26, .09, .04], 'Chips & snacks': [.10, .20, .12, .05], Skincare: [.12, .19, .11, .02], Haircare: [.14, .22, .15, .04] },
  UK: { Coffee: [.19, .22, .12, .14], Juice: [.15, .20, .10, .22], 'Oats & cereal': [.24, .18, .09, .20], 'Chips & snacks': [.12, .26, .14, .17], Skincare: [.10, .15, .12, .08], Haircare: [.13, .20, .14, .15] },
  US: { Coffee: [.14, .25, .18, .10], Juice: [.11, .24, .15, .18], 'Oats & cereal': [.18, .27, .11, .15], 'Chips & snacks': [.08, .34, .12, .10], Skincare: [.07, .16, .12, .06], Haircare: [.09, .21, .15, .09] },
};
const MKT_GROWTH = {
  IN: { Coffee: .09, Juice: .08, 'Oats & cereal': .08, 'Chips & snacks': .10, Skincare: .12, Haircare: .08 },
  ID: { Coffee: .07, Juice: .08, 'Oats & cereal': .07, 'Chips & snacks': .09, Skincare: .10, Haircare: .07 },
  UK: { Coffee: .035, Juice: .02, 'Oats & cereal': .025, 'Chips & snacks': .03, Skincare: .04, Haircare: -.07 },
  US: { Coffee: .04, Juice: .025, 'Oats & cereal': .03, 'Chips & snacks': .035, Skincare: .045, Haircare: .03 },
};

/* ---------------- seasonality ---------------- */
function season(b, c, w) {
  const t = 2 * Math.PI; let s = 1;
  if (b === 'orchard') s = 1 + .18 * Math.sin(t * (w - 10) / 52);
  else if (b === 'bolt') s = 1 + .07 * Math.sin(t * (w - 12) / 52);
  else if (b === 'oats') s = 1 + .11 * Math.cos(t * (w - 2) / 52);
  else if (b === 'glow') s = 1 + .05 * Math.sin(t * (w - 14) / 52);
  if (c === 'IN' && w >= 43 && w <= 45 && (b === 'glow' || b === 'crunch')) s *= 1.25;   // Diwali (wk 44)
  if (c === 'ID' && w >= 8 && w <= 12 && b !== 'glow') s *= 1.14;                         // Ramadan
  if ((c === 'US' || c === 'UK') && w >= 49 && w <= 51 && (b === 'crunch' || b === 'oats')) s *= 1.12;
  if (c === 'US' && w === 6 && b === 'crunch') s *= 1.2;                                  // big-game week
  return s;
}

/* ---------------- stories (actual-period multipliers) ---------------- */
// ST1 Volt Coffee price cut UK convenience (wk34+); ST2 Crunch USA deep promotions (wk22+); ST3 oat inflation + delayed price increase
// ST4 Indonesia port disruption, Orchard Juice (wk35-44); ST5 UK haircare category decline; ST6 Glow India e-commerce breakout (wk18+)
// ST7 India general-trade channel loading (wk30+); ST12 EPS gap = sum of the above
function storyFx(b, c, ch, w) {
  const fx = { vol: 1, tr: 0, lp: 1, mat: 1, fill: null, ship: 1, rush: 1, ap: 1 };
  if (b === 'bolt' && c === 'UK' && w >= 34) fx.vol *= ch === 'CONV' ? .78 : .93;
  if (b === 'crunch' && c === 'US' && (ch === 'LR' || ch === 'MT') && w >= 22) { fx.tr += .09; fx.vol *= 1.16; }
  if (b === 'oats') {
    fx.mat = w < 14 ? 1.01 : w < 18 ? 1 + .18 * (w - 13) / 4 : 1.18;
    const delayed = (c === 'UK' && (ch === 'LR' || ch === 'MT')) || (c === 'US' && ch === 'LR');  // Hartwell, Penny Lane, BigBox
    if (delayed && w >= 14 && w < 28) fx.lp = 1.02 / 1.06;
  }
  // large retailers resisted the planned 3% list-price increase on other brands: only ~1.5% landed
  if (b !== 'oats' && ((c === 'US' && ch === 'LR') || (c === 'UK' && ch === 'LR'))) fx.lp *= .985;
  if (b === 'orchard' && c === 'ID' && ch !== 'ECOM' && w >= 35 && w <= 44) { fx.fill = .80; fx.rush = 1.45; }
  if (b === 'silk' && c === 'UK') fx.vol *= .93;
  if (b === 'glow' && c === 'IN' && w >= 18) { fx.vol *= ch === 'ECOM' ? 1.30 : 1.04; fx.ap = 1.18; }
  if (c === 'IN' && ch === 'GT' && w >= 30) fx.ship = 1.13;
  return fx;
}

/* ---------------- series generation ---------------- */
const LE = { week: 39, label: 'Sep latest estimate', recovery: .4 };
const FIELDS = ['vol', 'ord', 'cons', 'stock', 'gs', 'tr', 'ret', 'mat', 'pack', 'conv', 'inb', 'wh', 'fr', 'hd', 'rush', 'apTv', 'apDig', 'apOth', 'rsv', 'inc'];
const mk = () => Object.fromEntries(FIELDS.map(f => [f, new Float64Array(NW + 1)]));
const SERIES = [];
for (const c of COUNTRIES) for (const b of BRANDS) {
  const chs = Object.keys(CH_SPLIT[c.id]);
  const raw = chs.map(ch => CH_SPLIT[c.id][ch] * ((AFFINITY[b.id] || {})[ch] || 1));
  const tot = raw.reduce((a, x) => a + x, 0);
  chs.forEach((ch, i) => SERIES.push({ b: b.id, c: c.id, ch, cat: b.cat, sub: b.sub, annualT: c.ns * B_SPLIT[c.id][b.id] * raw[i] / tot }));
}
const BMAP = Object.fromEntries(BRANDS.map(b => [b.id, b])), CMAP = Object.fromEntries(COUNTRIES.map(c => [c.id, c])), CHMAP = Object.fromEntries(CHANNELS.map(c => [c.id, c]));
const ROMI = { bolt: 1.6, orchard: 1.3, oats: 1.4, crunch: 1.0, glow: 2.2, silk: 1.5 };     // incremental GM per $ A&P (model, as of Q2)
const romiOf = (b, c, ch) => b === 'glow' && c === 'IN' ? (ch === 'ECOM' ? 4.6 : 2.6) : b === 'bolt' && c === 'UK' ? 1.1 : ROMI[b];

for (const s of SERIES) {
  const B = BMAP[s.b], C = CMAP[s.c], CH = CHMAP[s.ch];
  const sea = []; let ss = 0; for (let w = 1; w <= NW; w++) { sea[w] = season(s.b, s.c, w); ss += sea[w]; }
  const lpBase = B.lp * C.px * CH.px * (1 + nz(.02));
  const trT = CH.tr * (1 + nz(.06)), retT = s.ch === 'GT' ? .02 : .008;
  const ppOats = s.b === 'oats';
  const gNS = G_PLAN[s.c] + G_BRAND[s.b] + nz(.01);
  const ucT0 = lpBase * B.cogs, ucL0 = ucT0 / (ppOats ? 1.05 : 1.025);
  const dcT = lpBase * .045 * CH.dc;
  const perf = nz(.018) - .0085;
  const A = mk(), T = mk(), L = mk();
  s.A = A; s.T = T; s.L = L; s.romi = romiOf(s.b, s.c, s.ch);
  const lpL = ppOats ? lpBase / 1.06 : lpBase / 1.03;
  const planLp = w => ppOats ? (w < 14 ? lpL * 1.02 : lpBase) : lpBase;
  const gmT = 1 - ucT0 / (lpBase * (1 - trT - retT));
  const put = (X, w, vol, lp, tr, ret, uc, matIdx, dc, rush, apTot, mediaDig) => {
    X.vol[w] = vol; X.gs[w] = vol * lp; X.tr[w] = vol * lp * tr; X.ret[w] = vol * lp * ret;
    const rest = 1 - B.matShare;   // non-material cost split: packaging 45%, conversion 40%, inbound freight 15%
    const m = uc * B.matShare * matIdx, p = uc * rest * .45, cv = uc * rest * .40, ib = uc * rest * .15;
    X.mat[w] = vol * m; X.pack[w] = vol * p; X.conv[w] = vol * cv; X.inb[w] = vol * ib;
    X.wh[w] = vol * dc * .37; X.fr[w] = vol * dc * .53 * rush; X.hd[w] = vol * dc * .10; X.rush[w] = vol * dc * .53 * (rush - 1);
    X.apDig[w] = apTot * mediaDig; X.apTv[w] = apTot * (1 - mediaDig) * .75; X.apOth[w] = apTot * (1 - mediaDig) * .25;
    X.rsv[w] = X.cons[w] * lp * 1.3;
  };
  const dig = s.b === 'glow' ? .6 : s.ch === 'ECOM' ? .7 : .4;
  for (let w = 1; w <= NW; w++) {
    const nsT = s.annualT * sea[w] / ss;
    const lpTw = planLp(w), npT = lpTw * (1 - trT - retT), volT = nsT / npT;
    const gv = (1 + gNS) / (lpTw / lpL) - 1;
    const volL = volT / (1 + gv) * (1 + nz(.04));
    // last year
    L.cons[w] = volL; L.ord[w] = volL; L.stock[w] = volL * CH.cover;
    put(L, w, volL, lpL, trT - .004, retT, ucL0, 1, dcT / 1.02, 1, volL * lpL * (1 - trT - retT) * B.ap * .97, dig - .05);
    L.inc[w] = (L.apTv[w] + L.apDig[w] + L.apOth[w]) * s.romi * .95;
    // target / plan
    T.cons[w] = volT; T.ord[w] = volT; T.stock[w] = volT * CH.cover;
    put(T, w, volT, lpTw, trT, retT, ucT0, 1, dcT, 1, nsT * B.ap, dig);
    T.inc[w] = (T.apTv[w] + T.apDig[w] + T.apOth[w]) * ROMI[s.b];
  }
  // actuals
  let stock = T.vol[1] * CH.cover;
  for (let w = 1; w <= CW; w++) {
    const fx = storyFx(s.b, s.c, s.ch, w);
    const demand = T.vol[w] * (1 + perf) * (1 + nz(.035)) * fx.vol;
    const fill = fx.fill ?? (.968 + nz(.012));
    const shipped = fx.fill ? demand * fill : demand * fx.ship * (1 + nz(.015));
    const cons = fx.fill ? shipped : demand;
    stock = Math.max(cons * .5, stock + shipped - cons);
    if (!fx.fill && fx.ship === 1) stock += (T.vol[w] * CH.cover - stock) * .3;            // normal channels revert to their usual cover
    A.ord[w] = fx.fill ? demand : shipped / fill; A.cons[w] = cons; A.stock[w] = stock;
    const lpA = planLp(w) * fx.lp * (1 + nz(.003)), trA = Math.max(.01, trT + nz(.004) + fx.tr);
    const convAbs = Math.pow(T.vol[w] / shipped, .25);
    const apA = T.apTv[w] + T.apDig[w] + T.apOth[w];
    put(A, w, shipped, lpA, trA, retT * (1 + nz(.1)), ucT0 * (1 + nz(.008)), fx.mat, dcT * (1 + nz(.03)), fx.rush, apA * fx.ap * (1 + nz(.08)), dig);
    A.conv[w] *= convAbs;
    A.inc[w] = (A.apTv[w] + A.apDig[w] + A.apOth[w]) * s.romi;
  }
  // forecast weeks 42-52
  let su = 0, st = 0, gs = 0, tr = 0, mt = 0; for (let w = 38; w <= 41; w++) { su += A.cons[w]; st += T.vol[w]; gs += A.gs[w]; tr += A.tr[w]; mt += A.mat[w]; }
  const att = su / st, lpF = gs / A.vol.slice(38, 42).reduce((a, x) => a + x, 0), trF = tr / gs;
  const matIdxF = s.b === 'oats' ? 1.18 : 1;
  for (let w = CW + 1; w <= NW; w++) {
    let f = .6 * att + .4; const fx = storyFx(s.b, s.c, s.ch, w);
    if (s.b === 'orchard' && s.c === 'ID' && s.ch !== 'ECOM') f = w >= 45 ? .97 : att;
    const cons = T.vol[w] * f;
    let shipped = cons, fill = .97;
    if (s.c === 'IN' && s.ch === 'GT') shipped = cons * .92;                                 // destocking after the channel loading
    if (fx.fill) { fill = .85; shipped = cons; }
    stock = Math.max(cons * .5, stock + shipped - cons);
    A.ord[w] = shipped / fill; A.cons[w] = cons; A.stock[w] = stock;
    put(A, w, shipped, s.b === 'oats' ? lpBase : lpF, trF, retT, ucT0, matIdxF, dcT, 1, T.apTv[w] + T.apDig[w] + T.apOth[w], dig);
    A.inc[w] = (A.apTv[w] + A.apDig[w] + A.apOth[w]) * s.romi;
  }
  for (const X of [A, T, L]) for (let w = 1; w <= NW; w++) X.rsv[w] = X.cons[w] * (X.gs[w] / X.vol[w]) * 1.3;
  // latest estimate (Sep LE, made at Wk 39): actuals to Wk 39, then a forecast that assumed 40% recovery towards plan
  const E = mk(); for (const k of FIELDS) for (let w = 1; w <= NW; w++) E[k][w] = w <= LE.week ? A[k][w] : A[k][w] + LE.recovery * (T[k][w] - A[k][w]);
  s.E = E;
}

/* ---------------- market (syndicated) data: country x sub-category ---------------- */
const SUBS = BRANDS.map(b => b.sub);
const MKT = {};
for (const c of COUNTRIES) for (const b of BRANDS) {
  const k = c.id + '|' + b.sub, sh = SHARE_LY[c.id][b.sub], mg = MKT_GROWTH[c.id][b.sub];
  const L = new Float64Array(NW + 1), A = new Float64Array(NW + 1), comp1 = new Float64Array(NW + 1);
  const ourL = new Float64Array(NW + 1);
  for (const s of SERIES) if (s.c === c.id && s.b === b.id) for (let w = 1; w <= NW; w++) ourL[w] += s.L.rsv[w];
  for (let w = 1; w <= NW; w++) {
    L[w] = ourL[w] / sh[0];
    A[w] = w <= MKT_LAST ? L[w] * (1 + mg) * (1 + nz(.008)) : NaN;
    comp1[w] = sh[1] + (c.id === 'UK' && b.id === 'bolt' && w >= 34 ? Math.min(.03, .0075 * (w - 33)) : 0);
  }
  MKT[k] = { L, A, shareLY: sh, comp1A: comp1, competitors: COMPETITORS[b.sub] };
}
const compPriceIdx = (c, sub, w) => c === 'UK' && sub === 'Coffee' && w >= 34 ? .88 : 1 + (c.length + w % 5) * .001;

/* ---------------- promotions, campaigns, supply, quality, finance ---------------- */
const PROMOS = [
  { id: 'p1', b: 'crunch', c: 'US', ka: 'ng', ch: 'LR', name: 'Buy 2 get 1 free', w0: 24, w1: 33, depth: .33, spend: 9.8e6, planLift: .30, lift: .46, incGM: 5.4e6, compliance: .96, volVsPlan: 1.12 },
  { id: 'p2', b: 'crunch', c: 'US', ka: 'ff', ch: 'MT', name: 'Endcap + 20% off', w0: 30, w1: 37, depth: .20, spend: 4.4e6, planLift: .25, lift: .38, incGM: 3.0e6, compliance: .91, volVsPlan: 1.09 },
  { id: 'p3', b: 'glow', c: 'IN', ka: 'zk', ch: 'ECOM', name: 'Mega sale-day bundle', w0: 27, w1: 28, depth: .18, spend: 1.9e6, planLift: .80, lift: 1.40, incGM: 5.1e6, compliance: 1.0, volVsPlan: 1.33 },
  { id: 'p4', b: 'bolt', c: 'UK', ka: 'cc', ch: 'CONV', name: 'Price-marked pack £1.19', w0: 36, w1: 41, depth: .12, spend: 2.2e6, planLift: .15, lift: .06, incGM: 1.1e6, compliance: .84, volVsPlan: .82 },
  { id: 'p5', b: 'oats', c: 'UK', ka: 'hw', ch: 'LR', name: 'Multibuy 2 for £5', w0: 10, w1: 15, depth: .17, spend: 2.8e6, planLift: .25, lift: .28, incGM: 3.4e6, compliance: .97, volVsPlan: 1.03 },
  { id: 'p6', b: 'silk', c: 'UK', ka: 'pl', ch: 'MT', name: 'Gift with purchase', w0: 18, w1: 22, depth: .10, spend: .9e6, planLift: .20, lift: .24, incGM: 1.3e6, compliance: .95, volVsPlan: 1.04 },
  { id: 'p7', b: 'orchard', c: 'IN', ka: null, ch: 'GT', name: 'Retailer display incentive', w0: 14, w1: 22, depth: .08, spend: .8e6, planLift: .15, lift: .19, incGM: 1.3e6, compliance: .88, volVsPlan: 1.05 },
  { id: 'p8', b: 'orchard', c: 'ID', ka: 'pp', ch: 'MT', name: '2 x 1L bundle', w0: 43, w1: 46, depth: .15, spend: 1.2e6, planLift: .22, lift: null, incGM: null, compliance: null, volVsPlan: null, upcoming: true, stockReady: .55 },
].map(p => ({ ...p, roi: p.incGM != null ? p.incGM / p.spend : null }));
const CAMPAIGNS = [
  { id: 'm1', b: 'glow', c: 'IN', name: 'Diwali Glow (digital)', w0: 38, w1: 45, media: 'Digital', spend: 3.1e6, planLift: .40, lift: .62 },
  { id: 'm2', b: 'bolt', c: 'UK', name: 'Bolt Up (TV)', w0: 30, w1: 41, media: 'TV', spend: 4.6e6, planLift: .08, lift: .03 },
  { id: 'm3', b: 'silk', c: 'UK', name: 'Stronger Hair (TV + digital)', w0: 34, w1: 41, media: 'Mixed', spend: 2.0e6, planLift: .05, lift: .06 },
  { id: 'm4', b: 'oats', c: 'US', name: 'Fuel Your Morning (digital)', w0: 36, w1: 44, media: 'Digital', spend: 2.4e6, planLift: .06, lift: .07 },
];
// supply chain: own inventory cover (days) by country x brand, and stock-out-risk list
const INV_TARGET_DAYS = 25;
function invDays(c, b, w) {
  let d = 24 + ((c.charCodeAt(0) + b.length) % 5) - 2;
  if (b === 'orchard' && c === 'ID' && w >= 35) d = Math.max(4, 24 - (w - 34) * 3.2);
  if (b === 'glow' && c === 'IN' && w >= 36) d = Math.max(9, 24 - (w - 35) * 2.4);
  if (c === 'IN' && w >= 30) d += .4 * (w - 29) * (b === 'crunch' || b === 'silk' ? 1 : .3);
  return d;
}
const NEAR_EXPIRY = { own: { IN: 1.2e6, ID: .6e6, UK: .9e6, US: 1.4e6 }, channel: { IN: 4.8e6, ID: 1.1e6, UK: 0, US: 0 } };
const QUALITY = { cpmu: 3.1, cpmuTarget: 3.5, cpmuLY: 3.4, holds: 0, recalls: 0, openCases: 0 };
const COMMODITIES = [
  { id: 'oats', name: 'Oats', vsBudget: .18, hedge: .40 }, { id: 'coffee', name: 'Coffee beans', vsBudget: .04, hedge: .70 },
  { id: 'fruit', name: 'Fruit concentrate', vsBudget: .06, hedge: .55 }, { id: 'potato', name: 'Potatoes & oil', vsBudget: .02, hedge: .60 },
  { id: 'actives', name: 'Actives & oils', vsBudget: -.01, hedge: .50 }, { id: 'surf', name: 'Surfactants', vsBudget: .01, hedge: .50 },
  { id: 'pack', name: 'Packaging (resin, board)', vsBudget: .03, hedge: .35 },
];
const PROCUREMENT = { savingsTargetFY: 48e6, savingsYTD: 29e6, savingsPlanYTD: 37e6, supplierOtif: .93 };
const FORECAST_ACC = { IN: .84, ID: .71, UK: .88, US: .87, target: .85 };
const FIN = { overheadRate: .196, overheadActualMult: 1.012, interestFY: 60e6, taxRate: .25, shares: 105.4e6,
  guidance: { organic: [.04, .06], eps: [3.10, 3.20] }, consensus: { organic: .048, eps: 3.18, ns: 3.24e9 },
  dividendYield: .024, peerPE: 19.5 };
const SHARE_PRICE = (() => { const us = [], peer = []; let p = 52, q = 100; for (let w = 1; w <= CW; w++) { p *= 1 + nz(.012) + (w >= 30 && w <= 33 ? -.012 : w >= 34 ? -.003 : .0006); q *= 1 + nz(.008) + .0005; us[w] = p; peer[w] = q; } return { us, peer, start: 52 }; })();

/* ---------------- external signals (qualitative; attached to the metrics they may explain) ---------------- */
const SIGNALS = [
  { w: 34, c: 'UK', b: 'bolt', ch: 'CONV', type: 'Competitor', text: 'Volt Coffee cut its shelf prices by 12% in UK convenience and added distribution.' },
  { w: 35, c: 'ID', b: 'orchard', type: 'Supply', text: 'Port congestion at Tanjung Priok delayed juice concentrate shipments, and warehouse stock fell below 7 days.' },
  { w: 14, c: '*', b: 'oats', type: 'Input cost', text: 'Oat prices have been 18% over budget since week 14, and only 40% is locked in.' },
  { w: 28, c: 'UK', b: 'oats', type: 'Pricing', text: 'GreenGrocer and ValuePlus (UK) and BigBox (USA) only accepted the Sunrise Oats price increase from week 28.' },
  { w: 30, c: 'UK', b: 'silk', type: 'Category', text: 'The UK haircare category is down 7% as shoppers trade down to retailer own brands.' },
  { w: 18, c: 'IN', b: 'glow', ch: 'ECOM', type: 'Category', text: 'Skincare e-commerce in India is growing fast, and ShopNow sale days are bringing record traffic.' },
  { w: 44, c: 'IN', type: 'Seasonality', text: 'Diwali falls in week 44. We expect a gifting peak for skincare and snacks, about 25% above normal, and the forecast includes it.' },
  { w: 30, c: 'IN', ch: 'GT', type: 'Distribution', text: 'A quarter-end incentive for distributors in India general trade pushed extra stock into the channel.' },
  { w: 24, c: 'US', b: 'crunch', type: 'Promotion', text: 'Buy-2-get-1 and endcap promotions at BigBox and FreshFields lifted trade spend to about 21% of gross sales.' },
];

/* ---------------- additions for the role home pages ---------------- */
// Sales heads (regional sales managers), each owning a share of their country's sales
const SALES_HEADS = [
  { id: 'in-n', c: 'IN', region: 'North & East India', name: 'Raj Patel', w: .38, perf: -.035 }, { id: 'in-w', c: 'IN', region: 'West India', name: 'Neha Singh', w: .34, perf: .02 }, { id: 'in-s', c: 'IN', region: 'South India', name: 'Arun Kumar', w: .28, perf: .01 },
  { id: 'id-j', c: 'ID', region: 'Jakarta & West Java', name: 'Budi Santoso', w: .58, perf: -.06 }, { id: 'id-e', c: 'ID', region: 'East Java', name: 'Siti Rahma', w: .42, perf: -.03 },
  { id: 'uk-s', c: 'UK', region: 'London & South', name: 'Bob Smith', w: .55, perf: -.02 }, { id: 'uk-n', c: 'UK', region: 'Midlands & North', name: 'James Hall', w: .45, perf: .015 },
  { id: 'us-e', c: 'US', region: 'East', name: 'Rachel Green', w: .40, perf: .005 }, { id: 'us-c', c: 'US', region: 'Central', name: 'Mike Davis', w: .32, perf: -.015 }, { id: 'us-w', c: 'US', region: 'South & West', name: 'Ana Lopez', w: .28, perf: .02 },
];
// Distribution and outlet reach by sales head (synthetic)
const REACH = {
  'in-n': { wd: .61, wdLY: .63, outlets: 182000, target: 195000 }, 'in-w': { wd: .68, wdLY: .66, outlets: 156000, target: 152000 }, 'in-s': { wd: .64, wdLY: .63, outlets: 131000, target: 133000 },
  'id-j': { wd: .58, wdLY: .62, outlets: 94000, target: 101000 }, 'id-e': { wd: .55, wdLY: .56, outlets: 71000, target: 74000 },
  'uk-s': { wd: .86, wdLY: .87, outlets: 21500, target: 22000 }, 'uk-n': { wd: .84, wdLY: .83, outlets: 17800, target: 17500 },
  'us-e': { wd: .79, wdLY: .78, outlets: 31200, target: 31000 }, 'us-c': { wd: .76, wdLY: .77, outlets: 24900, target: 25600 }, 'us-w': { wd: .74, wdLY: .72, outlets: 22100, target: 21500 },
};
const LISTINGS = [
  { c: 'UK', ka: 'pl', b: 'oats', sku: 'Sunrise Instant Oats 10x40g', type: 'Delisted', w: 33 },
  { c: 'US', ka: 'ff', b: 'glow', sku: 'Glow Vitamin C Serum 30ml', type: 'Listed', w: 30 },
  { c: 'IN', ka: 'zk', b: 'glow', sku: 'Glow Sunscreen SPF50 50ml', type: 'Listed', w: 26 },
  { c: 'ID', ka: 'pp', b: 'orchard', sku: 'Orchard Kids Juice Box 6x200ml', type: 'Delisted (out of stock)', w: 39 },
];
// Warehouses (distribution centres)
const WAREHOUSES = [{ id: 'bhw', c: 'IN', name: 'Bhiwandi DC' }, { id: 'del', c: 'IN', name: 'Delhi DC' }, { id: 'jkt', c: 'ID', name: 'Jakarta DC' }, { id: 'mid', c: 'UK', name: 'Midlands DC' }, { id: 'dal', c: 'US', name: 'Dallas DC' }, { id: 'chi', c: 'US', name: 'Chicago DC' }];
// Long-range plan (3-year): net sales index by year, plan and industry growth
const LRP = { years: [2024, 2025, 2026, 2027], planCagr: .06, industryCagr: { Food: .052, Beverages: .061, 'Personal Care': .071 }, planCagrCat: { Food: .05, Beverages: .055, 'Personal Care': .08 }, g2025: { Food: .045, Beverages: .05, 'Personal Care': .07 } };
// People (fictional) who own actions
const PEOPLE = {
  CEO: 'Sarah Miller, CEO', CFO: 'David Chen, CFO', RGM: 'Alice Brown, Head of Revenue Growth', CMO: 'Emma Wilson, CMO', CSO: 'Mike Johnson, Chief Sales Officer', COO: 'Tom Baker, COO', PROC: 'Grace Lee, Head of Procurement', QA: 'Omar Khan, Head of Quality',
  UK_SALES: 'Bob Smith, UK Sales Director', US_SALES: 'Rachel Green, US Sales Director', IN_SALES: 'Raj Patel, India Sales Director', ID_SALES: 'Budi Santoso, Indonesia Sales Director',
  UK_GM: 'Peter Walsh, UK General Manager', IN_GM: 'Ravi Kumar, India General Manager', ID_SUPPLY: 'Lisa Tan, Indonesia Supply Lead', BRAND_BOLT: 'Chloe Adams, Bolt Brew Brand Director', BRAND_GLOW: 'Priya Shah, Glow Skincare Brand Director',
};
const MEDIA_ROMI = { TV: .75, Digital: 1.35, Other: .9 };   // multipliers on brand ROMI by media
const COMPLAINTS = (() => { const a = []; for (let w = 1; w <= CW; w++) a[w] = 3.2 + Math.sin(w / 4) * .25 + nz(.15); return a; })();

// Household penetration (% of households buying in the last 52 weeks, consumer panel) and buyer switching
const PENETRATION = {
  'bolt|UK': [18.2, 16.9], 'bolt|US': [11.4, 11.6], 'bolt|IN': [6.1, 6.4], 'bolt|ID': [7.8, 8.0],
  'orchard|UK': [14.0, 14.1], 'orchard|US': [9.6, 9.5], 'orchard|IN': [12.2, 12.6], 'orchard|ID': [24.5, 23.1],
  'oats|UK': [27.3, 26.8], 'oats|US': [19.8, 19.6], 'oats|IN': [8.4, 8.9], 'oats|ID': [5.2, 5.4],
  'crunch|UK': [22.1, 22.4], 'crunch|US': [31.0, 31.5], 'crunch|IN': [17.5, 18.4], 'crunch|ID': [15.2, 15.9],
  'glow|UK': [9.8, 10.1], 'glow|US': [6.2, 6.4], 'glow|IN': [7.4, 9.1], 'glow|ID': [8.1, 8.7],
  'silk|UK': [21.0, 21.4], 'silk|US': [8.9, 8.8], 'silk|IN': [19.6, 20.1], 'silk|ID': [16.8, 17.0],
};
const SWITCHING = [{ from: 'Bolt Brew Coffee', to: 'Volt Coffee', where: 'UK', buyers: 0.9, note: 'Mostly convenience shoppers since the price cut in week 34' }, { from: 'Orchard Juice', to: 'FreshFarm Juice', where: 'Indonesia', buyers: 0.6, note: 'Out-of-stocks at FreshMart and HyperValue' }, { from: 'Sunrise Oats', to: 'Retailer own brand', where: 'UK', buyers: 0.4, note: 'After the oats price increase landed' }];
// Cash: share of net sales unless noted; working-capital extras in USD
const CASH = { da: .0275, capexA: .032, capexT: .035, taxRate: .23, wcT: .006, india_receivables: 20e6, inventory_build: 15e6, conversionTarget: .9 };
// EPS latest-estimate history (how the full-year forecast moved), and safety
const LE_HISTORY = [['Jan', 3.15], ['Feb', 3.15], ['Mar', 3.16], ['Apr', 3.14], ['May', 3.12], ['Jun', 3.12], ['Jul', 3.10], ['Aug', 3.08], ['Sep', 3.06], ['Oct', 3.05]];
const SAFETY = { ltifr: .42, target: .5, ly: .55,
  history: [.58, .55, .52, .51, .49, .47, .46, .45, .44, .43, .42, .42],   // rolling 12-month injury rate, Nov to Oct
  incidents: [{ site: 'Cikarang plant', type: 'Hand injury (lost time)', w: 37, status: 'Cause found, guard fitted' }, { site: 'Bhiwandi DC', type: 'Forklift near miss', w: 39, status: 'Retraining under way' }, { site: 'Ohio plant', type: 'Slip (no lost time)', w: 40, status: 'Closed' }] };

// ---------------- marketing: brand health, share of voice, buying frequency, launches ----------------
// brand tracker (monthly, n≈1,000 per market): [last year, now] in % of category buyers; a move of 2+ pts is statistically significant
const BRAND_HEALTH = (() => { const o = {}, base = { bolt: [62, 38, 21], orchard: [70, 41, 24], oats: [74, 45, 27], crunch: [81, 52, 30], glow: [48, 30, 17], silk: [66, 37, 20] };
  const story = { 'bolt|UK': [-1, -4.2, -3.1], 'glow|IN': [5.8, 4.4, 3.0], 'orchard|ID': [0, -2.3, -1.4], 'silk|UK': [1.2, 2.1, 1.0], 'oats|UK': [0, -0.8, -2.2] };
  for (const c of ['IN', 'ID', 'UK', 'US']) for (const b of Object.keys(base)) { const k = b + '|' + c, d = story[k] || [((b.length + c.charCodeAt(0)) % 5 - 2) * .3, ((b.length * 3 + c.charCodeAt(1)) % 5 - 2) * .4, ((b.length + c.charCodeAt(1)) % 3 - 1) * .5], adj = c === 'IN' || c === 'ID' ? -6 : 0;
    o[k] = base[b].map((v, i) => [v + adj, +(v + adj + d[i]).toFixed(1)]); }
  return o; })();
// share of voice (our media weight ÷ category media weight) vs share of market, last 13 weeks
const SOV = { 'bolt|UK': [12.4, 16.6], 'glow|IN': [21.0, 13.2], 'orchard|ID': [17.5, 21.0], 'oats|UK': [15.1, 18.9], 'crunch|US': [24.0, 19.5], 'silk|UK': [16.8, 15.1], 'oats|US': [14.0, 15.2], 'glow|US': [7.5, 6.8] };
// purchase frequency (trips per buyer per year) [last year, now] and repeat rate (% of buyers who bought again within 12 weeks)
const FREQUENCY = { 'bolt|UK': [6.1, 6.0, .41], 'oats|UK': [8.4, 7.8, .52], 'orchard|ID': [9.2, 8.6, .44], 'glow|IN': [3.1, 3.4, .39], 'crunch|US': [11.8, 12.3, .55], 'silk|UK': [5.2, 5.3, .47], 'crunch|IN': [9.5, 9.8, .50], 'oats|US': [7.9, 8.0, .51] };
const LAUNCHES = [
  { id: 'l1', name: 'Glow Sunscreen SPF50 50ml', b: 'glow', c: 'IN', w: 26, dist: .52, distPlan: .45, trial: 2.4, trialPlan: 1.8, repeat: .36, repeatPlan: .30, sales: 6.1e6, salesPlan: 4.9e6 },
  { id: 'l2', name: 'Glow Vitamin C Serum 30ml', b: 'glow', c: 'US', w: 30, dist: .34, distPlan: .40, trial: 1.1, trialPlan: 1.0, repeat: .31, repeatPlan: .28, sales: 4.2e6, salesPlan: 3.8e6 },
  { id: 'l3', name: 'Crunch Chilli Lime 150g', b: 'crunch', c: 'US', w: 12, dist: .72, distPlan: .70, trial: 3.9, trialPlan: 3.5, repeat: .27, repeatPlan: .26, sales: 9.8e6, salesPlan: 9.0e6 },
  { id: 'l4', name: 'Bolt Brew Cold Coffee 4-pack', b: 'bolt', c: 'UK', w: 18, dist: .61, distPlan: .70, trial: 1.8, trialPlan: 2.4, repeat: .19, repeatPlan: .25, sales: 2.1e6, salesPlan: 3.4e6 },
  { id: 'l5', name: 'Sunrise Honey Granola 400g', b: 'oats', c: 'IN', w: 22, dist: .28, distPlan: .35, trial: .9, trialPlan: 1.2, repeat: .22, repeatPlan: .24, sales: 1.4e6, salesPlan: 2.0e6 },
];
const INNOVATION = { share: .118, target: .15, ly: .126 };   // % of net sales from products launched in the last 3 years

// ---------------- operations: plants, savings programme, suppliers, forecast bias, forward stock projection ----------------
const PLANTS = [
  { id: 'pune', name: 'Pune plant', c: 'IN', makes: 'Snacks, haircare', oee: .71, oeeT: .75, util: .86, util13: .94, convVsPlan: .021 },
  { id: 'cik', name: 'Cikarang plant', c: 'ID', makes: 'Juice, coffee', oee: .64, oeeT: .72, util: .78, util13: .83, convVsPlan: .058 },
  { id: 'leeds', name: 'Leeds plant', c: 'UK', makes: 'Oats, coffee', oee: .78, oeeT: .76, util: .74, util13: .79, convVsPlan: -.005 },
  { id: 'ohio', name: 'Ohio plant', c: 'US', makes: 'Oats, snacks', oee: .74, oeeT: .75, util: .88, util13: .97, convVsPlan: .008 },
];
const SAVINGS = [   // productivity programme, $; FY target / plan to date / delivered to date
  { lever: 'Procurement (materials)', fy: 18e6, plan: 14e6, done: 10.5e6, note: 'Oat contracts could not be reset because the market price is 18% up' },
  { lever: 'Manufacturing efficiency', fy: 12e6, plan: 9.5e6, done: 8.9e6, note: 'Cikarang line downtime' },
  { lever: 'Logistics & freight', fy: 9e6, plan: 7e6, done: 6.4e6, note: 'Air freight for Indonesia juice' },
  { lever: 'Packaging redesign', fy: 6e6, plan: 4.5e6, done: 3.2e6, note: 'Lighter juice bottle slipped to Q1' },
  { lever: 'Warehouse network', fy: 3e6, plan: 2e6, done: 0, note: 'The new Midlands distribution centre goes live in November' },
];
const SUPPLIERS = [
  { name: 'Prairie Oats Co', input: 'Oats', otif: .89, risk: 'High', note: 'Our only source for the UK and USA, and its price is 18% over budget' },
  { name: 'Java Fruit Processing', input: 'Fruit concentrate', otif: .81, risk: 'High', note: 'Port delays at Jakarta, recovery expected in week 44' },
  { name: 'Highland Coffee Traders', input: 'Coffee beans', otif: .94, risk: 'Medium', note: 'Prices move a lot, 70% locked in' },
  { name: 'PackRight Films', input: 'Packaging film', otif: .95, risk: 'Low', note: '' },
  { name: 'SurfaChem', input: 'Surfactants', otif: .97, risk: 'Low', note: '' },
];
const FORECAST_BIAS = { IN: .06, ID: .12, UK: .03, US: -.01 };   // + = forecast above actual demand; lag 1 month, SKU × country
// projected days of cover for the next 13 weeks (supply planner), including recovery plans already confirmed
function invProj(c, b, w) {
  if (w <= CW) return invDays(c, b, w);
  if (b === 'orchard' && c === 'ID') return w < 44 ? 4 : Math.min(24, 4 + (w - 43) * 5);
  if (b === 'glow' && c === 'IN') return w <= 43 ? 9 - (w - 41) : Math.min(22, 7 + (w - 43) * 4);
  if (b === 'oats' && c === 'US') return w >= 45 && w <= 49 ? 22 - (w - 44) * 3.2 + (w >= 48 ? (w - 47) * 2 : 0) : invDays(c, b, CW);
  if (b === 'crunch' && c === 'IN') return Math.max(14, invDays(c, b, CW) - (w - CW) * .9);
  return invDays(c, b, CW) + Math.sin(w) * .8;
}

/* ---------------- aggregation API ---------------- */
const S = (f) => ({ ...f });
function match(s, f) { return (!f.c || f.c.includes(s.c)) && (!f.b || f.b.includes(s.b)) && (!f.ch || f.ch.includes(s.ch)) && (!f.cat || f.cat.includes(s.cat)); }
const AGG_CACHE = new Map();
function agg(f, sc, w0, w1) {
  const key = [f.c, f.b, f.ch, f.cat].map(x => x ? x.join(',') : '').join('|') + '|' + sc + '|' + w0 + '|' + w1, hit = AGG_CACHE.get(key);
  if (hit) return { ...hit };
  const o = aggRaw(f, sc, w0, w1); AGG_CACHE.set(key, o); return { ...o };
}
function aggRaw(f, sc, w0, w1) {
  const o = Object.fromEntries(FIELDS.map(k => [k, 0]));
  for (const s of SERIES) { if (!match(s, f)) continue; const X = s[sc]; for (let w = w0; w <= w1; w++) for (const k of FIELDS) o[k] += k === 'stock' ? (w === w1 ? X[k][w] : 0) : X[k][w]; }
  o.ns = o.gs - o.tr - o.ret; o.cogs = o.mat + o.pack + o.conv + o.inb; o.gm = o.ns - o.cogs;
  o.dist = o.wh + o.fr + o.hd; o.ap = o.apTv + o.apDig + o.apOth; o.cm = o.gm - o.dist - o.ap;
  o.fill = o.ord ? o.vol / o.ord : 1; o.lost = o.ord > o.vol ? (o.ord - o.vol) * (o.ns / o.vol) : 0;
  return o;
}
function market(f, sc, w0, w1) {
  const cs = f.c || COUNTRIES.map(c => c.id), subs = f.b ? [...new Set(f.b.map(b => BMAP[b].sub))] : SUBS;
  let m = 0; for (const c of cs) for (const sub of subs) for (let w = w0; w <= w1; w++) m += MKT[c + '|' + sub][sc][w]; return m;
}
function share(f, w0, w1) {
  const fNoCh = { c: f.c, b: f.b, cat: f.cat };
  const a = agg(fNoCh, 'A', w0, w1).rsv, l = agg(fNoCh, 'L', w0, w1).rsv, mA = market(fNoCh, 'A', w0, w1), mL = market(fNoCh, 'L', w0, w1);
  return { now: a / mA, ly: l / mL, chg: a / mA - l / mL, ourGrowth: a / l - 1, mktGrowth: mA / mL - 1 };
}
function finance(f, sc, w0, w1) {   // company-level P&L lines below contribution margin
  const a = agg(f, sc, w0, w1), weeks = w1 - w0 + 1;
  const tFY = agg({}, 'T', 1, NW);
  const overhead = tFY.ns * FIN.overheadRate * weeks / NW * (sc === 'A' || sc === 'E' ? FIN.overheadActualMult : sc === 'L' ? .97 : 1);
  const op = a.cm - overhead, interest = FIN.interestFY * weeks / NW, np = (op - interest) * (1 - FIN.taxRate);
  return { ...a, overhead, op, interest, np, eps: np / FIN.shares };
}

// calibrate share count so planned EPS = guidance midpoint, and overhead savings so the latest estimate lands at $3.05
{ const cmT = agg({}, 'T', 1, NW), cmA = agg({}, 'A', 1, NW), oh = cmT.ns * FIN.overheadRate;
  FIN.shares = (cmT.cm - oh - FIN.interestFY) * (1 - FIN.taxRate) / 3.15;
  FIN.overheadActualMult = (cmA.cm - FIN.interestFY - 3.05 * FIN.shares / (1 - FIN.taxRate)) / oh; }

root.KD = { NW, CW, MKT_LAST, weekEnd, REGIONS, COUNTRIES, CHANNELS, BRANDS, CATS, RETAILERS, DISTRIBUTORS, COMPETITORS, SERIES, MKT, BMAP, CMAP, CHMAP,
  PROMOS, CAMPAIGNS, SIGNALS, FIELDS, SALES_HEADS, REACH, LISTINGS, WAREHOUSES, LRP, PEOPLE, MEDIA_ROMI, COMPLAINTS, PENETRATION, SWITCHING, CASH, LE_HISTORY, SAFETY, INV_TARGET_DAYS, invDays, NEAR_EXPIRY, QUALITY, COMMODITIES, PROCUREMENT, FORECAST_ACC, FIN, SHARE_PRICE, compPriceIdx, LE, BRAND_HEALTH, SOV, FREQUENCY, LAUNCHES, INNOVATION, PLANTS, SAVINGS, SUPPLIERS, FORECAST_BIAS, invProj,
  agg, market, share, finance, match };
})(typeof window !== 'undefined' ? window : globalThis);
