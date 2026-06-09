#!/usr/bin/env bash
set -euo pipefail

workdir=/usr/local/apisix-dashboard
cd "$workdir"

mkdir -p logs output/conf output/dag-to-lua

if [ ! -f output/dag-to-lua/dag-to-lua.lua ]; then
  tmpdir="$(mktemp -d)"
  wget -q https://github.com/api7/dag-to-lua/archive/v1.1.tar.gz -P "$tmpdir"
  tar -zxf "$tmpdir/v1.1.tar.gz" -C "$tmpdir"
  cp -r "$tmpdir/dag-to-lua-1.1/lib/"* output/dag-to-lua/
  rm -rf "$tmpdir"
fi

if [ ! -d web/node_modules/.bin ]; then
  cd "$workdir/web"
  yarn install
fi

need_web_build=false
if [ ! -f "$workdir/output/html/index.html" ]; then
  need_web_build=true
elif find "$workdir/web/src" "$workdir/web/config" "$workdir/web/package.json" "$workdir/web/yarn.lock" -newer "$workdir/output/html/index.html" -print -quit | grep -q .; then
  need_web_build=true
fi

if [ "$need_web_build" = "true" ]; then
  cd "$workdir/web"
  yarn copy-folder monaco-editor ./public/
  NODE_OPTIONS="--max_old_space_size=${DASHBOARD_NODE_MAX_OLD_SPACE_SIZE:-4096}" ./node_modules/.bin/umi build
fi

if [ ! -e "$workdir/html" ]; then
  ln -s output/html "$workdir/html"
fi

cd "$workdir/api"

version="$(cat VERSION)"
hash="$(git -C "$workdir" rev-parse --short HEAD 2>/dev/null || echo local)"
goldflags="-X github.com/apisix/manager-api/internal/utils.version=${version} -X github.com/apisix/manager-api/internal/utils.gitHash=${hash}"

export ENV=local

exec go run -ldflags "$goldflags" ./main.go -p "$workdir"
