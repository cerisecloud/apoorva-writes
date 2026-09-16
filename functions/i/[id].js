/** Serves a stored pizza image. Referenced by the og:image on /s/<id>. */
export async function onRequestGet({ params, env }) {
  if (!env.PIZZAS) return new Response('no store', { status: 503 });
  const buf = await env.PIZZAS.get('img:' + params.id, 'arrayBuffer');
  if (!buf) return new Response('not found', { status: 404 });
  return new Response(buf, {
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
