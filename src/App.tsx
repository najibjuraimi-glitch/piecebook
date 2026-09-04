import { useEffect } from 'react'
import { Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { TabBar } from './components/TabBar'
import { TopBar } from './components/TopBar'
import { SetsScreen } from './screens/Sets'
import { SetDetailScreen } from './screens/SetDetail'
import { CardDetailScreen } from './screens/CardDetail'
import { CollectionScreen } from './screens/Collection'
import { PortfolioScreen } from './screens/Portfolio'
import { NotFoundScreen } from './screens/NotFound'

function ScrollToTop() {
  const { pathname } = useLocation()
  const navType = useNavigationType()
  useEffect(() => {
    // Fresh navigations start at the top; browser back/forward keeps its own position.
    if (navType !== 'POP') window.scrollTo({ top: 0 })
  }, [pathname, navType])
  return null
}

export default function App() {
  const { pathname } = useLocation()
  return (
    <div className="min-h-dvh bg-paper">
      <ScrollToTop />
      <TopBar pathname={pathname} />
      <Routes>
        <Route path="/" element={<SetsScreen />} />
        <Route path="/sets/:setCode" element={<SetDetailScreen />} />
        <Route path="/cards/:cardNumber" element={<CardDetailScreen />} />
        <Route path="/collection" element={<CollectionScreen />} />
        <Route path="/portfolio" element={<PortfolioScreen />} />
        <Route path="*" element={<NotFoundScreen />} />
      </Routes>
      <TabBar pathname={pathname} />
    </div>
  )
}
