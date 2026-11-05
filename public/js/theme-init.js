(function () {
  try {
    var t = localStorage.getItem('pms_theme');
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) {}
})();
