import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProviders } from './app/providers'
import { AppRoutes } from './app/router'
import './styles/globals.css'

const root = document.getElementById('root')
if (!root) throw new Error('Admin root element is missing')

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  </StrictMode>,
)
