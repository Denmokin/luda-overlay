/*
 * Luda overlay loader.
 *
 * A wrapped TizenTube app loads this file in place of TizenTube's own script. It loads TizenTube's
 * script from its usual address first, so TizenTube keeps updating itself, and then the Luda add-on.
 */
(function () {
  if (window.__ludaLoader) return;
  window.__ludaLoader = true;

  var TIZENTUBE = 'https://cdn.jsdelivr.net/npm/@foxreis/tizentube/dist/userScript.js?v=';
  // The add-on comes from the same commit as this file. A branch address (@main) can be served
  // stale for hours by some of the file host's servers; a commit address never changes.
  var REPO = 'https://cdn.jsdelivr.net/gh/Denmokin/luda-overlay@';
  var self = (document.currentScript && document.currentScript.src) || '';
  var pin = /luda-overlay@([0-9a-f]{7,40})\//.exec(self);
  var ADDON = REPO + (pin ? pin[1] : 'main') + '/overlay.js';

  // The page only accepts script addresses that went through a Trusted Types policy
  var policy = null;
  try {
    policy = window.trustedTypes && trustedTypes.createPolicy('luda-loader', {
      createScriptURL: function (url) { return url; }
    });
  } catch (e) { /* older engine: plain strings are accepted */ }

  function add(src) {
    var script = document.createElement('script');
    script.src = policy ? policy.createScriptURL(src) : src;
    (document.head || document.documentElement).appendChild(script);
  }

  add(TIZENTUBE + Date.now());
  // the add-on only belongs in the main page
  if (window.top === window) add(pin ? ADDON : ADDON + '?v=' + Date.now());
})();
