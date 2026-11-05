(function () {
  try {
    var t = localStorage.getItem('pms_theme');
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    var sc = localStorage.getItem('omnihost:sidebar-collapsed');
    if (sc === 'true' && window.innerWidth > 900) {
      document.documentElement.classList.add('sidebar-collapsed');
    }
  } catch (e) {}
})();
