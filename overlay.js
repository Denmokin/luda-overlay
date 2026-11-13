/*
 * Luda add-on for TizenTube. Loaded by loader.js after TizenTube's own script.
 *
 * It never changes TizenTube's code. It only works with what the page exposes: cookies, storage,
 * the page's configuration and its video elements.
 */
(function () {
  if (window.__ludaOverlay) return;
  if (!/(^|\.)youtube\.com$/.test(location.hostname)) return;

  var luda = window.__ludaOverlay = { version: '0.8.0' };
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

  var DEFAULTS = {
    silentPreviews: true, languagePerAccount: true, settingsPerAccount: true,
    hideMixes: false, hideUpcoming: false, speedPerChannel: true
  };
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
  // Silent previews: videos that play while browsing are turned down until they can't be heard;
  // the watch page is left alone.
  //
  // They are turned down, not muted: on some TVs a fully muted video keeps "playing" while its
  // picture stands still, because the TV's video hardware follows the audio it is given.
  // ---------------------------------------------------------------------------------------------

  var QUIET = 0.001; // 60 dB down

  function watching() {
    return /^#\/watch/.test(location.hash);
  }

  function quiet(video) {
    if (luda.setting('silentPreviews') && !watching()) {
      if (video.muted && video.__ludaMuted) {
        // left over from an earlier version of this add-on
        video.__ludaMuted = false;
        video.muted = false;
      }
      if (video.volume > QUIET) {
        video.__ludaVolume = video.volume;
        video.volume = QUIET;
      }
    } else if (video.__ludaVolume != null || video.volume === QUIET) {
      var before = video.__ludaVolume != null ? video.__ludaVolume : 1;
      video.__ludaVolume = null;
      video.volume = before;
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
  // Feed filters: mixes and upcoming streams are left out of the lists the app receives.
  // ---------------------------------------------------------------------------------------------

  function hiddenTile(item) {
    var tile = item && item.tileRenderer;
    if (!tile) return false;
    if (luda.setting('hideMixes') && tile.contentType === 'TILE_CONTENT_TYPE_PLAYLIST') {
      var watch = tile.onSelectCommand && tile.onSelectCommand.watchEndpoint;
      if (watch && /^RD/.test(String(watch.playlistId || ''))) return true; // a Mix
    }
    if (luda.setting('hideUpcoming')) {
      var header = tile.header && tile.header.tileHeaderRenderer;
      var overlays = (header && header.thumbnailOverlays) || [];
      for (var i = 0; i < overlays.length; i++) {
        var status = overlays[i].thumbnailOverlayTimeStatusRenderer;
        if (status && status.style === 'UPCOMING') return true;
      }
    }
    return false;
  }

  function filterFeed(value, depth) {
    if (!value || typeof value !== 'object' || depth > 40) return;
    if (Array.isArray(value)) {
      for (var i = value.length - 1; i >= 0; i--) {
        if (hiddenTile(value[i])) value.splice(i, 1);
        else filterFeed(value[i], depth + 1);
      }
      return;
    }
    for (var key in value) {
      if (value[key] && typeof value[key] === 'object') filterFeed(value[key], depth + 1);
    }
  }

  function filterResponse(result) {
    if (!luda.setting('hideMixes') && !luda.setting('hideUpcoming')) return;
    if (!result || typeof result !== 'object') return;
    if (result.contents || result.continuationContents || result.onResponseReceivedActions) filterFeed(result, 0);
  }

  // ---------------------------------------------------------------------------------------------
  // Speed for each channel: a speed picked while watching is used again for that channel's videos.
  // Speeds are kept per account. Changes in the first moments of a video are the app's own
  // start-up settings, not a choice, so they are not remembered.
  // ---------------------------------------------------------------------------------------------

  function player() {
    return document.querySelector('.html5-video-player');
  }

  function currentChannel() {
    try {
      var response = player().getPlayerResponse();
      var details = response && response.videoDetails;
      if (details && location.hash.indexOf(details.videoId) >= 0) return details.channelId || null;
    } catch (e) { /* no player yet */ }
    return null;
  }

  function channelSpeeds() {
    var all = read('speeds', {});
    return all[account()] || {};
  }

  function rememberSpeed(channel, rate) {
    var all = read('speeds', {});
    var mine = all[account()] || {};
    if (rate === 1) delete mine[channel]; else mine[channel] = rate;
    all[account()] = mine;
    write('speeds', all);
  }

  var lastSet = { rate: 0, at: 0 };

  function applySpeed(video) {
    if (!luda.setting('speedPerChannel') || !watching()) return;
    var channel = currentChannel();
    var saved = channel && channelSpeeds()[channel];
    if (!saved || video.playbackRate === saved) return;
    lastSet = { rate: saved, at: Date.now() };
    var p = player();
    if (p && typeof p.setPlaybackRate === 'function') p.setPlaybackRate(saved);
    if (video.playbackRate !== saved) video.playbackRate = saved;
  }

  var videoChanged = 0; // when a video last started loading or the page last changed
  document.addEventListener('loadstart', function () { videoChanged = Date.now(); }, true);
  window.addEventListener('hashchange', function () { videoChanged = Date.now(); });

  document.addEventListener('playing', function (e) {
    var video = e.target;
    if (!video || video.tagName !== 'VIDEO') return;
    // the player's own information about the video arrives a moment after it starts
    [400, 1500, 3000].forEach(function (delay) { setTimeout(function () { applySpeed(video); }, delay); });
  }, true);

  document.addEventListener('ratechange', function (e) {
    var video = e.target;
    if (!video || video.tagName !== 'VIDEO' || !luda.setting('speedPerChannel') || !watching()) return;
    // the player resets the speed whenever a video starts; only later changes are a viewer's choice
    if (Date.now() - videoChanged < 4000 || video.currentTime < 3) return;
    if (video.playbackRate === lastSet.rate && Date.now() - lastSet.at < 2000) return;
    var channel = currentChannel();
    if (channel) rememberSpeed(channel, video.playbackRate);
  }, true);

  // ---------------------------------------------------------------------------------------------
  // Sleep timer: pauses playback after the chosen time. It lasts until the app is closed.
  // ---------------------------------------------------------------------------------------------

  var SLEEP_STEPS = [0, 15, 30, 60, 90];
  var sleep = { step: 0, at: 0, timer: null };

  function setSleep(step) {
    clearTimeout(sleep.timer);
    sleep.step = step;
    var minutes = SLEEP_STEPS[step];
    sleep.at = minutes ? Date.now() + minutes * 60000 : 0;
    if (minutes) sleep.timer = setTimeout(sleepNow, minutes * 60000);
  }

  function sleepNow() {
    sleep.step = 0;
    sleep.at = 0;
    var p = player();
    if (p && typeof p.pauseVideo === 'function') p.pauseVideo();
    Array.prototype.forEach.call(document.querySelectorAll('video'), function (video) { video.pause(); });
    toast(text('sleepTimer'), text('sleepDone'));
  }

  function sleepLabel() {
    if (!sleep.at) return text('sleepOff');
    var left = Math.max(1, Math.round((sleep.at - Date.now()) / 60000));
    return text('sleepLeft').replace('%d', left);
  }

  luda.sleep = { set: setSleep, now: sleepNow };

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
      silentPreviewsHint: 'Videos that play while you browse stay silent',
      hideShorts: 'Hide Shorts',
      hideShortsHint: 'Shorts are left out of lists; the app reloads to apply it',
      hideMixes: 'Hide mixes',
      hideMixesHint: 'Mix playlists are left out of lists opened from now on',
      hideUpcoming: 'Hide upcoming streams',
      hideUpcomingHint: 'Scheduled streams and premieres are left out of lists',
      speedPerChannel: 'Remember speed for each channel',
      speedPerChannelHint: 'A speed you pick is used again for that channel',
      sleepTimer: 'Sleep timer',
      sleepOff: 'Off',
      sleepLeft: '%d min left',
      sleepDone: 'Playback paused'
    },
    ru: {
      menu: 'Настройки Luda',
      summary: 'Возможности, которые добавляет Luda',
      languagePerAccount: 'Свой язык для каждого аккаунта',
      languagePerAccountHint: 'Каждый аккаунт сохраняет язык, выбранный для него в настройках',
      settingsPerAccount: 'Свои настройки TizenTube для каждого аккаунта',
      settingsPerAccountHint: 'У каждого аккаунта свои настройки TizenTube',
      silentPreviews: 'Тизеры без звука',
      silentPreviewsHint: 'Видео, которые играют при просмотре ленты, остаются без звука',
      hideShorts: 'Скрывать Shorts',
      hideShortsHint: 'Shorts не показываются в списках; приложение перезагрузится',
      hideMixes: 'Скрывать миксы',
      hideMixesHint: 'Плейлисты-миксы не показываются в новых списках',
      hideUpcoming: 'Скрывать запланированные трансляции',
      hideUpcomingHint: 'Запланированные трансляции и премьеры не показываются в списках',
      speedPerChannel: 'Запоминать скорость для каждого канала',
      speedPerChannelHint: 'Выбранная скорость снова используется для этого канала',
      sleepTimer: 'Таймер сна',
      sleepOff: 'Выключен',
      sleepLeft: 'Осталось %d мин',
      sleepDone: 'Воспроизведение остановлено'
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

  function toast(title, subtitle) {
    command({
      openPopupAction: {
        popupType: 'TOAST',
        popup: { overlayToastRenderer: { title: { simpleText: title }, subtitle: { simpleText: subtitle || '' } } }
      }
    });
  }

  var OPTIONS = ['languagePerAccount', 'settingsPerAccount', 'silentPreviews', 'speedPerChannel', 'hideShorts', 'hideMixes', 'hideUpcoming'];

  // "Hide Shorts" is TizenTube's own Shorts switch, so both menus always agree. TizenTube reads its
  // settings once at start, so the page reloads to use the change.
  function tizenTubeConfig() {
    try { return JSON.parse(localStorage.getItem(TIZENTUBE)) || {}; } catch (e) { return {}; }
  }

  function checked(name) {
    return name === 'hideShorts' ? tizenTubeConfig().enableShorts === false : luda.setting(name);
  }

  function toggle(name) {
    if (name !== 'hideShorts') {
      luda.setting(name, !luda.setting(name));
      return false;
    }
    var current = tizenTubeConfig();
    current.enableShorts = current.enableShorts === false;
    localStorage.setItem(TIZENTUBE, JSON.stringify(current));
    return true;
  }
  var SLEEP_ROW = OPTIONS.length; // the sleep timer comes after the switches

  function showMenu(selected, update) {
    function row(title, subtitle, action, parameters, icon) {
      var item = {
        compactLinkRenderer: {
          title: { simpleText: title },
          subtitle: { simpleText: subtitle },
          serviceEndpoint: {
            commandExecutorCommand: { commands: [{ customAction: { action: action, parameters: parameters } }] }
          }
        }
      };
      if (icon) item.compactLinkRenderer.secondaryIcon = { iconType: icon };
      return item;
    }
    var items = OPTIONS.map(function (name) {
      return row(text(name), text(name + 'Hint'), 'LUDA_TOGGLE', [name],
        checked(name) ? 'CHECK_BOX' : 'CHECK_BOX_OUTLINE_BLANK');
    });
    items.push(row(text('sleepTimer'), sleepLabel(), 'LUDA_SLEEP', []));
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
      var reload = toggle(name);
      if (name === 'silentPreviews') quietAll();
      showMenu(OPTIONS.indexOf(name), true);
      if (reload) setTimeout(function () { location.reload(); }, 700);
    } else if (action.action === 'LUDA_SLEEP') {
      setSleep((sleep.step + 1) % SLEEP_STEPS.length);
      showMenu(SLEEP_ROW, true);
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
    try { filterResponse(result); } catch (e) { /* the same */ }
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
