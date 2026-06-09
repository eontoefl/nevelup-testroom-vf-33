# ================================================
# serve.ps1 - simple static file server for localhost preview
# usage: powershell -ExecutionPolicy Bypass -File scripts\serve.ps1 [-Port 8000]
# stop : Ctrl + C
# ================================================
param(
    [int]$Port = 8000
)

$root = (Resolve-Path "$PSScriptRoot\..").Path
$prefix = "http://localhost:$Port/"

$mime = @{
    ".html" = "text/html; charset=utf-8";
    ".js"   = "application/javascript; charset=utf-8";
    ".css"  = "text/css; charset=utf-8";
    ".json" = "application/json; charset=utf-8";
    ".png"  = "image/png";
    ".jpg"  = "image/jpeg";
    ".jpeg" = "image/jpeg";
    ".gif"  = "image/gif";
    ".svg"  = "image/svg+xml";
    ".ico"  = "image/x-icon";
    ".mp3"  = "audio/mpeg";
    ".woff" = "font/woff";
    ".woff2"= "font/woff2";
    ".ttf"  = "font/ttf";
    ".map"  = "application/json";
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
    $listener.Start()
} catch {
    Write-Host "server start failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "==================================================" -ForegroundColor Green
Write-Host " static server running" -ForegroundColor Green
Write-Host " root: $root" -ForegroundColor Green
Write-Host " url : $prefix" -ForegroundColor Cyan
Write-Host " stop: Ctrl + C" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Green

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
    } catch {
        break
    }
    $req = $context.Request
    $res = $context.Response

    try {
        $relPath = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart("/"))
        if ([string]::IsNullOrWhiteSpace($relPath)) { $relPath = "index.html" }

        $fullPath = Join-Path $root $relPath
        if (Test-Path $fullPath -PathType Container) {
            $fullPath = Join-Path $fullPath "index.html"
        }

        if (Test-Path $fullPath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
            $ct = $mime[$ext]
            if (-not $ct) { $ct = "application/octet-stream" }
            $res.ContentType = $ct
            $res.Headers.Add("Cache-Control", "no-store")
            $bytes = [System.IO.File]::ReadAllBytes($fullPath)
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host ("200  /" + $relPath)
        } else {
            $res.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: " + $relPath)
            $res.OutputStream.Write($msg, 0, $msg.Length)
            Write-Host ("404  /" + $relPath) -ForegroundColor DarkYellow
        }
    } catch {
        try { $res.StatusCode = 500 } catch {}
        Write-Host ("500  " + $_.Exception.Message) -ForegroundColor Red
    } finally {
        try { $res.OutputStream.Close() } catch {}
    }
}

$listener.Stop()
