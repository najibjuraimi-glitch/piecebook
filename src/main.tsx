import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { CollectionProvider } from './store/collection'
import { WatchlistProvider } from './store/watchlist'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CollectionProvider>
        <WatchlistProvider>
          <App />
        </WatchlistProvider>
      </CollectionProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
