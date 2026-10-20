# External UI driver for the real NSIS wizard; never passes silent/update bypass flags.
param([ValidateSet('install', 'wizard', 'close', 'running', 'pids')][string]$Action, [string]$Installer, [string]$Installation)
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
$deadline = [DateTime]::UtcNow.AddMinutes(8)
$clicked = 0
while ([DateTime]::UtcNow -lt $deadline) {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
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
throw "NSIS wizard did not finish; actions=$clicked"
