# External UI driver for the real NSIS wizard; never passes silent/update bypass flags.
param([ValidateSet('install', 'wizard', 'close', 'running', 'pids')][string]$Action, [string]$Installer, [string]$Installation, [string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Only disposable GitHub runners are supported' }
if ($Action -eq 'install') {
  $p = Start-Process -FilePath $Installer -ArgumentList @('/S', "/D=$Installation") -Wait -PassThru
  exit $p.ExitCode
}
if ($Action -eq 'pids') {
  Get-Process -Name mimir -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }
  exit 0
}
if ($Action -eq 'running') {
  if (Get-Process -Name mimir -ErrorAction SilentlyContinue) { 'running' }
  exit 0
}
if ($Action -eq 'close') {
  Get-Process -Name mimir -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.MainWindowHandle -ne 0) { [void]$_.CloseMainWindow() }
  }
  exit 0
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
function Write-NativeSnapshot($Windows, [int]$Sequence) {
  # Diagnostics only: never changes window state, installation arguments or click decisions.
  try {
    $processes = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match '(?i)mimir' } | ForEach-Object {
      @{ id = $_.Id; name = $_.ProcessName; title = $_.MainWindowTitle; handle = $_.MainWindowHandle.ToInt64() }
    })
    $candidates = @($Windows | ForEach-Object {
      $current = $_.Current
      if ($current.ClassName -eq '#32770' -or $current.Name -match '(?i)mimir') {
        $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
        $buttons = @($_.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition) | ForEach-Object {
          @{ name = $_.Current.Name; enabled = $_.Current.IsEnabled; offscreen = $_.Current.IsOffscreen }
        })
        @{ title = $current.Name; class = $current.ClassName; pid = $current.ProcessId; offscreen = $current.IsOffscreen; buttons = $buttons }
      }
    })
    $snapshot = @{ at = [DateTime]::UtcNow.ToString('o'); processes = $processes; windows = $candidates } | ConvertTo-Json -Depth 8
    Write-Output "NSIS native snapshot: $($snapshot -replace '\r?\n', ' ')"
    if ($EvidenceDirectory) {
      [void][System.IO.Directory]::CreateDirectory($EvidenceDirectory)
      $stem = Join-Path $EvidenceDirectory ("nsis-native-{0:D3}" -f $Sequence)
      [System.IO.File]::WriteAllText("$stem.json", $snapshot)
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
      $bitmap = [System.Drawing.Bitmap]::new($bounds.Width, $bounds.Height)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)
        $bitmap.Save("$stem.png", [System.Drawing.Imaging.ImageFormat]::Png)
      } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
      }
    }
  } catch {
    # A missing interactive desktop must be visible in evidence without becoming an install result.
    Write-Output "NSIS diagnostic snapshot failed: $_"
  }
}
$deadline = [DateTime]::UtcNow.AddMinutes(8)
$clicked = 0
$nextSnapshot = [DateTime]::MinValue
$snapshotSequence = 0
while ([DateTime]::UtcNow -lt $deadline) {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  if ([DateTime]::UtcNow -ge $nextSnapshot) {
    Write-NativeSnapshot $windows $snapshotSequence
    $snapshotSequence++
    $nextSnapshot = [DateTime]::UtcNow.AddSeconds(30)
  }
  foreach ($window in $windows) {
    # Restrict to NSIS dialog class and Mimir's installer title, not arbitrary app buttons.
    if ($window.Current.ClassName -ne '#32770' -or $window.Current.Name -notmatch '(?i)mimir') { continue }
    $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
    $buttons = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
    foreach ($button in $buttons) {
      if (-not $button.Current.IsEnabled -or $button.Current.IsOffscreen) { continue }
      $name = $button.Current.Name -replace '&', ''
      if ($name -notmatch '^(Next\s*>?|Install|Finish|下一步.*|安装.*|完成.*)$') { continue }
      $pattern = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
      Write-Output "NSIS action: $name"
      $pattern.Invoke()
      $clicked++
      if ($name -match '^(Finish|完成.*)$') { exit 0 }
      break
    }
  }
  Start-Sleep -Milliseconds 750
}
Write-NativeSnapshot $windows $snapshotSequence
throw "NSIS wizard did not finish; actions=$clicked"
