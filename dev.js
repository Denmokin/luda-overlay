/*
 * Luda overlay loader for development. Never wrap an app for everyday use with this file.
 *
 * It works like loader.js, but takes the add-on from a development server on the TV's own address
 * (reached through `adb reverse`), reports back to it, and runs the commands it sends. If no
 * server answers, it loads the published add-on like loader.js does.
 */
(function () {
  if (window.__ludaLoader) return;
  window.__ludaLoader = true;

  var TIZENTUBE = 'https://cdn.jsdelivr.net/npm/@foxreis/tizentube/dist/userScript.js?v=';
  var ADDON = 'https://cdn.jsdelivr.net/gh/Denmokin/luda-overlay@main/overlay.js';
  var DEV = 'http://127.0.0.1:8013/luda-overlay/';

  var policy = null;
  try {
    policy = window.trustedTypes && trustedTypes.createPolicy('luda-dev', {
      createScriptURL: function (url) { return url; },
      createScript: function (code) { return code; }
    });
  } catch (e) { /* older engine */ }

  function add(src) {
    var script = document.createElement('script');
    script.src = policy ? policy.createScriptURL(src) : src;
    (document.head || document.documentElement).appendChild(script);
  }

  function run(code) {
    try {
      (0, eval)(policy ? policy.createScript(code) : code);
    } catch (first) {
      // Fall back to an inline script carrying the page's own nonce
      var known = document.querySelector('script[nonce]');
      var script = document.createElement('script');
      if (known) script.nonce = known.nonce;
      script.text = policy ? policy.createScript(code) : code;
      (document.head || document.documentElement).appendChild(script);
    }
  }

  add(TIZENTUBE + Date.now());
  if (window.top !== window) return;

  window.__ludaLog = function (value) {
    var text;
    try { text = typeof value === 'string' ? value : JSON.stringify(value); } catch (e) { text = 'unserializable: ' + e; }
    try { fetch(DEV + 'log', { method: 'POST', body: String(text).slice(0, 60000) }).catch(function () {}); } catch (e) { /* no server */ }
  };

  fetch(DEV + 'overlay.js?t=' + Date.now()).then(function (response) {
    if (!response.ok) throw new Error('status ' + response.status);
    return response.text();
  }).then(function (code) {
    window.addEventListener('error', function (e) {
      __ludaLog({ error: e.message, at: (e.filename || '') + ':' + e.lineno });
    });
    run(code);
    __ludaLog({ hello: location.href });
    setInterval(function () {
      fetch(DEV + 'cmd.js?t=' + Date.now()).then(function (r) { return r.text(); })
        .then(function (command) { if (command) run(command); }).catch(function () {});
    }, 1500);
  }).catch(function () {
    add(ADDON + '?v=' + Date.now());
  });
})();
