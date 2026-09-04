import { Screen, ScreenTitle } from '../components/Screen'
import { EmptyState } from '../components/EmptyState'

export function NotFoundScreen({ message = 'Nothing here.' }: { message?: string }) {
  return (
    <Screen>
      <ScreenTitle title="Not found" />
      <EmptyState message={message} ctaLabel="Browse sets" ctaTo="/" />
    </Screen>
  )
}
