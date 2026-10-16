<#
.SYNOPSIS
  Prepares the SSO bridge verifier wallet and records its DID in the root .env.

.DESCRIPTION
  Obtains a client-credentials token for the heka-sso-service client from Keycloak or Auth0,
  calls POST /prepare-wallet on the identity service and writes the returned DID to
  SSO_SERVICE_IDENTITY_SERVICE_PUBLIC_VERIFIER_ID and SSO_SERVICE_IDENTITY_SERVICE_REQUEST_SIGNER_DID.

  The token URL, client id, secret and token params are read from the SSO_SERVICE_IDENTITY_SERVICE_*
  lines of the .env, active or commented out, picking the block whose TOKEN_URL belongs to the
  provider (/realms/ for Keycloak, auth0.com for Auth0). host.docker.internal is replaced with localhost.

.EXAMPLE
  ./docker/prepare-sso-verifier.ps1 -Provider keycloak

.EXAMPLE
  ./docker/prepare-sso-verifier.ps1 -Provider auth0 -NoUpdate
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('keycloak', 'auth0')]
  [string]$Provider,

  [string]$IdentityServiceUrl = 'http://localhost:3000',

  [string]$EnvFile = (Join-Path $PSScriptRoot '..\.env'),

  # Print the DID without writing it to the .env
  [switch]$NoUpdate
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $EnvFile)) { throw "Env file not found: $EnvFile" }
$EnvFile = (Resolve-Path $EnvFile).Path
$content = [IO.File]::ReadAllText($EnvFile)

# Group the SSO token settings into blocks, each starting at a TOKEN_URL line
$blocks = @()
$current = $null
foreach ($line in ($content -split "\r?\n")) {
  if ($line -match '^\s*#?\s*SSO_SERVICE_IDENTITY_SERVICE_(TOKEN_URL|CLIENT_ID|CLIENT_SECRET|TOKEN_PARAMS)=(.*)$') {
    $key = $Matches[1]
    $value = $Matches[2].Trim()
    if ($key -eq 'TOKEN_URL') {
      $current = @{ TOKEN_URL = $value }
      $blocks += $current
    } elseif ($current) {
      $current[$key] = $value
    }
  }
}

$pattern = if ($Provider -eq 'keycloak') { '/realms/' } else { 'auth0\.com' }
$config = $blocks | Where-Object { $_.TOKEN_URL -match $pattern } | Select-Object -First 1
if (-not $config) { throw "No SSO_SERVICE_IDENTITY_SERVICE_TOKEN_URL for $Provider found in $EnvFile" }
if (-not $config.CLIENT_ID -or -not $config.CLIENT_SECRET -or $config.CLIENT_SECRET -match '^<') {
  throw "Client id or secret for $Provider is missing in $EnvFile"
}

$tokenUrl = $config.TOKEN_URL -replace 'host\.docker\.internal', 'localhost'
$tokenBody = @{
  grant_type    = 'client_credentials'
  client_id     = $config.CLIENT_ID
  client_secret = $config.CLIENT_SECRET
}
if ($config.TOKEN_PARAMS) {
  $params = $config.TOKEN_PARAMS | ConvertFrom-Json
  foreach ($p in $params.PSObject.Properties) { $tokenBody[$p.Name] = [string]$p.Value }
}

Write-Host "Requesting a token for $($config.CLIENT_ID) from $tokenUrl"
$token = Invoke-RestMethod -Method Post -Uri $tokenUrl -ContentType 'application/x-www-form-urlencoded' -Body $tokenBody

Write-Host "Preparing the wallet at $IdentityServiceUrl/prepare-wallet"
try {
  $prepared = Invoke-RestMethod -Method Post -Uri "$($IdentityServiceUrl.TrimEnd('/'))/prepare-wallet" `
    -Headers @{ Authorization = "Bearer $($token.access_token)" } -ContentType 'application/json' -Body '{}'
} catch {
  if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) {
    throw "Identity service rejected the $Provider token (401: $($_.ErrorDetails.Message)). Is it running with the $Provider IDENTITY_SERVICE_OIDC_* settings?"
  }
  throw
}
$did = $prepared.did
if (-not $did) { throw "prepare-wallet returned no DID: $($prepared | ConvertTo-Json -Compress)" }

Write-Host "Verifier DID: $did" -ForegroundColor Green

if ($NoUpdate) { return }

foreach ($name in 'SSO_SERVICE_IDENTITY_SERVICE_PUBLIC_VERIFIER_ID', 'SSO_SERVICE_IDENTITY_SERVICE_REQUEST_SIGNER_DID') {
  $regex = "(?m)^$name=.*?(?=\r?$)"
  if ($content -match $regex) {
    $content = [regex]::Replace($content, $regex, "$name=$did")
  } else {
    $content = $content.TrimEnd("`r", "`n") + "`n$name=$did`n"
  }
}
[IO.File]::WriteAllText($EnvFile, $content, (New-Object Text.UTF8Encoding $false))

Write-Host "Updated $EnvFile"
Write-Host 'Apply it with: docker compose up -d heka-sso-service (add --profile keycloak when using Keycloak)'
