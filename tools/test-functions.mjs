/* Runs the Cloudflare Pages Functions for real, with a fake KV.
   node tools/test-functions.mjs   */
import { readFileSync } from 'node:fs';
import * as upload from '../functions/api/pizza.js';
import * as img    from '../functions/i/[id].js';
import * as page   from '../functions/s/[id].js';

const jpeg = readFileSync(new URL('../public/og-cover.jpg', import.meta.url));
let pass = 0, fail = 0;
const ok = (name, cond, extra='') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};

/* minimal KV double: what Cloudflare gives the Function */
function makeKV(){
  const m = new Map();
  return {
    _m: m,
    async get(k, type){
      if (!m.has(k)) return null;
      const v = m.get(k);
      if (type === 'arrayBuffer') return v instanceof ArrayBuffer ? v : new TextEncoder().encode(v).buffer;
      if (type === 'stream') return new Blob([v]).stream();
      return typeof v === 'string' ? v : new TextDecoder().decode(v);
    },
    async put(k, v){ m.set(k, v); },
  };
}
const req = (url, init) => new Request(url, init);
const post = (env, body, type='image/jpeg') =>
  upload.onRequestPost({ request: req('https://site.test/api/pizza',
    { method:'POST', headers:{'content-type':type,'cf-connecting-ip':'1.2.3.4'}, body }), env });

console.log('\nupload');
{
  const env = { PIZZAS: makeKV() };
  const r = await post(env, jpeg);
  const j = await r.json();
  ok('200 with an id', r.status === 200 && !!j.id, 'status=' + r.status);
  ok('returns a /s/ share url', /https:\/\/site\.test\/s\/[a-z0-9]+$/.test(j.url || ''), j.url);
  ok('stored under img:<id>', env.PIZZAS._m.has('img:' + j.id));

  console.log('\nimage route');
  const ir = await img.onRequestGet({ params:{ id:j.id }, env });
  const bytes = new Uint8Array(await ir.arrayBuffer());
  ok('200', ir.status === 200, 'status=' + ir.status);
  ok('content-type image/jpeg', ir.headers.get('content-type') === 'image/jpeg');
  ok('bytes round-trip intact', bytes.length === jpeg.length && bytes[0] === 0xFF && bytes[1] === 0xD8);
  const miss = await img.onRequestGet({ params:{ id:'nope' }, env });
  ok('unknown id 404s', miss.status === 404, 'status=' + miss.status);

  console.log('\nshare page');
  const pr = await page.onRequestGet({ params:{ id:j.id }, env, request: req('https://site.test/s/' + j.id) });
  const html = await pr.text();
  ok('200 html', pr.status === 200 && (pr.headers.get('content-type')||'').includes('text/html'));
  ok('og:image points at the stored pizza',
      html.includes('property="og:image" content="https://site.test/i/' + j.id + '"'));
  ok('twitter card is large image', html.includes('name="twitter:card" content="summary_large_image"'));
  ok('links back to the game', html.includes('https://site.test/pizza.html'));

  const pr2 = await page.onRequestGet({ params:{ id:'doesnotexist' }, env, request: req('https://site.test/s/doesnotexist') });
  const html2 = await pr2.text();
  ok('unknown id falls back to og-cover', html2.includes('/og-cover.jpg'));
}

console.log('\nrejections');
{
  ok('no KV binding -> 503', (await post({}, jpeg)).status === 503);
  const env = { PIZZAS: makeKV() };
  ok('empty body -> 400', (await post(env, new Uint8Array(0))).status === 400);
  ok('not a jpeg -> 415', (await post(env, new Uint8Array([0x89,0x50,0x4E,0x47]))).status === 415);
  ok('oversize -> 413', (await post(env, new Uint8Array(1_000_000))).status === 413);
}

console.log('\nrate limit');
{
  const env = { PIZZAS: makeKV() };
  let last;
  for (let i = 0; i < 22; i++) last = await post(env, jpeg);
  ok('21st+ upload from one IP -> 429', last.status === 429, 'status=' + last.status);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
