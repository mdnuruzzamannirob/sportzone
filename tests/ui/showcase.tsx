// Single preview entry: load one app UI namespace and one app theme per document.
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { createShowcase } from './showcase/catalog'
import './showcase.css'

const parameters = new URLSearchParams(window.location.search)
const application = parameters.get('app') === 'admin' ? 'admin' : 'storefront'
const UI = application === 'admin'
  ? await import('../../admin/src/components/ui/index')
  : await import('../../storefront/src/components/ui/index')
if (application === 'admin') await import('../../admin/src/components/ui/theme.css')
else await import('../../storefront/src/components/ui/theme.css')
UI.synchronizeThemePreference()
const Showcase = createShowcase(UI, application, parameters)
const root = document.getElementById('root')
if (!root) throw new Error('Missing preview root')
const applicationRoot = createRoot(root)
applicationRoot.render(<BrowserRouter><Showcase /></BrowserRouter>)
if (import.meta.hot) import.meta.hot.dispose(() => applicationRoot.unmount())
