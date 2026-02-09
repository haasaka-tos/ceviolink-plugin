param([string]$text,[string]$user="")

# 外部連携サービスへの接続
$svc = New-Object -ComObject "CeVIO.Talk.RemoteService2.ServiceControl2"

# --- 重複エラー防止策 ---
# すでにホストが開始されている（IsHostStarted が True）なら StartHost をスキップする
if (-not $svc.IsHostStarted) {
    $null = $svc.StartHost($false)
}
# ----------------------

$t = New-Object -ComObject "CeVIO.Talk.RemoteService2.Talker2"

# キャスト設定（以前動いていた方式に完全に戻しました）
$c = @($t.AvailableCasts)[0].Core
$t.Cast = $c[1]  # OИE 固定

$t.Volume=80; $t.Speed=55; $t.Tone=50; $t.Alpha=50; $t.ToneScale=50

if($user){ $text="$user：$text" }
if([string]::IsNullOrWhiteSpace($text)){ exit 0 }

($t.Speak($text)).Wait()