/**
 * Stores one baked pizza so a shared link can carry it as its preview image.
 *
 * Crawlers fetch the shared URL and read og:image out of the HTML. They never
 * run the game, so a static tag can only ever show one generic picture. To put
 * the player's own pizza in the post, the image has to live at a real URL and
 * the link has to be a page whose tags already point at it. That is all this is.
 *
 * Binding required: a KV namespace bound as PIZZAS.
 * Without it this returns 503 and the game falls back to the plain game link.
 */
const MAX_BYTES = 900 * 1024;
const TTL       = 60 * 60 * 24 * 120;   // 120 days
const RATE_MAX  = 20;                    // uploads per IP
const RATE_WIN  = 600;                   // seconds

const json = (b, status = 200) => new Response(JSON.stringify(b), {
  status, headers: {'content-type': 'application/json', 'cache-control': 'no-store'},
});

export async function onRequestPost({ request, env }) {
  if (!env.PIZZAS) return json({ error: 'no store' }, 503);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rk = 'rl:' + ip;
  const hits = parseInt((await env.PIZZAS.get(rk)) || '0', 10);
  if (hits >= RATE_MAX) return json({ error: 'slow down' }, 429);

  const buf = await request.arrayBuffer();
  if (!buf.byteLength)          return json({ error: 'empty' }, 400);
  if (buf.byteLength > MAX_BYTES) return json({ error: 'too big' }, 413);

  // Only accept an actual JPEG. Without this the endpoint stores whatever is
  // posted and serves it back with an image content-type.
  const head = new Uint8Array(buf.slice(0, 3));
  if (!(head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF))
    return json({ error: 'not a jpeg' }, 415);

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  await env.PIZZAS.put('img:' + id, buf, { expirationTtl: TTL });
  await env.PIZZAS.put(rk, String(hits + 1), { expirationTtl: RATE_WIN });

  return json({ id, url: new URL('/s/' + id, request.url).toString() });
}
