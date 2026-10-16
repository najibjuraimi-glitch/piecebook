import { buildExport, exportFileName } from '../store/userData'

/** Save a JSON backup of every piecebook.* key to the Downloads folder (Files on iPhone). */
export function downloadBackup(now = new Date()): void {
  const file = buildExport(now)
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = exportFileName(now)
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
