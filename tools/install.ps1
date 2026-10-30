# 把 cortico-provider-codebuddy-cli 装进 Coopanion 的扩展目录。
# 依赖登记为 file: 本地链接，绝不查 npm registry（否则 pnpm 会 404 并把整次安装拖挂）。
#
# 用法：
#   pwsh -File tools/install.ps1
#   pwsh -File tools/install.ps1 -Program 'D:\Users\Windows\AppData\Local\Programs\Coopanion'
#   pwsh -File tools/install.ps1 -NoRestart
param(
  [string]$Program = '',
  [switch]$NoRestart
)

$ErrorActionPreference = 'Stop'
$packageName = 'cortico-provider-codebuddy-cli'
$packageDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not (Test-Path (Join-Path $packageDir 'package.json'))) {
  throw "找不到包根目录（应是 tools/ 的上一级）：$packageDir"
}

function Resolve-Coopanion([string]$explicit) {
  if ($explicit) {
    if (-not (Test-Path $explicit)) { throw "指定的目录不存在：$explicit" }
    return [pscustomobject]@{ program = (Resolve-Path $explicit).Path; data = (Join-Path (Resolve-Path $explicit).Path 'data') }
  }
  $pointer = Join-Path $env:LOCALAPPDATA 'Coopanion\data-location.json'
  if (Test-Path $pointer) {
    $info = Get-Content -Raw -Path $pointer | ConvertFrom-Json
    if ($info.program -and (Test-Path $info.program)) {
      $data = if ($info.data -and (Test-Path $info.data)) { $info.data } else { Join-Path $info.program 'data' }
      return [pscustomobject]@{ program = $info.program; data = $data }
    }
  }
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Coopanion'),
    (Join-Path $env:ProgramFiles 'Coopanion'),
    (Join-Path ${env:ProgramFiles(x86)} 'Coopanion')
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return [pscustomobject]@{ program = $candidate; data = (Join-Path $candidate 'data') }
    }
  }
  throw '未找到 Coopanion 安装目录；请用 -Program 指定。'
}

$found = Resolve-Coopanion $Program
$extensions = Join-Path $found.data 'extensions'
$vendor = Join-Path $extensions "vendor\$packageName"
$installed = Join-Path $extensions "node_modules\$packageName"
$manifestPath = Join-Path $extensions 'package.json'

Write-Host "Coopanion : $($found.program)"
Write-Host "数据目录  : $($found.data)"
Write-Host "扩展目录  : $extensions"

New-Item -ItemType Directory -Force -Path $extensions | Out-Null
New-Item -ItemType Directory -Force -Path $vendor | Out-Null
New-Item -ItemType Directory -Force -Path $installed | Out-Null
Copy-Item -Path (Join-Path $packageDir '*') -Destination $vendor -Recurse -Force
Copy-Item -Path (Join-Path $packageDir '*') -Destination $installed -Recurse -Force
Write-Host '已复制包到 vendor\ 与 node_modules\'

if (-not (Test-Path $manifestPath)) {
  '{"name":"cortico-extensions","private":true,"dependencies":{}}' | Set-Content -Path $manifestPath -Encoding UTF8
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item $manifestPath "$manifestPath.bak-$stamp" -Force

$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
if ($null -eq $manifest.dependencies) {
  $manifest | Add-Member -NotePropertyName 'dependencies' -NotePropertyValue ([pscustomobject]@{}) -Force
}
$spec = "file:./vendor/$packageName"
if ($manifest.dependencies.PSObject.Properties.Name -contains $packageName) {
  $manifest.dependencies.$packageName = $spec
} else {
  $manifest.dependencies | Add-Member -NotePropertyName $packageName -NotePropertyValue $spec
}
($manifest | ConvertTo-Json -Depth 12) | Set-Content -Path $manifestPath -Encoding UTF8
Write-Host "依赖已登记：$packageName = $spec（备份：package.json.bak-$stamp）"

if ($NoRestart) {
  Write-Host '已跳过重启；请手动重启 Coopanion，或 POST /api/run/restart。'
  exit 0
}

$port = 17788
$configPath = Join-Path $found.data 'home\companion\config.json'
if (Test-Path $configPath) {
  try {
    $config = Get-Content -Raw -Path $configPath | ConvertFrom-Json
    if ($config.web -and $config.web.port) { $port = [int]$config.web.port }
  } catch { }
}
try {
  $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/run/restart" -Method POST -ContentType 'application/json' -Body '{}' -TimeoutSec 120 -UseBasicParsing -ErrorAction Stop
  Write-Host "已请求重启：HTTP $($response.StatusCode)"
  Write-Host 'Core 重新起来后，在「设置 → 模型端点」新建一个 CodeBuddy CLI 端点即可。'
} catch {
  Write-Host "重启请求失败（$($_.Exception.Message)）；请手动重启 Coopanion。"
}
