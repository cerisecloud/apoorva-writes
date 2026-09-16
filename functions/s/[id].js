/**
 * The page a shared link points at. Carries this pizza as its og:image, then
 * sends a human on to the game.
 *
 * It renders real HTML rather than redirecting: a redirect would bounce the
 * crawler to the game page and it would read the generic cover instead.
 */
const esc = s => String(s).replace(/[&<>"]/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

export async function onRequestGet({ params, env, request }) {
  const id = String(params.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 32);
  if (!id) return Response.redirect(new URL('/pizza', request.url), 302);

  const origin = new URL(request.url).origin;
  const img    = origin + '/i/' + id;
  const game   = origin + '/pizza';
  const exists = env.PIZZAS ? await env.PIZZAS.get('img:' + id, 'stream') : null;
  const cover  = exists ? img : origin + '/og-cover.jpg';

  const title = "Someone built this at Marco's Trattoria";
  const desc  = 'Wood fired, out in four seconds flat. Think you can do better?';

  return new Response(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:type" content="article">
<meta property="og:site_name" content="Marco's Trattoria">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(origin + '/s/' + id)}">
<meta property="og:image" content="${esc(cover)}">
<meta property="og:image:width" content="1080">
<meta property="og:image:height" content="1080">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(cover)}">
<style>
  html,body{margin:0;height:100%;background:#1B1008;color:#F3EADB;
    font-family:ui-monospace,Menlo,monospace;display:flex;align-items:center;
    justify-content:center}
  .w{text-align:center;padding:24px;max-width:560px}
  img{width:100%;max-width:420px;border:3px solid #6A4A2E;display:block;margin:0 auto 20px}
  h1{font-size:17px;font-weight:400;color:#FFC63C;margin:0 0 8px}
  p{font-size:13px;line-height:1.7;color:#C8A07A;margin:0 0 20px}
  a{display:inline-block;background:#C8551A;color:#fff;text-decoration:none;
    padding:14px 26px;border:2px solid #14100C;font-size:13px}
</style></head>
<body><div class="w">
  <img src="${esc(cover)}" alt="A pizza built at Marco's Trattoria">
  <h1>${esc(title)}</h1>
  <p>${esc(desc)}</p>
  <a href="${esc(game)}">BUILD YOUR OWN &rarr;</a>
</div></body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8',
               'cache-control': 'public, max-age=300' },
  });
}
