// Kept as a tiny external file (not inline) because the server's Content-Security-Policy blocks inline scripts.
try {
  var saved = localStorage.getItem('shelfmark-theme')
  var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
} catch (e) {
  document.documentElement.dataset.theme = 'light'
}
