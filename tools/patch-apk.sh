#!/usr/bin/env bash
# Wraps an official TizenTube Cobalt APK so it loads the Luda overlay loader first.
# The only change is the address the app loads its script from; the loader then loads
# TizenTube's own script from its usual place, so TizenTube's features keep updating.
#
#   tools/patch-apk.sh official.apk patched.apk
#
# Needs: unzip, zip, python3, and zipalign + apksigner from Android build-tools.
# Signing key: $LUDA_KEYSTORE (default: the Android debug key Luda TV's debug builds use).
set -euo pipefail

in="${1:?official apk}"; out="${2:?output apk}"
needle='https://cdn.jsdelivr.net/npm/@foxreis/tizentube/dist/userScript.js?v='
# Same length as the original address, so nothing else in the file moves.
loader="${LUDA_LOADER_URL:-https://cdn.jsdelivr.net/gh/Denmokin/luda-overlay@main/loader.js?a&v=}"
keystore="${LUDA_KEYSTORE:-$HOME/.config/.android/debug.keystore}"
storepass="${LUDA_KEYSTORE_PASS:-android}"
tools="${ANDROID_BUILD_TOOLS:-$(ls -d "${ANDROID_HOME:-$HOME/Android/Sdk}"/build-tools/* | sort -V | tail -1)}"

[ "${#needle}" -eq "${#loader}" ] || { echo "loader address must be ${#needle} characters, got ${#loader}" >&2; exit 3; }

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
cp "$in" "$work/app.apk"
lib="$(unzip -Z1 "$work/app.apk" | grep -E '^lib/[^/]+/libchrobalt\.so$' || true)"
[ -n "$lib" ] || { echo "no libchrobalt.so in $in" >&2; exit 3; }

( cd "$work" && unzip -q app.apk $lib )
for so in $lib; do
  python3 - "$work/$so" "$needle" "$loader" <<'PY'
import sys
path, needle, loader = sys.argv[1], sys.argv[2].encode(), sys.argv[3].encode()
data = open(path, 'rb').read()
count = data.count(needle)
if count != 1:
    sys.exit(f"expected the script address once in {path}, found it {count} times")
open(path, 'wb').write(data.replace(needle, loader))
PY
done
# Libraries stay uncompressed and page-aligned, as the app expects.
( cd "$work" && zip -q -0 -X app.apk $lib && zip -q -d app.apk 'META-INF/*.SF' 'META-INF/*.RSA' 'META-INF/*.DSA' 'META-INF/MANIFEST.MF' >/dev/null 2>&1 || true )
"$tools/zipalign" -p -f 4 "$work/app.apk" "$work/aligned.apk"
"$tools/apksigner" sign --ks "$keystore" --ks-pass "pass:$storepass" --out "$out" "$work/aligned.apk"
"$tools/apksigner" verify "$out"
echo "patched: $out"
