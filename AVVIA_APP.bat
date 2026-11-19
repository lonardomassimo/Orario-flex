@echo off
title Avvio Server Orario Flex PWA
cd /d "%~dp0"
echo ========================================================
echo        AVVIO DI ORARIO FLEX (PWA PC E SMARTPHONE)
echo ========================================================
echo.
echo 1. Da questo PC:
echo    Apri il browser su: http://localhost:8080
echo.
echo 2. Dal tuo Smartphone (stessa rete Wi-Fi):
echo    Apri Chrome sul telefono e vai su:
echo    http://172.30.52.42:8080
echo.
echo    Poi tocca i 3 puntini in alto a destra e seleziona:
echo    "Installa applicazione" o "Aggiungi a schermata Home"
echo ========================================================
echo.
powershell -Command "$listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add('http://*:8080/'); try { $listener.Start() } catch { Write-Host 'Porta 8080 occupata o richiede avvio come amministratore, tento su porta 8888...'; $listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add('http://*:8888/'); $listener.Start() }; Write-Host 'Server attivo in ascolto. Premi CTRL+C per chiudere.'; while ($listener.IsListening) { $context = $listener.GetContext(); $request = $context.Request; $response = $context.Response; $urlPath = $request.Url.LocalPath; if ($urlPath -eq '/') { $urlPath = '/index.html' }; $filePath = Join-Path (Get-Location) ($urlPath.TrimStart('/')); if (Test-Path $filePath -PathType Leaf) { $bytes = [System.IO.File]::ReadAllBytes($filePath); $ext = [System.IO.Path]::GetExtension($filePath); $mime = switch ($ext) { '.html' {'text/html; charset=utf-8'} '.js' {'application/javascript; charset=utf-8'} '.json' {'application/json; charset=utf-8'} '.css' {'text/css'} '.png' {'image/png'} default {'application/octet-stream'} }; $response.ContentType = $mime; $response.ContentLength64 = $bytes.Length; $response.OutputStream.Write($bytes, 0, $bytes.Length) } else { $response.StatusCode = 404 }; $response.OutputStream.Close() }"
pause
