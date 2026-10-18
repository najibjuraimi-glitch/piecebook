import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { CollectionProvider } from './store/collection'
import { HoldingsBookProvider } from './store/holdingsBook'
import { WatchlistProvider } from './store/watchlist'
import { DecksProvider } from './store/decks'
import { ReaderCutoffProvider } from './store/readerCutoff'
import { startSync } from './store/sync'
import './index.css'

startSync()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CollectionProvider>
        <HoldingsBookProvider>
          <WatchlistProvider>
            <DecksProvider>
              <ReaderCutoffProvider>
                <App />
              </ReaderCutoffProvider>
            </DecksProvider>
          </WatchlistProvider>
        </HoldingsBookProvider>
      </CollectionProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
