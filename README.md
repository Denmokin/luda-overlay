# Luda overlay

A small add-on that runs on top of [TizenTube](https://github.com/reisxd/TizenTube) on Android TV. It adds a few household features without copying or changing TizenTube itself, so TizenTube's own features keep updating exactly as before.

> **Status: early.** The loader works. The features below are being built and are marked with what is true today.

## Features

| Feature | What it does | Status |
|---|---|---|
| Language that sticks | Makes the app's own Language setting take effect | In progress |
| A language for each account | Each signed-in account keeps its own interface language | Planned |
| Settings for each account | Each account keeps its own TizenTube settings | Planned |
| Silent previews | Previews play while you browse, with the sound off | Planned |
| Luda menu | One extra entry in Settings for the options above | Planned |

## How it works

```
TizenTube app (official release, wrapped)
        │  loads one script address
        ▼
   loader.js  ──►  TizenTube's own script, from its usual address, always the latest
        │
        └──────►  overlay.js, the add-on in this repository
```

TizenTube's app loads its script from a single address. A wrapped copy of the app has that one address changed to `loader.js` from this repository; nothing else in the app is touched. The loader then does two things, in order:

1. It loads TizenTube's script from where TizenTube publishes it.
2. It loads `overlay.js`, which adds the features in the table.

Because TizenTube's script is never copied here, there is nothing to keep in step with it.

## Updates

| What | How it updates |
|---|---|
| TizenTube's features | By themselves at every start, as in the official app |
| This add-on | By itself, a few hours after a change lands here |
| The app itself | Each new TizenTube release has to be wrapped again with `tools/patch-apk.sh` |

A wrapped app is signed with your own key, so:

- it can replace the official app only after uninstalling it, which signs every account out once;
- TizenTube's built-in app updater can no longer install new versions over it.

## Wrapping a TizenTube release

You need `unzip`, `zip`, `python3`, a JDK, and `zipalign` and `apksigner` from the Android build-tools.

```bash
tools/patch-apk.sh cobalt-arm.apk tizentube-luda-arm.apk
adb uninstall io.gh.reisxd.tizentube.cobalt
adb install tizentube-luda-arm.apk
```

The script stops without changing anything if the address is not found exactly once, which is what will happen if a future TizenTube release moves it.

## Files

| File | Purpose |
|---|---|
| `loader.js` | Loaded by the wrapped app; loads TizenTube, then the add-on |
| `overlay.js` | The add-on |
| `dev.js` | A loader for development only. It takes the add-on from a server on the TV's own address and runs commands from it. Do not wrap an everyday app with it |
| `tools/patch-apk.sh` | Wraps an official TizenTube release |

## Credits

All the heavy lifting is TizenTube's, by Reis Can and its contributors. This project only adds to it and is not affiliated with TizenTube, with Google, or with the video service the app shows.
