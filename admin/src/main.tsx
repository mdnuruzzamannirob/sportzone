import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { AppRoutes } from './app/routes'
import './styles.css'
import { ThemePreferenceSelect } from './components/theme-preference'

const root = document.getElementById('root')
if (!root) throw new Error('Admin root element is missing')

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <div className="mx-auto max-w-xl px-6 pt-6"><ThemePreferenceSelect /></div>
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>,
)
