$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$mongoExe = "C:\Program Files\MongoDB\Server\4.2\bin\mongod.exe"
$mongoRoot = Join-Path $repoRoot ".local\mongo"
$dbPath = Join-Path $mongoRoot "db"
$logPath = Join-Path $mongoRoot "mongod.log"

function Test-MongoPort {
    try {
        $client = [System.Net.Sockets.TcpClient]::new()
        $connect = $client.BeginConnect("127.0.0.1", 27017, $null, $null)
        if (-not $connect.AsyncWaitHandle.WaitOne(1000)) {
            $client.Close()
            return $false
        }

        $client.EndConnect($connect)
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

if (-not (Test-Path $mongoExe)) {
    throw "mongod.exe was not found at $mongoExe. Install MongoDB Community Server or update this script."
}

New-Item -ItemType Directory -Force -Path $dbPath | Out-Null

$existing = Test-MongoPort
if ($existing) {
    Write-Host "MongoDB is already listening on 127.0.0.1:27017."
    exit 0
}

Start-Process `
    -FilePath $mongoExe `
    -ArgumentList @("--dbpath", $dbPath, "--bind_ip", "127.0.0.1", "--port", "27017", "--logpath", $logPath, "--logappend") `
    -WindowStyle Hidden

$deadline = (Get-Date).AddSeconds(20)
do {
    Start-Sleep -Milliseconds 500
    $listener = Test-MongoPort
    if ($listener) {
        Write-Host "MongoDB started on 127.0.0.1:27017."
        Write-Host "Data: $dbPath"
        Write-Host "Log:  $logPath"
        exit 0
    }
} while ((Get-Date) -lt $deadline)

throw "MongoDB did not start within 20 seconds. Check $logPath."
