// Direct hosted HTML links use the same isolated viewer and cloud session.
(() => {
  if (window.parent !== window || !/^https?:$/.test(location.protocol)) return;
  const script = document.currentScript;
  if (!script?.src) return;
  const root = new URL('../', script.src);
  if (root.origin !== location.origin || !location.pathname.startsWith(root.pathname)) return;
  const path = location.pathname.slice(root.pathname.length).split('/').map(decodeURIComponent).join('/');
  root.searchParams.set('view','standalone');
  root.hash = '#/page/' + encodeURIComponent(path);
  location.replace(root.href);
})();
