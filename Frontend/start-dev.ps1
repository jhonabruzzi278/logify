# Logify Frontend - Startup Script
# Ejecutar como Administrador si falla la conexión desde otro dispositivo

Write-Host "Logify Frontend Dev Server" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

# Abrir puerto en firewall (requiere admin)
try {
    $rule = Get-NetFirewallRule -DisplayName "Logify-Dev" -ErrorAction SilentlyContinue
    if (-not $rule) {
        New-NetFirewallRule -DisplayName "Logify-Dev" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Private | Out-Null
        Write-Host "[OK] Firewall: puerto 5173 abierto" -ForegroundColor Green
    } else {
        Write-Host "[OK] Firewall: regla ya existe" -ForegroundColor Green
    }
} catch {
    Write-Host "[!] Firewall: sin permisos de admin. Solo funcionara en localhost." -ForegroundColor Yellow
}

# IP local
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.InterfaceAlias -match "Wi-Fi|Ethernet" -and $_.IPAddress -notmatch "^169\.|^172\."
} | Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "Local:   http://localhost:5173" -ForegroundColor White
if ($ip) {
    Write-Host "Network: http://${ip}:5173" -ForegroundColor White
}
Write-Host ""
Write-Host "Usuarios demo:" -ForegroundColor DarkGray
Write-Host "  admin@logify.cl" -ForegroundColor DarkGray
Write-Host "  operaciones@logify.cl" -ForegroundColor DarkGray
Write-Host "  Contrasena: Logify123!" -ForegroundColor DarkGray
Write-Host ""

npm run dev -- --host 0.0.0.0 --port 5173
