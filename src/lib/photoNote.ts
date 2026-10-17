/** What a missing or rejected photo means for ruling a 10 out. Never a grade. */
export function photoWouldChangeTheCall(opts: {
  frontReject?: string | null
  backReject?: string | null
  frontCannotBeTen: boolean
  backCannotBeTen: boolean
  hasFront: boolean
  hasBack: boolean
  visionRead?: boolean
  visionRuledOut?: boolean
}): string {
  const failed = [opts.frontReject ? `front (${opts.frontReject})` : null, opts.backReject ? `back (${opts.backReject})` : null].filter(
    Boolean,
  )
  if (failed.length) {
    return `Retake the ${failed.join(' and the ')}: whole card in frame, short side 800px or more, camera square-on (under ~8°).`
  }
  if (opts.frontCannotBeTen || opts.backCannotBeTen) {
    const which = [opts.frontCannotBeTen ? 'front' : null, opts.backCannotBeTen ? 'back' : null].filter(Boolean).join(' and ')
    return `A cleaner photo will not put a 10 back on the table — ${which} centering has already ruled one out.`
  }
  if (opts.visionRuledOut) {
    return 'These photos rule out a PSA 10 — a defect on a corner, edge or surface. They still never confirm one.'
  }
  if (!opts.hasFront || !opts.hasBack) {
    const missing = !opts.hasFront && !opts.hasBack ? 'front and back' : !opts.hasFront ? 'front' : 'back'
    return `Add a square-on ${missing} so centering can try to rule a 10 out. Photos never confirm one.`
  }
  if (opts.visionRead) {
    return 'The photo check did not find a defect that rules out a 10. Corners, edges and surface still never confirm one.'
  }
  return 'Corners, edges and surface are not read yet. An angled surface photo — once that slice lands — would cap a high 10-rate at mid. It cannot confirm a 10.'
}
