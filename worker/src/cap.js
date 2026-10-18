/**
 * One counter for the vision cap. The Durable Object serialises each charge,
 * so two scans at once each count. Without the binding, KV is the fallback.
 */
export class VisionCap {
  constructor(state) {
    this.storage = state.storage
    this.tail = Promise.resolve()
  }

  fetch(req) {
    const run = this.tail.then(() => this.handle(req))
    this.tail = run.then(() => undefined, () => undefined)
    return run
  }

  async handle(req) {
    const url = new URL(req.url)
    const day = url.searchParams.get("day") || ""
    const cap = Number(url.searchParams.get("cap") || "60")
    const key = `count:${day}`
    const used = Number((await this.storage.get(key)) || 0)
    if (url.pathname === "/reserve") {
      return Response.json({ limited: used >= cap, used, cap })
    }
    if (url.pathname === "/charge") {
      if (used >= cap) return Response.json({ limited: true, used, cap, charged: false })
      const next = used + 1
      await this.storage.put(key, next)
      return Response.json({ limited: false, used: next, cap, charged: true })
    }
    return new Response("not_found", { status: 404 })
  }
}

function capNumber(env) {
  return parseInt(env.DAILY_CAP || "60", 10)
}

function counterStub(env) {
  if (!env.VISION_COUNTER) return null
  return env.VISION_COUNTER.get(env.VISION_COUNTER.idFromName("vision"))
}

export async function reserveCap(env, day) {
  const cap = capNumber(env)
  const stub = counterStub(env)
  if (stub) {
    const res = await stub.fetch(`https://vision-cap/reserve?day=${encodeURIComponent(day)}&cap=${cap}`)
    return res.json()
  }
  const used = parseInt((await env.VISION_CAP.get(`count:${day}`)) || "0", 10)
  return { limited: used >= cap, used, cap }
}

export async function commitCap(env, day) {
  const cap = capNumber(env)
  const stub = counterStub(env)
  if (stub) {
    const res = await stub.fetch(`https://vision-cap/charge?day=${encodeURIComponent(day)}&cap=${cap}`)
    const body = await res.json()
    return { used: body.used, cap: body.cap }
  }
  const key = `count:${day}`
  const used = parseInt((await env.VISION_CAP.get(key)) || "0", 10)
  const next = used + 1
  await env.VISION_CAP.put(key, String(next), { expirationTtl: 60 * 60 * 48 })
  return { used: next, cap }
}
