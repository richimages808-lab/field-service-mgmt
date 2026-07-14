# deploy.ps1 - DispatchBox Deployment Script
# Usage: .\deploy.ps1 [--staging] [--skip-build] [--functions] [--rules]
#
# This script automates the full build-and-deploy pipeline:
#   1. Builds the frontend (npm run build)
#   2. Copies dist/ to firebase/public/
#   3. Deploys to Firebase Hosting
#
# Flags:
#   --staging      Deploy to the STAGING project (default is production)
#   --skip-build   Skip the npm build step (use existing dist/)
#   --functions    Also deploy Cloud Functions
#   --rules        Also deploy Firestore + Storage rules

param(
    [switch]$Staging,
    [switch]$SkipBuild,
    [switch]$Functions,
    [switch]$Rules
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$FrontendDir = Join-Path $ProjectRoot "frontend\web"
$DistDir     = Join-Path $FrontendDir "dist"
$FirebaseDir = Join-Path $ProjectRoot "firebase"
$PublicDir   = Join-Path $FirebaseDir "public"

# ── Determine target environment ──
if ($Staging) {
    $envName = "STAGING"
    $envColor = "Magenta"
    $buildMode = "staging"
    $firebaseAlias = "staging"
} else {
    $envName = "PRODUCTION"
    $envColor = "Red"
    $buildMode = "production"
    $firebaseAlias = "default"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DispatchBox $envName Deploy" -ForegroundColor $envColor
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── Production safety prompt ──
if (-not $Staging) {
    Write-Host "WARNING: You are deploying to PRODUCTION!" -ForegroundColor Red
    $confirm = Read-Host "  Type 'yes' to continue"
    if ($confirm -ne "yes") {
        Write-Host "Deploy cancelled." -ForegroundColor Yellow
        exit 0
    }
    Write-Host ""
}

# ── Step 0: Switch Firebase project ──
Write-Host "[0/3] Switching to Firebase project: $firebaseAlias" -ForegroundColor Yellow
Push-Location $FirebaseDir
try {
    npx firebase use $firebaseAlias
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to switch Firebase project!" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Using project alias: $firebaseAlias" -ForegroundColor Green
} finally {
    Pop-Location
}

# ── Step 1: Build ──
if (-not $SkipBuild) {
    Write-Host "[1/3] Building frontend (mode: $buildMode)..." -ForegroundColor Yellow
    Push-Location $FrontendDir
    try {
        npx vite build --mode $buildMode
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Build failed! Aborting deploy." -ForegroundColor Red
            exit 1
        }
        Write-Host "  Build succeeded." -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[1/3] Skipping build (--skip-build flag)" -ForegroundColor DarkGray
}

# ── Step 2: Copy dist → firebase/public ──
Write-Host "[2/3] Syncing build output to firebase/public..." -ForegroundColor Yellow

if (-not (Test-Path $DistDir)) {
    Write-Host "ERROR: dist/ directory not found at $DistDir" -ForegroundColor Red
    Write-Host "  Run 'npm run build' in frontend/web first." -ForegroundColor Red
    exit 1
}

# Verify dist has an index.html (sanity check)
if (-not (Test-Path (Join-Path $DistDir "index.html"))) {
    Write-Host "ERROR: dist/index.html not found - build may have failed." -ForegroundColor Red
    exit 1
}

$distFileCount = (Get-ChildItem $DistDir -Recurse -File).Count
Write-Host "  dist/ contains $distFileCount files" -ForegroundColor DarkGray

# Clear and copy
if (Test-Path $PublicDir) {
    Remove-Item -Path "$PublicDir\*" -Recurse -Force
} else {
    New-Item -ItemType Directory -Path $PublicDir -Force | Out-Null
}
Copy-Item -Path "$DistDir\*" -Destination $PublicDir -Recurse -Force

$publicFileCount = (Get-ChildItem $PublicDir -Recurse -File).Count
Write-Host "  Copied $publicFileCount files to firebase/public/" -ForegroundColor Green

if ($distFileCount -ne $publicFileCount) {
    Write-Host ("WARNING: File count mismatch (dist={0}, public={1})" -f $distFileCount, $publicFileCount) -ForegroundColor Yellow
}

# ── Step 3: Deploy ──
Write-Host "[3/3] Deploying to Firebase ($envName)..." -ForegroundColor Yellow

$deployTargets = @("hosting")
if ($Functions) { $deployTargets += "functions" }
if ($Rules) { $deployTargets += "firestore"; $deployTargets += "storage" }

$deployOnly = $deployTargets -join ","

Push-Location $FirebaseDir
try {
    npx firebase deploy --only $deployOnly
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Firebase deploy failed!" -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

# ── Done ──
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  $envName deploy complete!" -ForegroundColor Green
if ($Staging) {
    Write-Host "  https://dispatch-box-sb.web.app" -ForegroundColor Green
} else {
    Write-Host "  https://maintenancemanager-c5533.web.app" -ForegroundColor Green
}
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Switch back to default (production) project after staging deploy
if ($Staging) {
    Push-Location $FirebaseDir
    npx firebase use default 2>$null
    Pop-Location
}
