// Cloudflare Pages Function: /api/* on the site → the piecebook-vision Worker
// over a service binding named VISION (root wrangler.toml, or Pages → Settings
// → Bindings). Same origin for the browser, so the Cloudflare Access cookie is
// sent and the Worker receives the Cf-Access-Jwt-Assertion header to verify.
export async function onRequest({ request, env, params }) {
  if (!env.VISION) {
    return new Response(JSON.stringify({ error: "api_not_bound", detail: "Pages service binding VISION is missing" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  const url = new URL(request.url);
  const segments = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const target = new URL(`/${segments.map(encodeURIComponent).join("/")}${url.search}`, "https://piecebook-vision.internal");
  const forwarded = new Request(target.toString(), request);
  return env.VISION.fetch(forwarded);
}
