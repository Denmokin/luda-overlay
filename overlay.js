/*
 * Luda add-on for TizenTube. Loaded by loader.js after TizenTube's own script.
 *
 * It never changes TizenTube's code. It only works with what the page exposes: cookies, storage,
 * the page's configuration and its video elements.
 */
(function () {
  if (window.__ludaOverlay) return;
  if (!/(^|\.)youtube\.com$/.test(location.hostname)) return;

  var luda = window.__ludaOverlay = { version: '0.5.0' };
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

  var DEFAULTS = { silentPreviews: true, languagePerAccount: true, settingsPerAccount: true };
  var settings = read('settings', {});
  luda.setting = function (name, value) {
    if (arguments.length > 1) {
      settings[name] = value;
      write('settings', settings);
    }
    return name in settings ? settings[name] : DEFAULTS[name];
  };

  /**
   * The account this page is showing: its Google account id, or 'guest'.
   * The TV page keeps the active identity in its own storage; only the id is read from it.
   */
  function account() {
    try {
      var identity = JSON.parse(localStorage.getItem('yt.leanback.default::last-identity-used')).data;
      return String(identity.effectiveObfuscatedGaiaId || identity.ownerObfuscatedGaiaId || 'guest');
    } catch (e) {
      return 'guest';
    }
  }
  luda.account = account;

  var accountListeners = [];
  var shownAccount = account();
  setInterval(function () {
    var now = account();
    if (now === shownAccount) return;
    var before = shownAccount;
    shownAccount = now;
    accountListeners.forEach(function (listener) {
      try { listener(now, before); } catch (e) { /* one feature must not stop the others */ }
    });
  }, 1500);

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

  /** Puts [language] into the site-wide cookie; with no language the page follows the TV's own. */
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
    if (language) {
      names.push('hl');
      fields.hl = language;
    }
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
    write('language-owner', account());
  }

  /** Called when someone picks a language in the app's settings. */
  function chooseLanguage(language) {
    rememberLanguage(language);
    writeLanguage(language);
  }

  function cookieLanguage() {
    var found = null;
    prefCookies().forEach(function (value) {
      var match = /(?:^|&)hl=([^&]*)/.exec(value);
      if (match) found = match[1];
    });
    return found;
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

  /** True when the page should reload for [target]; only once per target, so a refused language can't loop. */
  function reloadOnceFor(target) {
    if (sessionStorage.getItem(STORE + 'language-reload') === target) return false;
    sessionStorage.setItem(STORE + 'language-reload', target);
    return true;
  }

  /** Makes the cookie match this account's language. Returns true when the page must reload to show it. */
  function applyLanguage() {
    var wanted = wantedLanguage();
    if (wanted) {
      write('language-owner', account());
      if (sameLanguage(wanted, config('HL'))) {
        sessionStorage.removeItem(STORE + 'language-reload');
        return false;
      }
      writeLanguage(wanted);
      return reloadOnceFor(wanted);
    }
    // This account never chose a language: don't leave it with another account's choice
    var owner = read('language-owner', null);
    if (luda.setting('languagePerAccount') && owner && owner !== account() && cookieLanguage()) {
      write('language-owner', null);
      writeLanguage(null);
      return reloadOnceFor('tv-default:' + account());
    }
    return false;
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
  // TizenTube settings for each account
  //
  // TizenTube keeps one set of settings for the whole TV. Here every account gets its own copy:
  // when the account changes, the live set is put away under the account that used it and the
  // new account's set is brought in. A few settings describe the TV, not a person, and are shared.
  // ---------------------------------------------------------------------------------------------

  var TIZENTUBE = 'ytaf-configuration';
  var SHARED = ['enableWhoIsWatchingMenu', 'permanentlyEnableWhoIsWatchingMenu', 'enableWhosWatchingMenuOnAppExit',
    'dontCheckUpdateUntil', 'lastAnnouncementCheck', 'showWelcomeToast'];

  /** Brings in this account's TizenTube settings. Returns true when the page must reload to use them. */
  function applySettings() {
    if (!luda.setting('settingsPerAccount')) return false;
    var live = localStorage.getItem(TIZENTUBE);
    if (live == null) return false; // TizenTube hasn't saved anything yet
    var owner = read('settings-owner', null);
    var now = account();
    if (owner === now) return false;
    write('settings-owner', now);
    if (!owner) return false; // first run: the live settings belong to whoever is here
    localStorage.setItem(STORE + 'tizentube::' + owner, live);
    var mine = localStorage.getItem(STORE + 'tizentube::' + now);
    if (mine == null) return false; // a new account starts from the settings it found
    try {
      var current = JSON.parse(live);
      var next = JSON.parse(mine);
      SHARED.forEach(function (name) { if (name in current) next[name] = current[name]; });
      mine = JSON.stringify(next);
    } catch (e) { /* keep the stored copy as it is */ }
    if (mine === live) return false;
    localStorage.setItem(TIZENTUBE, mine);
    return true;
  }
  luda.settings = { apply: applySettings };

  // ---------------------------------------------------------------------------------------------
  // Luda menu: one entry in the app's Settings that opens a panel with this add-on's options.
  // It is built from the same panel and list pieces the app uses for its own menus.
  // ---------------------------------------------------------------------------------------------

  var TEXT = {
    en: {
      menu: 'Luda settings',
      summary: 'Options added by the Luda overlay',
      languagePerAccount: 'A language for each account',
      languagePerAccountHint: 'Each account keeps the language chosen for it in Settings',
      settingsPerAccount: 'TizenTube settings for each account',
      settingsPerAccountHint: 'Each account keeps its own TizenTube settings',
      silentPreviews: 'Previews without sound',
      silentPreviewsHint: 'Videos that play while you browse stay muted'
    },
    ru: {
      menu: 'Настройки Luda',
      summary: 'Возможности, которые добавляет Luda',
      languagePerAccount: 'Свой язык для каждого аккаунта',
      languagePerAccountHint: 'Каждый аккаунт сохраняет язык, выбранный для него в настройках',
      settingsPerAccount: 'Свои настройки TizenTube для каждого аккаунта',
      settingsPerAccountHint: 'У каждого аккаунта свои настройки TizenTube',
      silentPreviews: 'Тизеры без звука',
      silentPreviewsHint: 'Видео, которые играют при просмотре ленты, остаются без звука'
    }
  };

  function text(key) {
    var language = String(config('HL') || 'en').slice(0, 2).toLowerCase();
    return (TEXT[language] || TEXT.en)[key] || TEXT.en[key];
  }

  /** Hands a command to the app, the way its own menus do. */
  function command(cmd) {
    for (var key in window._yttv) {
      var holder = window._yttv[key];
      if (holder && holder.instance && typeof holder.instance.resolveCommand === 'function') {
        return holder.instance.resolveCommand(cmd);
      }
    }
  }

  var OPTIONS = ['languagePerAccount', 'settingsPerAccount', 'silentPreviews'];

  function showMenu(selected, update) {
    var items = OPTIONS.map(function (name) {
      return {
        compactLinkRenderer: {
          title: { simpleText: text(name) },
          subtitle: { simpleText: text(name + 'Hint') },
          secondaryIcon: { iconType: luda.setting(name) ? 'CHECK_BOX' : 'CHECK_BOX_OUTLINE_BLANK' },
          serviceEndpoint: {
            commandExecutorCommand: { commands: [{ customAction: { action: 'LUDA_TOGGLE', parameters: [name] } }] }
          }
        }
      };
    });
    var back = { signalAction: { signal: 'POPUP_BACK' } };
    var popup = {
      openPopupAction: {
        popupType: 'MODAL',
        uniqueId: 'luda-settings',
        popup: {
          overlaySectionRenderer: {
            overlay: {
              overlayTwoPanelRenderer: {
                actionPanel: {
                  overlayPanelRenderer: {
                    header: {
                      overlayPanelHeaderRenderer: {
                        title: { simpleText: text('menu') },
                        subtitle: { simpleText: text('summary') }
                      }
                    },
                    content: { overlayPanelItemListRenderer: { items: items, selectedIndex: selected || 0 } }
                  }
                },
                backButton: {
                  buttonRenderer: { accessibilityData: { accessibilityData: { label: 'Back' } }, command: back }
                }
              }
            },
            dismissalCommand: back
          }
        }
      }
    };
    if (update) {
      popup.openPopupAction.shouldMatchUniqueId = true;
      popup.openPopupAction.updateAction = true;
    }
    command(popup);
  }

  function runAction(action) {
    if (action.action === 'LUDA_SETTINGS_SHOW') {
      showMenu(0, false);
    } else if (action.action === 'LUDA_TOGGLE') {
      var name = action.parameters && action.parameters[0];
      if (OPTIONS.indexOf(name) < 0) return;
      luda.setting(name, !luda.setting(name));
      if (name === 'silentPreviews') quietAll();
      showMenu(OPTIONS.indexOf(name), true);
    }
  }

  /** The Luda actions inside [cmd], or null when it isn't ours. */
  function ludaActions(cmd) {
    function ours(c) { return c && c.customAction && /^LUDA_/.test(String(c.customAction.action)); }
    if (!cmd) return null;
    if (ours(cmd)) return [cmd.customAction];
    var list = cmd.commandExecutorCommand && cmd.commandExecutorCommand.commands;
    if (Array.isArray(list) && list.some(ours)) {
      return list.filter(ours).map(function (c) { return c.customAction; });
    }
    return null;
  }

  // Luda's own actions are picked out before the app or TizenTube see them. TizenTube wraps the same
  // function, possibly later than this runs, so the check is repeated to stay in front.
  function hookCommands() {
    for (var key in window._yttv) {
      var holder = window._yttv[key];
      var instance = holder && holder.instance;
      if (!instance || typeof instance.resolveCommand !== 'function' || instance.resolveCommand.__luda) continue;
      (function (target, previous) {
        var wrapped = function (cmd, extra) {
          var actions = ludaActions(cmd);
          if (actions) {
            actions.forEach(runAction);
            return true;
          }
          return previous.call(this, cmd, extra);
        };
        wrapped.__luda = true;
        target.resolveCommand = wrapped;
      })(instance, instance.resolveCommand);
    }
  }
  setInterval(hookCommands, 2000);
  hookCommands();

  function addSettingsEntry(page) {
    if (!page || !page.title || !page.title.runs || !Array.isArray(page.items)) return;
    function category(item) { return item && item.settingCategoryCollectionRenderer; }
    if (!page.items.some(category)) return;
    if (page.items.some(function (item) { return category(item) && category(item).categoryId === 'luda_category'; })) return;
    var label = { runs: [{ text: text('menu') }] };
    var entry = {
      settingCategoryCollectionRenderer: {
        categoryId: 'luda_category',
        focused: false,
        trackingParams: 'null',
        items: [{
          settingActionRenderer: {
            itemId: 'luda_open_action',
            title: label,
            actionLabel: label,
            summary: { runs: [{ text: text('summary') }] },
            trackingParams: 'null',
            serviceEndpoint: { customAction: { action: 'LUDA_SETTINGS_SHOW', parameters: [] } },
            thumbnail: { thumbnails: [{ url: 'https://www.gstatic.com/ytlr/img/parent_code.png' }] }
          }
        }]
      }
    };
    var first = category(page.items[0]);
    page.items.splice(first && first.categoryId === 'tizentube_category' ? 1 : 0, 0, entry);
  }

  // The Settings page arrives as JSON; the entry is added as it is read
  var parse = JSON.parse;
  JSON.parse = function () {
    var result = parse.apply(this, arguments);
    try { addSettingsEntry(result); } catch (e) { /* never break the app's own parsing */ }
    return result;
  };

  luda.menu = { show: function () { showMenu(0, false); } };

  // ---------------------------------------------------------------------------------------------

  function applyAccount() {
    var settingsChanged = applySettings();
    var languageChanged = applyLanguage();
    if (settingsChanged || languageChanged) location.reload();
  }

  accountListeners.push(applyAccount);
  applyAccount();
  quietAll();
})();
