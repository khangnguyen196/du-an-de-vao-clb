/**
 * Light / dark theme choice. With no choice stored the page follows the
 * system (`prefers-color-scheme`); a choice from the toggle is kept in
 * localStorage and written to `<html data-theme>`, which globals.css reads.
 */
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'abc:theme'

/**
 * Runs inline in <head>, before first paint, so a reader who chose light on a
 * dark system never sees a flash of the wrong theme. Plain ES5 and wrapped in
 * try: storage can be blocked, and this must never break the page.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`

/** The theme actually showing right now, stored choice or system. */
export function currentTheme(): Theme {
  const chosen = document.documentElement.getAttribute('data-theme')
  if (chosen === 'light' || chosen === 'dark') return chosen
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* not remembered, still applied for this visit */
  }
}
