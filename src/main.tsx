import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initAppStorage } from './lib/storage'

// Daten zuerst laden (IndexedDB ist asynchron), dann die App zeigen
void initAppStorage().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
