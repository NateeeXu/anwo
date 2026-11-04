// Runs before first paint: resolves data-theme / lang so CSS variables and the dark variant agree (DESIGN.md §9).
// Kept as a static file (not inline) so the production CSP script-src 'self' allows it.
// Resolve theme before first paint so CSS variables and the dark: variant agree (DESIGN.md §9).
(function () {
  try {
    var pref = localStorage.getItem('theme');
    var dark = pref === 'dark' || (pref !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var m = document.cookie.match(/(?:^|;\s*)lang=(zh-CN|en)/);
    if (m) document.documentElement.setAttribute('lang', m[1]);
  } catch (e) {}
})();
