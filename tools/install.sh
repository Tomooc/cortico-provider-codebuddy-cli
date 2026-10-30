#!/usr/bin/env sh
# 把 cortico-provider-codebuddy-cli 装进 Coopanion 的扩展目录（macOS / Linux / WSL）。
# 依赖登记为 file: 本地链接，绝不查 npm registry。
#
# 用法：
#   sh tools/install.sh
#   COOPANION_DATA=/path/to/Coopanion/data sh tools/install.sh
set -eu

package_name='cortico-provider-codebuddy-cli'
package_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

if [ ! -f "$package_dir/package.json" ]; then
  echo "找不到包根目录: $package_dir" >&2
  exit 1
fi

data_dir=${COOPANION_DATA:-}
if [ -z "$data_dir" ]; then
  for candidate in \
    "$HOME/Library/Application Support/Coopanion/data" \
    "$HOME/.local/share/Coopanion/data" \
    "$HOME/Coopanion/data"
  do
    if [ -d "$candidate" ]; then data_dir=$candidate; break; fi
  done
fi
if [ -z "$data_dir" ] || [ ! -d "$data_dir" ]; then
  echo '没找到 Coopanion 数据目录；请设置 COOPANION_DATA 指向 <Coopanion>/data' >&2
  exit 1
fi

extensions="$data_dir/extensions"
vendor="$extensions/vendor/$package_name"
installed="$extensions/node_modules/$package_name"
manifest="$extensions/package.json"

mkdir -p "$vendor" "$installed"
cp -R "$package_dir/." "$vendor/"
cp -R "$package_dir/." "$installed/"
echo '已复制包到 vendor/ 与 node_modules/'

if [ ! -f "$manifest" ]; then
  printf '%s\n' '{"name":"cortico-extensions","private":true,"dependencies":{}}' > "$manifest"
fi
cp "$manifest" "$manifest.bak-$(date +%Y%m%d-%H%M%S)"

if command -v node >/dev/null 2>&1; then
  node - "$manifest" "$package_name" "file:./vendor/$package_name" <<'NODE'
const fs = require('node:fs')
const [file, name, spec] = process.argv.slice(2)
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
pkg.dependencies = { ...(pkg.dependencies || {}), [name]: spec }
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
NODE
  echo "依赖已登记: $package_name = file:./vendor/$package_name"
else
  echo "警告: 没有 node，未自动登记依赖；请在 $manifest 的 dependencies 里加 \"$package_name\": \"file:./vendor/$package_name\"" >&2
fi

echo '完成。重启 Coopanion（或 POST /api/run/restart），再到「设置 → 模型端点」新建 CodeBuddy CLI 端点。'
