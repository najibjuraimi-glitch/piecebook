import { dismissAlerts, freshUnderCostAlerts, type AlertMemory, type UnderCostAlert, type ValuedCopy } from './boughtBook'

/** Device memory of the last legal price that already fired an under-cost alert. Not synced. */
export const BOUGHT_ALERTS_KEY = 'piecebook.boughtAlerts.v1'

export function readAlertMemory(): AlertMemory {
  try {
    const raw = localStorage.getItem(BOUGHT_ALERTS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const memory: AlertMemory = {}
    for (const [rowId, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) memory[rowId] = value
    }
    return memory
  } catch {
    return {}
  }
}

export function writeAlertMemory(memory: AlertMemory): void {
  try {
    localStorage.setItem(BOUGHT_ALERTS_KEY, JSON.stringify(memory))
  } catch {
    // A full or private browser still shows the alert this visit.
  }
}

export function alertsFor(copies: ValuedCopy[], memory: AlertMemory): UnderCostAlert[] {
  return freshUnderCostAlerts(copies, memory)
}

export function rememberAlerts(memory: AlertMemory, alerts: UnderCostAlert[]): AlertMemory {
  const next = dismissAlerts(memory, alerts)
  writeAlertMemory(next)
  return next
}
