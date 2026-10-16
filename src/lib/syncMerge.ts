import { hasMeaningfulData, UNKNOWN_AGE, USER_DATA_KEYS, type UserDocs } from '../store/userData'

export interface MergePlan {
  /** Cloud is newer: write these into this device. */
  applyRemote: UserDocs
  /** This device is newer, or the cloud has no copy: send these. */
  push: UserDocs
  /**
   * First login: the cloud holds nothing and this device holds real data.
   * Nothing is pushed until the collector taps upload.
   */
  offerUpload: boolean
}

/**
 * Last-write-wins per key on the ISO `updatedAt` stamp. Data from before sync
 * (`UNKNOWN_AGE`) always loses to a cloud copy and is only pushed when the
 * cloud has no copy of that key at all.
 */
export function planMerge(local: UserDocs, remote: UserDocs): MergePlan {
  const applyRemote: UserDocs = {}
  const push: UserDocs = {}
  const remoteEmpty = Object.keys(remote).length === 0
  for (const key of USER_DATA_KEYS) {
    const l = local[key]
    const r = remote[key]
    if (!l && !r) continue
    if (l && !r) {
      push[key] = l
      continue
    }
    if (r && !l) {
      applyRemote[key] = r
      continue
    }
    if (l && r) {
      if (l.updatedAt === UNKNOWN_AGE || r.updatedAt > l.updatedAt) applyRemote[key] = r
      else if (l.updatedAt > r.updatedAt) push[key] = l
    }
  }
  const offerUpload = remoteEmpty && hasMeaningfulData(local)
  return { applyRemote, push, offerUpload }
}

/** Stamp every doc `now`: used when the collector taps upload so old local data beats nothing. */
export function stampAll(docs: UserDocs, now: string): UserDocs {
  const out: UserDocs = {}
  for (const [k, d] of Object.entries(docs) as [keyof UserDocs, UserDocs[keyof UserDocs]][]) {
    if (d) out[k] = { value: d.value, updatedAt: now }
  }
  return out
}
