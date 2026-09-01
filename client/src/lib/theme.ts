import { useState } from 'react'

export type Theme = 'light' | 'dark'

const current = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')



export function useTheme() {
  const [theme, setTheme] = useState<Theme>(current)

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('shelfmark-theme', next)
    } catch {
      
    }
    setTheme(next)
  }

  return { theme, toggle }
}
