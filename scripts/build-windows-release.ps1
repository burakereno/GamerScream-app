$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Contract = @{}
Get-Content (Join-Path $RootDir ".github/release-contract.env") | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') {
        $Contract[$Matches[1]] = $Matches[2]
    }
}

$Version = $env:APP_VERSION
$BuildNumber = $env:APP_BUILD_NUMBER
$ArtifactsDir = if ($env:ARTIFACTS_DIR) { $env:ARTIFACTS_DIR } else { Join-Path $RootDir ".release-assets/windows" }

if ($Contract["WINDOWS_SIGNING"] -cne "unsigned") {
    throw "The release contract must explicitly select unsigned Windows artifacts."
}

if ($Version -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') {
    throw "APP_VERSION must be a valid three-part semantic version."
}
if ($BuildNumber -notmatch '^[1-9]\d*$') {
    throw "APP_BUILD_NUMBER must be a positive integer."
}

$BuildOutput = Join-Path $RootDir ".build/electron-windows"
$InstallerName = "GamerScream-Setup.exe"
$BlockmapName = "$InstallerName.blockmap"

try {
    $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
    $env:VITE_SERVER_URL = $Contract["PUBLIC_SERVER_URL"]

    if (Test-Path $BuildOutput) { Remove-Item -Recurse -Force $BuildOutput }
    New-Item -ItemType Directory -Path $BuildOutput -Force | Out-Null
    & pnpm --dir $RootDir --filter desktop exec electron-vite build
    if ($LASTEXITCODE -ne 0) { throw "electron-vite build failed." }

    Push-Location (Join-Path $RootDir "apps/desktop")
    try {
        & pnpm exec electron-builder `
            --win nsis `
            --x64 `
            --publish never `
            "-c.directories.output=$BuildOutput" `
            "-c.extraMetadata.version=$Version" `
            "-c.buildVersion=$BuildNumber" `
            "-c.appId=$($Contract['BUNDLE_IDENTIFIER'])"
        if ($LASTEXITCODE -ne 0) { throw "electron-builder failed." }
    }
    finally {
        Pop-Location
    }

    $Installer = Join-Path $BuildOutput $InstallerName
    $Blockmap = Join-Path $BuildOutput $BlockmapName
    $Feed = Join-Path $BuildOutput "latest.yml"
    $UpdateConfig = Join-Path $BuildOutput "win-unpacked/resources/app-update.yml"
    foreach ($Path in @($Installer, $Blockmap, $Feed, $UpdateConfig)) {
        if (-not (Test-Path $Path -PathType Leaf)) { throw "Missing Windows release asset: $Path" }
    }
    $UpdateConfigLines = Get-Content $UpdateConfig
    foreach ($ExpectedLine in @(
        "provider: github",
        "owner: $($Contract['GITHUB_OWNER'])",
        "repo: $($Contract['GITHUB_REPO'])"
    )) {
        if ($UpdateConfigLines -cnotcontains $ExpectedLine) {
            throw "Bundled updater configuration mismatch."
        }
    }

    $Signature = Get-AuthenticodeSignature -FilePath $Installer
    if ($Signature.Status -ne [Management.Automation.SignatureStatus]::NotSigned) {
        throw "Windows installer must match the explicit unsigned release policy: $($Signature.Status)"
    }

    $FeedText = Get-Content $Feed -Raw
    if ($FeedText -notmatch [regex]::Escape("path: $InstallerName")) { throw "latest.yml path mismatch." }
    if ($FeedText -notmatch 'sha512:\s+\S+') { throw "latest.yml SHA-512 is missing." }
    if ($FeedText -notmatch 'size:\s+\d+') { throw "latest.yml size is missing." }

    if (Test-Path $ArtifactsDir) { Remove-Item -Recurse -Force $ArtifactsDir }
    New-Item -ItemType Directory -Path $ArtifactsDir -Force | Out-Null
    Copy-Item $Installer, $Blockmap, $Feed -Destination $ArtifactsDir
    Write-Output "Verified unsigned Windows release assets: $ArtifactsDir"
}
finally {
    Remove-Item Env:CSC_IDENTITY_AUTO_DISCOVERY -ErrorAction SilentlyContinue
}
