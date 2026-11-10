// The channel loader (roadmap §4d): a small script inlined at the top of index.html by vite.config.ts.
// It runs before the app and sends the device to the version it chose (src/core/channel/channel.ts):
//   released page + mark "beta"   → the same address under <base>beta/
//   beta page without the mark    → the same address in the released version
// It must not depend on the app bundle: it is also the way out when a beta doesn't start.
// Tested in src/core/channel/channel.test.ts.

/**
 * @param {'stable' | 'beta'} build   which version this index.html belongs to
 * @param {string} stableBase         address of the released version, e.g. "/BandOrganizer/"
 * @returns {string} JavaScript source
 */
export function channelLoader(build, stableBase) {
  return `(function () {
  var STABLE = ${JSON.stringify(stableBase)}, BETA = STABLE + 'beta/', IS_BETA = ${JSON.stringify(build === 'beta')};
  var KEY = 'bandapp.channel', BOOT = 'bandapp.betaBoot', TRY = 'bandapp.betaTry', PATH = 'bandapp.betaPath';
  function go(url) { window.__bandappRedirecting = true; location.replace(url); }
  try {
    var path = location.pathname, tail = location.search + location.hash;
    // rescue address: <released app>?kanal=stabil always ends the beta on this device
    if (new URLSearchParams(location.search).get('kanal') === 'stabil') { localStorage.removeItem(KEY); localStorage.removeItem(BOOT); }
    var want = localStorage.getItem(KEY) === 'beta';
    if (!IS_BETA) {
      if (path.indexOf(BETA) === 0 || path + '/' === BETA) {
        // A beta address answered by the released page (GitHub's "not found" page): a deep link before
        // the beta is installed on this device – or no beta is published. Try its start page once.
        var rest = path.slice(BETA.length) + tail;
        if (want && !sessionStorage.getItem(TRY)) { sessionStorage.setItem(TRY, '1'); sessionStorage.setItem(PATH, rest); go(BETA); }
        else { localStorage.removeItem(KEY); sessionStorage.removeItem(TRY); sessionStorage.removeItem(PATH); go(STABLE + rest); }
      } else if (want && path.indexOf(STABLE) === 0) go(BETA + path.slice(STABLE.length) + tail);
      return;
    }
    if (!want) return go(STABLE + path.slice(BETA.length) + tail);
    sessionStorage.removeItem(TRY);
    // two starts in a row that never showed the app (the app clears the counter): back to the released version
    var starts = Number(localStorage.getItem(BOOT) || 0);
    if (starts >= 2) { localStorage.removeItem(KEY); localStorage.removeItem(BOOT); return go(STABLE); }
    localStorage.setItem(BOOT, String(starts + 1));
    var deep = sessionStorage.getItem(PATH);
    if (deep) { sessionStorage.removeItem(PATH); history.replaceState(null, '', BETA + deep); }
  } catch (e) {}
})();`;
}
