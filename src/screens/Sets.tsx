import { ROSTER } from '../data/roster'
import { Screen, ScreenTitle } from '../components/Screen'
import { SetTile } from '../components/SetTile'
import { EmptyState } from '../components/EmptyState'

/** Every EN set on Cards' roster, oldest EN release first. The roster, not the card CSVs, decides membership. */
export function SetsScreen() {
  return (
    <Screen>
      <ScreenTitle title="Sets" subline="EN booster boxes" />
      {ROSTER.length === 0 ? (
        <EmptyState message="No sets loaded yet." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 tablet:grid-cols-2 wide:grid-cols-3">
          {ROSTER.map((set) => (
            <li key={set.setCode}>
              <SetTile set={set} />
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}
