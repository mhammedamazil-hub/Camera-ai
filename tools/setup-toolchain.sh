#!/usr/bin/env bash
# Toolchain bootstrap for the cinematic-3d pipeline in a headless Linux sandbox.
#
# The skill assumes `ffmpeg` on PATH and lets Remotion download its own
# chrome-headless-shell from remotion.media. On this machine that download is
# blocked, so we fetch an equivalent Chromium from npm and make it cold-startable.
#
# Everything lands outside the repository except the small wrapper scripts:
#   /usr/local/bin/ffmpeg         ← imageio-ffmpeg wheel (PyPI)
#   $BROWSER_DIR/chrome      <- @sparticuz/chromium (npm)
#   $BROWSER_DIR/chrome-wrap <- adds --enable-unsafe-swiftshader
#
# After running this, render like this:
#   export CINE_BROWSER=$BROWSER_DIR/chrome-wrap
#   export CINE_GL=swangle
#   export LD_LIBRARY_PATH=$BROWSER_DIR/lib
#   node <skill>/scripts/render.mjs --final
set -euo pipefail

BROWSER_DIR=${BROWSER_DIR:-$HOME/cine-browser}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "== ffmpeg (PyPI: imageio-ffmpeg bundles a static build) =="
pip install --break-system-packages --no-input imageio-ffmpeg >/dev/null 2>&1 || \
  pip install --no-input imageio-ffmpeg >/dev/null
FFMPEG_BIN=$(python3 -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())")
ln -sf "$FFMPEG_BIN" /usr/local/bin/ffmpeg
ffmpeg -version | head -1

echo "== chromium (npm: @sparticuz/chromium ships a headless build) =="
mkdir -p "$BROWSER_DIR/lib"
cd "$TMP"
npm init -y >/dev/null 2>&1
npm install --no-audit --no-fund @sparticuz/chromium >/dev/null 2>&1
PKG="$TMP/node_modules/@sparticuz/chromium"

node -e '
const fs = require("fs"), zlib = require("zlib");
const pkg = process.argv[1];
fs.writeFileSync("/tmp/chromium.bin", zlib.brotliDecompressSync(fs.readFileSync(pkg + "/bin/chromium.br")));
for (const name of ["al2023.tar.br", "swiftshader.tar.br"]) {
  if (fs.existsSync(pkg + "/bin/" + name))
    fs.writeFileSync("/tmp/" + name.replace(".br", ""), zlib.brotliDecompressSync(fs.readFileSync(pkg + "/bin/" + name)));
}
' "$PKG"

mv /tmp/chromium.bin "$BROWSER_DIR/chrome"
chmod +x "$BROWSER_DIR/chrome"
if [ -f /tmp/al2023.tar ]; then
  tar -xf /tmp/al2023.tar -C "$BROWSER_DIR/lib"
  # the Chromium build tarballs ship their libs under a nested lib/
  [ -d "$BROWSER_DIR/lib/lib" ] && mv "$BROWSER_DIR"/lib/lib/* "$BROWSER_DIR/lib/" && rmdir "$BROWSER_DIR/lib/lib"
fi
[ -f /tmp/swiftshader.tar ] && tar -xf /tmp/swiftshader.tar -C "$BROWSER_DIR"

# Chromium 140+ refuses software WebGL without this flag, and Remotion's
# "swangle" backend does not pass it, so we wrap the binary.
cat > "$BROWSER_DIR/chrome-wrap" <<WRAP
#!/bin/sh
exec $BROWSER_DIR/chrome --enable-unsafe-swiftshader --no-sandbox "\$@"
WRAP
chmod +x "$BROWSER_DIR/chrome-wrap"

LD_LIBRARY_PATH="$BROWSER_DIR/lib" "$BROWSER_DIR/chrome" --version

cat <<'MSG'

Done. Add these to your shell before rendering:

  export CINE_BROWSER=$BROWSER_DIR/chrome-wrap
  export CINE_GL=swangle
  export LD_LIBRARY_PATH=$BROWSER_DIR/lib

Then:  node <skill>/scripts/doctor.mjs
MSG
