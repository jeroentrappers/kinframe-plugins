#!/bin/sh
# Refreshes the frame's plugin host files that the kit runs plugins with, from a kinframe checkout:
#   kit/sync-host.sh ../kinframe
# Copies the prelude and the host libraries (the same JavaScript the frame runs), the view schema, types and
# examples, extracts the frame's words for ctx.format.day/ago/until, regenerates the kit's view schema and records
# the kinframe commit in kit/host/SOURCE. Review the diff and run the kit's tests before committing.
set -eu

src=${1:?usage: kit/sync-host.sh <path-to-kinframe>}
here=$(cd "$(dirname "$0")" && pwd)
host="$here/host"
assets="$src/android/frame/src/main/assets/plugin-host"
views="$src/docs/api/plugin-views"
res="$src/android/frame/src/main/res"

for p in "$assets/prelude.js" "$assets/lib" "$views/plugin-view.schema.json" "$res/values/strings_plugins.xml"; do
  [ -e "$p" ] || { echo "not a kinframe checkout: $p is missing" >&2; exit 1; }
done

mkdir -p "$host"
cp "$assets/prelude.js" "$host/prelude.js"
rm -rf "${host:?}/lib" && mkdir -p "$host/lib" && cp "$assets"/lib/*.js "$host/lib/"
rm -rf "${host:?}/views" && mkdir -p "$host/views" && cp -R "$views/." "$host/views/"
cp "$views/plugin-view.d.ts" "$here/types/plugin-view.d.ts"
node "$here/src/sync-words.mjs" "$res" > "$host/relative-words.json.tmp" && mv "$host/relative-words.json.tmp" "$host/relative-words.json"
node "$here/src/schema.mjs" --write

commit=$(git -C "$src" rev-parse HEAD 2>/dev/null || echo unknown)
dirty=""
if [ "$commit" != unknown ] && [ -n "$(git -C "$src" status --porcelain -- android/frame/src/main/assets/plugin-host docs/api/plugin-views "$res" 2>/dev/null)" ]; then
  dirty=" (with uncommitted changes)"
fi
cat > "$host/SOURCE" <<EOT
kinframe $commit$dirty
synced $(date -u +%Y-%m-%dT%H:%M:%SZ) by kit/sync-host.sh

prelude.js        android/frame/src/main/assets/plugin-host/prelude.js
lib/*.js          android/frame/src/main/assets/plugin-host/lib/
views/            docs/api/plugin-views/ (schema, types, examples, invalid)
relative-words    android/frame/src/main/res/values*/strings_plugins.xml (plugin_rel_*)
EOT
echo "synced from kinframe $commit$dirty"
