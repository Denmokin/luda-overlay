/*
 * Luda add-on for TizenTube. Loaded by loader.js after TizenTube's own script.
 *
 * It never changes TizenTube's code. It only works with what the page exposes: cookies, storage,
 * the page's configuration and its video elements.
 */
(function () {
  if (window.__ludaOverlay) return;
  if (!/(^|\.)youtube\.com$/.test(location.hostname)) return;

  var luda = window.__ludaOverlay = { version: '0.2.0' };
  var STORE = 'luda-overlay::';

  function read(key, fallback) {
    try {
      var saved = localStorage.getItem(STORE + key);
      return saved == null ? fallback : JSON.parse(saved);
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try { localStorage.setItem(STORE + key, JSON.stringify(value)); } catch (e) { /* storage full or blocked */ }
  }

  function config(name) {
    return window.ytcfg && ytcfg.get ? ytcfg.get(name) : undefined;
  }

  var DEFAULTS = { silentPreviews: true, languagePerAccount: true };
  var settings = read('settings', {});
  luda.setting = function (name, value) {
    if (arguments.length > 1) {
      settings[name] = value;
      write('settings', settings);
    }
    return name in settings ? settings[name] : DEFAULTS[name];
  };

  /** The signed-in account this page is showing, or 'guest'. */
  function account() {
    return config('LOGGED_IN') ? String(config('DATASYNC_ID') || 'signed-in') : 'guest';
  }
  luda.account = account;

  // ---------------------------------------------------------------------------------------------
  // Language
  //
  // The page takes its language from the `hl` field of the PREF cookie. TizenTube saves a language
  // choice as a second PREF cookie for this page only, and the site-wide PREF cookie that the
  // servers set wins over it, so the choice is ignored. Here the choice goes into the site-wide
  // cookie, keeping its other fields, and is remembered for the account that made it.
  // ---------------------------------------------------------------------------------------------

  var cookies = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');

  function prefCookies() {
    return cookies.get.call(document).split('; ')
      .filter(function (cookie) { return cookie.indexOf('PREF=') === 0; })
      .map(function (cookie) { return cookie.slice(5); });
  }

  function writeLanguage(language) {
    var names = [];
    var fields = {};
    prefCookies().forEach(function (value) {
      value.split('&').forEach(function (pair) {
        var split = pair.indexOf('=');
        if (split <= 0) return;
        var name = pair.slice(0, split);
        if (name === 'hl') return;
        if (!(name in fields)) names.push(name);
        fields[name] = pair.slice(split + 1);
      });
    });
    names.push('hl');
    fields.hl = language;
    var value = names.map(function (name) { return name + '=' + fields[name]; }).join('&');
    var expires = new Date(Date.now() + 10 * 365 * 864e5).toUTCString();
    cookies.set.call(document, 'PREF=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'); // the page-only copy
    cookies.set.call(document, 'PREF=' + value + '; Domain=.youtube.com; Path=/; Secure; expires=' + expires);
  }

  function sameLanguage(a, b) {
    return String(a || '').toLowerCase() === String(b || '').toLowerCase();
  }

  function rememberLanguage(language) {
    var languages = read('languages', {});
    languages[account()] = language;
    write('languages', languages);
  }

  /** Called when someone picks a language in the app's settings. */
  function chooseLanguage(language) {
    rememberLanguage(language);
    writeLanguage(language);
  }

  // TizenTube writes its page-only cookie as `PREF=hl=<language>`; turn that write into a real choice
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: function () { return cookies.get.call(document); },
    set: function (value) {
      var choice = /^\s*PREF=hl=([A-Za-z0-9_-]+)\s*(;|$)/.exec(String(value));
      if (choice && !/;\s*domain=/i.test(String(value))) chooseLanguage(choice[1]);
      else cookies.set.call(document, value);
    }
  });

  /** The language this account should see, if one was chosen. */
  function wantedLanguage() {
    var leftover = prefCookies().filter(function (value) { return /^hl=[A-Za-z0-9_-]+$/.test(value); })[0];
    if (leftover) {
      // a choice made before this add-on was installed
      rememberLanguage(leftover.slice(3));
      return leftover.slice(3);
    }
    if (!luda.setting('languagePerAccount')) return null;
    return read('languages', {})[account()] || null;
  }

  function applyLanguage() {
    var wanted = wantedLanguage();
    if (!wanted) return;
    if (sameLanguage(wanted, config('HL'))) {
      sessionStorage.removeItem(STORE + 'language-reload');
      return;
    }
    writeLanguage(wanted);
    // one reload per wanted language, so a language the servers refuse can't loop
    if (sessionStorage.getItem(STORE + 'language-reload') === wanted) return;
    sessionStorage.setItem(STORE + 'language-reload', wanted);
    location.reload();
  }

  luda.language = { choose: chooseLanguage, wanted: wantedLanguage, apply: applyLanguage };

  // ---------------------------------------------------------------------------------------------
  // Silent previews: videos that play while browsing stay muted; the watch page is left alone.
  // ---------------------------------------------------------------------------------------------

  function watching() {
    return /^#\/watch/.test(location.hash);
  }

  function quiet(video) {
    if (luda.setting('silentPreviews') && !watching()) {
      if (!video.muted) {
        video.muted = true;
        video.__ludaMuted = true;
      }
    } else if (video.__ludaMuted) {
      video.__ludaMuted = false;
      video.muted = false;
    }
  }

  function quietAll() {
    Array.prototype.forEach.call(document.querySelectorAll('video'), quiet);
  }

  ['loadstart', 'play', 'playing', 'volumechange'].forEach(function (event) {
    document.addEventListener(event, function (e) {
      if (e.target && e.target.tagName === 'VIDEO') quiet(e.target);
    }, true);
  });
  window.addEventListener('hashchange', quietAll);
  luda.previews = { refresh: quietAll };

  // ---------------------------------------------------------------------------------------------

  applyLanguage();
  quietAll();
})();
