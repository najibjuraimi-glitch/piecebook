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
import { AboutPricesScreen } from './screens/AboutPrices'
import { CharacterScreen } from './screens/Character'
import { ArtistScreen } from './screens/Artist'
import { DecksScreen } from './screens/Decks'
import { DeckBuilderScreen } from './screens/DeckBuilder'
import { LearnScreen } from './screens/Learn'
import { StartScreen } from './screens/Start'
import { DataHealthScreen } from './screens/DataHealth'
import { BelongScreen } from './screens/Belong'
import { BelongStoryScreen } from './screens/BelongStory'
import { BelongPeopleScreen } from './screens/BelongPeople'
import { BelongFruitsScreen } from './screens/BelongFruits'

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
        <Route path="/about-prices" element={<AboutPricesScreen />} />
        <Route path="/data" element={<DataHealthScreen />} />
        <Route path="/characters/:name" element={<CharacterScreen />} />
        <Route path="/artists/:name" element={<ArtistScreen />} />
        <Route path="/decks" element={<DecksScreen />} />
        <Route path="/decks/:id" element={<DeckBuilderScreen />} />
        <Route path="/learn" element={<LearnScreen />} />
        <Route path="/start" element={<StartScreen />} />
        <Route path="/belong" element={<BelongScreen />} />
        <Route path="/belong/story" element={<BelongStoryScreen />} />
        <Route path="/belong/people" element={<BelongPeopleScreen />} />
        <Route path="/belong/fruits" element={<BelongFruitsScreen />} />
        <Route path="*" element={<NotFoundScreen />} />
      </Routes>
      <TabBar pathname={pathname} />
    </div>
  )
}
