// Blocking head script: set only appearance attributes before the body can paint.
;(() => {
  let preference = 'system'
  try {
    const saved = localStorage.getItem('sportzone.theme')
    if (saved === 'light' || saved === 'dark') preference = saved
  } catch {
    /* CSS system preference works when storage is unavailable. */
  }
  document.documentElement.dataset.themePreference = preference
  const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.dataset.theme = preference === 'system' ? (dark ? 'dark' : 'light') : preference
})()
