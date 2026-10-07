// mkan on Cloudflare Containers — a thin Worker in front of one always-on
// container running the Next standalone server. Mirrors the hogwarts lane
// (see hogwarts/DEPLOYMENT.md); every request is forwarded as-is so the app
// sees the real Host header, which src/proxy.ts and cookie scoping depend on.
//
// Static assets are served from Cloudflare's edge cache (the hogwarts logic,
// hogwarts/cf/worker.js). A container fetch is not a CDN fetch: nothing about
// it went through the cache, so every hashed chunk and every optimised image —
// 300+ /_next/image URLs on the home page alone — round-tripped to the one
// container, a long way from Port Sudan. The paths below are content-addressed
// or explicitly frozen by next.config headers; the Worker stores them under
// the apex host so apex, www and every subdomain share one copy, and only when
// the origin itself says `public` with a real max-age (so public/ files served
// `max-age=0`, 404s and anything carrying a session are never frozen). HTML,
// RSC, /api and auth never take the cache path at all.
import { Container, getContainer } from "@cloudflare/containers"
import crons from "./crons.json"

export class MkanContainer extends Container {
  defaultPort = 3000
  sleepAfter = "24h"

  constructor(ctx, env) {
    super(ctx, env)
    // Every string binding (Worker secrets + vars) becomes container env.
    // Applied at container start only — rotating a secret needs a restart.
    this.envVars = Object.fromEntries(
      Object.entries(env).filter(([, v]) => typeof v === "string")
    )
  }
}

const EDGE_CACHEABLE = [
  /^\/_next\/static\//, // build-hashed js/css/media + next/font woff2 — immutable for a year
  /^\/_next\/image$/, // the image optimiser's output — a month or more, must-revalidate
  /^\/fonts\//, // self-hosted fonts — immutable (next.config headers); none in public/ yet
  /^\/images\//, // public/images — frozen only once next.config gives it a max-age
]

// Shared across hosts: the same build serves mkan.sd, www and every subdomain.
const CACHE_HOST = "https://mkan.sd"

// The image optimiser picks the format from the client's Accept header, and
// Workers' Cache API ignores Vary at match time, so the format is part of the
// key — or a browser without avif would be handed another browser's avif.
// Next's rule (getSupportedMimeType over images.formats [avif, webp]): avif
// named → avif, else webp named → webp, else the original (a bare `image/*` is
// not enough). That is exact while each is named plainly, as every browser
// does; any other mention — q-weighted, parameterised, another case, a longer
// type — returns null and goes to the origin uncached rather than guessed at.
function imageFormat(accept) {
  const tokens = accept.split(",").map((t) => t.trim())
  const avif = tokens.includes("image/avif")
  const webp = tokens.includes("image/webp")
  const mentions = accept.match(/image\/(?:avif|webp)/gi)?.length ?? 0
  if (mentions !== Number(avif) + Number(webp)) return null
  return avif ? "avif" : webp ? "webp" : "orig"
}

function edgeCacheKey(url, request) {
  let extra = ""
  if (url.pathname === "/_next/image") {
    const fmt = imageFormat(request.headers.get("accept") || "")
    if (!fmt) return null
    extra = (url.search ? "&" : "?") + "__fmt=" + fmt
  }
  return new Request(CACHE_HOST + url.pathname + url.search + extra, {
    method: "GET",
  })
}

// The container is asked for the raw bytes, so the edge stores exactly one
// representation and never a gzip body whose header could part from it.
// Nothing ships raw: Cloudflare compresses JS, CSS and SVG for each visitor on
// the way out (brotli on this zone), and the container stops gzipping files
// the edge keeps.
function identityRequest(request) {
  const headers = new Headers(request.headers)
  headers.set("accept-encoding", "identity")
  return new Request(request, { headers })
}

// `x-edge-cache: hit | miss | bypass` — what the edge did, so a deploy can
// be checked with two curls instead of guessing from cf-cache-status.
function stamped(response, state) {
  const out = new Response(response.body, response)
  out.headers.set("x-edge-cache", state)
  return out
}

// Only what the origin explicitly allows the public to keep. A full 200 only:
// a 206 range slice or a 404 from a deploy-skewed chunk must stay live.
function freezable(response) {
  if (response.status !== 200) return false
  if (response.headers.has("set-cookie")) return false
  if (response.headers.has("content-encoding")) return false
  const cc = response.headers.get("cache-control") || ""
  if (!/\bpublic\b/.test(cc)) return false
  if (/no-store|no-cache|private/.test(cc)) return false
  const maxAge = /max-age=(\d+)/.exec(cc)
  return !!maxAge && Number(maxAge[1]) > 0
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    // Range requests (media seeking) go straight through: the key holds the
    // whole body, and a full 200 answering a range breaks Safari video.
    const cacheable =
      request.method === "GET" &&
      !request.headers.has("range") &&
      EDGE_CACHEABLE.some((re) => re.test(url.pathname))
    if (!cacheable) return getContainer(env.MKAN, "main").fetch(request)

    const key = edgeCacheKey(url, request)
    if (!key) {
      return stamped(await getContainer(env.MKAN, "main").fetch(request), "bypass")
    }

    const cache = caches.default
    const hit = await cache.match(key)
    if (hit) return stamped(hit, "hit")

    const response = await getContainer(env.MKAN, "main").fetch(
      identityRequest(request)
    )
    if (freezable(response)) {
      ctx.waitUntil(cache.put(key, response.clone()))
      return stamped(response, "miss")
    }
    return stamped(response, "bypass")
  },

  // Cron triggers call the app's own /api/cron/* routes inside the container.
  // NOTE: newly added triggers took ~19 hours to start firing on hogwarts —
  // registered and shown in the dashboard the whole time. Do not assume they
  // are broken on day one.
  async scheduled(controller, env, ctx) {
    const paths = crons.schedules[controller.cron] ?? []
    const run = async (path) => {
      const started = Date.now()
      try {
        const res = await getContainer(env.MKAN, "main").fetch(
          new Request("https://mkan.sd" + path, {
            headers: {
              authorization: "Bearer " + env.CRON_SECRET,
              "user-agent": "cloudflare-cron/1",
            },
          })
        )
        console.log(JSON.stringify({ cron: controller.cron, path, status: res.status, ms: Date.now() - started }))
      } catch (e) {
        console.error(JSON.stringify({ cron: controller.cron, path, error: String(e) }))
      }
    }
    // Sequential: one container instance, and a tick can fan out to several jobs.
    ctx.waitUntil((async () => { for (const p of paths) await run(p) })())
  },
}
