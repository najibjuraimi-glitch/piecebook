import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BackBar, Screen } from '../components/Screen'
import { DangerGhostButton, GhostButton, PrimaryButton } from '../components/Buttons'
import { downloadBackup } from '../lib/backupFile'
import { formatDate } from '../lib/format'
import { keepLocalForNow, refreshSync, uploadLocalData, useSync, type SyncStatus } from '../store/sync'
import {
  applyImport,
  describeSummary,
  parseExport,
  snapshotDocs,
  subscribeUserData,
  summariseDocs,
  USER_DATA_LABEL,
  type ExportFile,
} from '../store/userData'

const STATUS_LINE: Record<SyncStatus, string> = {
  off: 'Cloud sync is off on this deployment. Everything stays in this browser.',
  checking: 'Checking the cloud copy…',
  synced: 'Synced. Changes here go to the cloud within a second and back to your other devices when they open.',
  syncing: 'Sending changes…',
  offline: 'The cloud could not be reached. Changes are kept here and sent when it answers.',
  'signed-out': 'Your sign-in has expired. Changes are kept here until you sign in again.',
  held: 'The cloud copy is empty and this device holds data. Nothing is sent until you choose.',
  'read-only': 'This identity can read the cloud copy but not change it.',
  error: 'Sync hit a problem. Your data on this device is untouched.',
}

function timeOf(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Backup, import and the cloud sync state, in one place. Import never runs
 * without a confirm that names what is about to be replaced.
 */
export function YourDataScreen() {
  const sync = useSync()
  const [tick, setTick] = useState(0)
  useEffect(() => subscribeUserData(null, () => setTick((t) => t + 1)), [])
  const local = useMemo(() => summariseDocs(snapshotDocs()), [tick, sync.lastSyncAt])
  const [busy, setBusy] = useState(false)
  const [pendingFile, setPendingFile] = useState<{ name: string; file: ExportFile } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const onPick = async (f: File | undefined) => {
    setImportError(null)
    setDone(null)
    setPendingFile(null)
    if (!f) return
    try {
      const text = await f.text()
      setPendingFile({ name: f.name, file: parseExport(text) })
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not read that file.')
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  const confirmImport = () => {
    if (!pendingFile) return
    const written = applyImport(pendingFile.file.docs)
    setPendingFile(null)
    setDone(
      written.length === 0
        ? 'Nothing in that file to import.'
        : `Imported ${written.length} ${written.length === 1 ? 'item' : 'items'}: ${written.map((k) => USER_DATA_LABEL[k].toLowerCase()).join(', ')}.`,
    )
  }

  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const fileSummary = pendingFile ? summariseDocs(pendingFile.file.docs) : null

  return (
    <Screen>
      <BackBar fallbackTo="/collection" crumbs={[{ label: 'Collection', to: '/collection' }, { label: 'Your data' }]} />
      <h1 className="text-display text-ink">Your data</h1>
      <p className="mt-2 max-w-[60ch] text-body text-ink">
        On this device: {describeSummary(local)}. Prices and the catalogue are not part of this; they ship with the app.
      </p>

      <div className="mt-8 max-w-[64ch] space-y-10">
        <Section title="Cloud">
          <p>{STATUS_LINE[sync.status]}</p>
          <dl className="space-y-1 text-meta text-ink">
            {sync.identity && <Row label="Signed in as" value={sync.identity} />}
            <Row label="Last synced" value={sync.lastSyncAt ? `${formatDate(sync.lastSyncAt)} ${timeOf(sync.lastSyncAt)}` : 'not yet'} />
            {sync.pending > 0 && <Row label="Waiting to send" value={`${sync.pending} ${sync.pending === 1 ? 'item' : 'items'}`} />}
          </dl>
          {sync.message && sync.status !== 'held' && <p className="text-meta text-muted">{sync.message}</p>}
          {sync.status === 'held' && (
            <div className="flex flex-col gap-2 tablet:flex-row">
              <PrimaryButton disabled={busy} onClick={() => act(uploadLocalData)}>
                {busy ? 'Uploading…' : 'Upload this device’s data'}
              </PrimaryButton>
              <GhostButton onClick={keepLocalForNow}>Keep local for now</GhostButton>
            </div>
          )}
          {(sync.status === 'offline' || sync.status === 'error') && (
            <GhostButton disabled={busy} onClick={() => act(refreshSync)} className="tablet:w-auto">
              Try again
            </GhostButton>
          )}
          {sync.status === 'signed-out' && (
            <GhostButton onClick={() => window.location.reload()} className="tablet:w-auto">
              Sign in again
            </GhostButton>
          )}
        </Section>

        <Section title="Backup">
          <p>Saves one JSON file with everything listed above. Keep it anywhere; it has no prices and no key.</p>
          <GhostButton onClick={() => downloadBackup()} className="tablet:w-auto">
            Download backup
          </GhostButton>
        </Section>

        <Section title="Import">
          <p>Loads a Piecebook backup file onto this device{sync.status === 'synced' || sync.status === 'syncing' ? ' and into the cloud' : ''}. You confirm before anything is replaced.</p>
          <input
            ref={fileInput}
            id="import-file"
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
          {!pendingFile && (
            <label
              htmlFor="import-file"
              className="inline-flex w-full min-h-[48px] cursor-pointer items-center justify-center rounded-xl border border-line bg-transparent px-5 text-body font-semibold text-ink transition-colors duration-150 ease-out hover:bg-white active:bg-[#F0ECE4] tablet:w-auto"
            >
              Choose backup file
            </label>
          )}
          {importError && <p className="text-meta text-bad">{importError}</p>}
          {pendingFile && fileSummary && (
            <div className="rounded-2xl border border-line bg-surface p-4" role="alertdialog" aria-labelledby="import-confirm-title">
              <p id="import-confirm-title" className="text-body font-semibold text-ink">
                Replace this device’s data with {pendingFile.name}?
              </p>
              <dl className="mt-2 space-y-1 text-meta text-ink">
                <Row label="In the file" value={describeSummary(fileSummary)} />
                <Row label="On this device now" value={describeSummary(local)} />
                {pendingFile.file.exportedAt && <Row label="Exported" value={formatDate(pendingFile.file.exportedAt)} />}
                {pendingFile.file.origin && <Row label="From" value={pendingFile.file.origin} />}
              </dl>
              <p className="mt-2 text-meta text-muted">
                Each item the file carries replaces the same item here. Items the file does not carry are left alone.
                {sync.status === 'synced' || sync.status === 'syncing' ? ' The cloud copy follows.' : ''}
              </p>
              <div className="mt-4 flex flex-col gap-2 tablet:flex-row">
                <DangerGhostButton onClick={confirmImport}>Replace and import</DangerGhostButton>
                <GhostButton onClick={() => setPendingFile(null)}>Cancel</GhostButton>
              </div>
            </div>
          )}
          {done && <p className="text-meta text-good">{done}</p>}
        </Section>
      </div>
    </Screen>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-meta font-medium uppercase tracking-[0.08em] text-muted">{title}</h2>
      <div className="mt-2 space-y-3 text-body text-ink">{children}</div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right">{value}</dd>
    </div>
  )
}
