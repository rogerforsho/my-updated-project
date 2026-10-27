# Prompts for the production DB password (hidden), builds the pooler URL, runs the rebuild.
# Usage: powershell -File scripts\run-production-rebuild.ps1 [-Backup D:\CDM-OJT-backup-final]
param([string]$Backup = 'D:\CDM-OJT-backup-final')
$ref = 'jhslfwczxkdhexjgssjr'
$region = 'aws-0-ap-southeast-1'
$required = 'roles.sql', 'auth_schema.sql', 'schema.sql', 'storage_schema.sql', 'history_schema.sql', 'history_data.sql', 'data.sql'
foreach ($name in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $Backup $name) -PathType Leaf)) {
    Write-Error "Backup is missing $name in $Backup. Supply the path to a verified, fresh backup folder."
    exit 1
  }
}
$secure = Read-Host "Database password for $ref (hidden; reset it in the Supabase dashboard if unsure)" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if (-not $plain) { Write-Host 'No password entered.'; exit 1 }
$env:REBUILD_DB_URL = "postgresql://postgres.${ref}:$([uri]::EscapeDataString($plain))@${region}.pooler.supabase.com:5432/postgres"
try {
  node "$PSScriptRoot\rebuild-database.cjs" --mode production --backup $Backup --project-ref $ref
} finally {
  Remove-Item Env:REBUILD_DB_URL -ErrorAction SilentlyContinue
}
