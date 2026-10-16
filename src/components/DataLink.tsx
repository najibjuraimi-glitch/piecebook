import { Link } from 'react-router-dom'
import { useSync, type SyncStatus } from '../store/sync'

const WORD: Record<SyncStatus, string> = {
  off: 'On this device',
  checking: 'Checking cloud…',
  synced: 'Synced to cloud',
  syncing: 'Syncing…',
  offline: 'Cloud not reached',
  'signed-out': 'Signed out',
  held: 'Not uploaded yet',
  'read-only': 'Read-only',
  error: 'Sync problem',
}

/** One quiet line at the foot of Collection and Portfolio: sync state plus the door to backup and import. */
export function DataLink({ className = '' }: { className?: string }) {
  const sync = useSync()
  const attention = sync.status === 'held' || sync.status === 'signed-out' || sync.status === 'error' || sync.status === 'offline'
  return (
    <p className={`px-1 text-meta ${attention ? 'text-ink' : 'text-muted'} ${className}`}>
      {WORD[sync.status]}
      {sync.pending > 0 && sync.status !== 'synced' ? ` · ${sync.pending} waiting` : ''}
      {' · '}
      <Link to="/your-data" className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink">
        Your data
      </Link>
    </p>
  )
}
