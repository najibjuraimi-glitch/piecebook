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
      if (used >= cap) return Response.json({ limited: true, used, cap, held: false })
      const next = used + 1
      await this.storage.put(key, next)
      return Response.json({ limited: false, used: next, cap, held: true })
    }
    if (url.pathname === "/release") {
      const next = Math.max(0, used - 1)
      await this.storage.put(key, next)
      return Response.json({ used: next, cap })
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
  const key = `count:${day}`
  const used = parseInt((await env.VISION_CAP.get(key)) || "0", 10)
  if (used >= cap) return { limited: true, used, cap, held: false }
  const next = used + 1
  await env.VISION_CAP.put(key, String(next), { expirationTtl: 60 * 60 * 48 })
  return { limited: false, used: next, cap, held: true }
}

export async function releaseCap(env, day) {
  const cap = capNumber(env)
  const stub = counterStub(env)
  if (stub) {
    const res = await stub.fetch(`https://vision-cap/release?day=${encodeURIComponent(day)}&cap=${cap}`)
    return res.json()
  }
  const key = `count:${day}`
  const used = parseInt((await env.VISION_CAP.get(key)) || "0", 10)
  const next = Math.max(0, used - 1)
  await env.VISION_CAP.put(key, String(next), { expirationTtl: 60 * 60 * 48 })
  return { used: next, cap }
}
