import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { CollectionProvider } from './store/collection'
import { WatchlistProvider } from './store/watchlist'
import { DecksProvider } from './store/decks'
import { ReaderCutoffProvider } from './store/readerCutoff'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CollectionProvider>
        <WatchlistProvider>
          <DecksProvider>
            <ReaderCutoffProvider>
              <App />
            </ReaderCutoffProvider>
          </DecksProvider>
        </WatchlistProvider>
      </CollectionProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
