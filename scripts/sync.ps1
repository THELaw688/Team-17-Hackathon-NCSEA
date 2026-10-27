<#
.SYNOPSIS
    One command that pulls, commits everything, and pushes — so nothing gets left behind locally.

.DESCRIPTION
    Wraps the whole git loop the team uses so no one has to remember the individual commands or
    half-finish the sequence. Run it from anywhere; it locates the repo root itself.

    Order matters: pull first so you're building on everyone else's work, then commit, then push.

.PARAMETER Message
    The commit message. Required — write it in the imperative ("Add span validation").

.PARAMETER AllBranches
    Also push every local branch, not just the one you're on. Use when you've set up or updated
    several branches at once.

.PARAMETER Tags
    Also push tags.

.EXAMPLE
    .\scripts\sync.ps1 -Message "Add load calculation form"

.EXAMPLE
    .\scripts\sync.ps1 -Message "Set up project branches" -AllBranches -Tags
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Message,

    [switch]$AllBranches,

    [switch]$Tags
)

$ErrorActionPreference = 'Stop'

# Some AI coding tools disable git's credential prompts in their shell. Re-enable them so the
# GitHub sign-in can actually appear if credentials aren't cached yet.
$env:GIT_TERMINAL_PROMPT = '1'
$env:GCM_INTERACTIVE = 'auto'

# Work from the repo root regardless of where the script was called from.
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host "Repo:   $repoRoot"
Write-Host "Branch: $branch"
Write-Host ''

# --- 1. Pull ------------------------------------------------------------------------------------
# Always before committing: merging someone else's work into a clean tree is far easier than
# untangling it after a conflicted push.
Write-Host '==> Pulling latest...' -ForegroundColor Cyan
git pull
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host 'Pull failed — resolve this before committing. If it is a conflict, fix the files,' -ForegroundColor Red
    Write-Host 'then run this script again. Do not force-push.' -ForegroundColor Red
    exit 1
}

# --- 2. Stage and commit ------------------------------------------------------------------------
Write-Host ''
Write-Host '==> Staging all changes...' -ForegroundColor Cyan
git add -A

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host 'Nothing to commit — working tree clean.' -ForegroundColor Yellow
}
else {
    $staged | ForEach-Object { Write-Host "    $_" }

    # The team rule is that code changes ship with a changelog entry. Warn rather than block:
    # a typo fix genuinely does not need one, and a hard stop mid-hackathon helps nobody.
    if ($staged -notcontains 'CHANGELOG.md') {
        Write-Host ''
        Write-Host 'WARNING: CHANGELOG.md is not part of this commit.' -ForegroundColor Yellow
        Write-Host 'Team rule is to log what changed and why. Add an entry unless this is trivial.' -ForegroundColor Yellow
    }

    Write-Host ''
    Write-Host '==> Committing...' -ForegroundColor Cyan
    git commit -m $Message
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

# --- 3. Push ------------------------------------------------------------------------------------
Write-Host ''
Write-Host '==> Pushing...' -ForegroundColor Cyan
git push -u origin $branch
if ($LASTEXITCODE -ne 0) { exit 1 }

if ($AllBranches) {
    Write-Host ''
    Write-Host '==> Pushing all local branches...' -ForegroundColor Cyan
    git push origin --all
}

if ($Tags) {
    Write-Host ''
    Write-Host '==> Pushing tags...' -ForegroundColor Cyan
    git push origin --tags
}

Write-Host ''
Write-Host "Done. '$branch' is synced with GitHub." -ForegroundColor Green
