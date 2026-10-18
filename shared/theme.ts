export type ThemePreference = 'light' | 'dark' | 'system'
export const themeStorageKey = 'sportzone.theme'
const eventName = 'sportzone:theme-change'

function normalize(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system'
}
function apply(preference: ThemePreference) {
  document.documentElement.dataset.themePreference = preference
  if (preference === 'system')
    document.documentElement.removeAttribute('data-theme')
  else document.documentElement.dataset.theme = preference
}
export function getThemePreference(): ThemePreference {
  return normalize(document.documentElement.dataset.themePreference)
}
export function synchronizeThemePreference() {
  let preference = getThemePreference()
  try {
    preference = normalize(localStorage.getItem(themeStorageKey))
  } catch {
    /* Keep the current in-memory choice. */
  }
  apply(preference)
}
export function setThemePreference(preference: ThemePreference) {
  if (!['light', 'dark', 'system'].includes(preference))
    throw new TypeError('Invalid theme preference')
  apply(preference)
  try {
    localStorage.setItem(themeStorageKey, preference)
  } catch {
    /* Appearance still works for this page. */
  }
  window.dispatchEvent(new Event(eventName))
}
export function subscribeThemePreference(onChange: () => void): () => void {
  function storage(event: StorageEvent) {
    if (event.key !== null && event.key !== themeStorageKey) return
    if (event.storageArea) {
      try { if (event.storageArea !== window.localStorage) return } catch { return }
    }
    apply(normalize(event.newValue))
    onChange()
  }
  window.addEventListener(eventName, onChange)
  window.addEventListener('storage', storage)
  return () => {
    window.removeEventListener(eventName, onChange)
    window.removeEventListener('storage', storage)
  }
}
