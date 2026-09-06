import { Screen, ScreenTitle } from '../components/Screen'
import { EmptyState } from '../components/EmptyState'

interface Props {
  title?: string
  message?: string
}

export function NotFoundScreen({ title = 'Not found', message = 'Nothing here.' }: Props) {
  return (
    <Screen>
      <ScreenTitle title={title} />
      <EmptyState message={message} ctaLabel="Browse sets" ctaTo="/sets" />
    </Screen>
  )
}
