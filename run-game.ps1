# Starts Python http.server and opens the browser only after the port is accepting connections.
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

$port = 8765

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Python was not found in PATH."
    Write-Host "Install from https://www.python.org/ and enable 'Add python.exe to PATH'."
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Starting server on port $port ..."
Write-Host "A second window will stay open — leave it open while you play. Close it to stop the server."
Write-Host ""

$workDir = $PSScriptRoot
Start-Process cmd.exe -ArgumentList @(
    "/k",
    "cd /d `"$workDir`" && title Dungeon Crawler server && python -m http.server $port"
)

$listening = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.ReceiveTimeout = 500
        $client.SendTimeout = 500
        $client.Connect("127.0.0.1", $port)
        $client.Close()
        $listening = $true
        break
    } catch {
        Start-Sleep -Milliseconds 250
    }
}

if ($listening) {
    Start-Process "http://127.0.0.1:$port/"
    Write-Host "Browser opened: http://127.0.0.1:$port/"
} else {
    Write-Host "WARNING: The server did not respond on port $port in time."
    Write-Host "Check the 'Dungeon Crawler server' window for Python errors (wrong folder, port in use, etc.)."
    Write-Host "If you see 'Address already in use', close the other program or change the port in run-game.ps1."
    Start-Process "http://127.0.0.1:$port/"
}

Write-Host ""
Read-Host "Press Enter to close this helper (the server keeps running in the other window)"
