/**
 * Where the app finds the Piecebook Worker (photo check and cloud sync).
 *
 * - Cloudflare Pages (the private deployment): `/api`, same origin. A Pages
 *   Function at `functions/api/[[path]].js` forwards to the Worker over a
 *   service binding, so the Cloudflare Access cookie rides along and the
 *   Worker sees the Access JWT. No cross-site cookies, no CORS.
 * - `npm run dev`: `/api` is proxied by Vite to `wrangler dev` on :8787
 *   (see vite.config.ts).
 * - GitHub Pages (the old public site): built with VITE_API_BASE set to the
 *   workers.dev URL, which keeps the photo check working until Access is on.
 */
const fromEnv = (import.meta.env.VITE_API_BASE as string | undefined)?.trim()
export const API_BASE = (fromEnv && fromEnv.length > 0 ? fromEnv : '/api').replace(/\/+$/, '')

/** Address of the new home, set at build time on the old site only; shows the "we moved" banner. */
export const MOVED_TO = ((import.meta.env.VITE_MOVED_TO as string | undefined) ?? '').trim()

/** Build-time off switch: the old GitHub Pages build sets VITE_SYNC=off so it never tries the cloud. */
export const SYNC_ENABLED = ((import.meta.env.VITE_SYNC as string | undefined) ?? '').trim().toLowerCase() !== 'off'
