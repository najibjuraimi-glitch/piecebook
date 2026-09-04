import { SETS } from '../data/seed'
import { Screen, ScreenTitle } from '../components/Screen'
import { SetTile } from '../components/SetTile'
import { EmptyState } from '../components/EmptyState'

export function SetsScreen() {
  return (
    <Screen>
      <ScreenTitle title="Sets" subline="Browse by OP number" />
      {SETS.length === 0 ? (
        <EmptyState message="No sets loaded yet." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 tablet:grid-cols-2 wide:grid-cols-3">
          {SETS.map((set) => (
            <li key={set.setCode}>
              <SetTile set={set} />
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}
