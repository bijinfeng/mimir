# External UI driver for the real NSIS wizard; never passes silent/update bypass flags.
param([ValidateSet('install', 'wizard', 'close', 'running', 'pids', 'self-test')][string]$Action, [string]$Installer, [string]$InstallerSha256, [string]$Installation, [string]$EvidenceDirectory)
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
# UIA can expose the dialog yet omit every standard NSIS child. Enumerate actual Win32 HWNDs.
# Compiling this interop also runs in self-test; native methods only execute in the real wizard.
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public sealed class NsisControl {
  public long handle;
  public string text;
  public string className;
  public int controlId;
  public bool visible;
  public bool enabled;
}
public sealed class NsisWindow {
  public long handle;
  public int processId;
  public string executablePath;
  public string title;
  public string className;
  public bool visible;
  public NsisControl[] controls;
}
public static class NsisNative {
  private delegate bool EnumWindowProc(IntPtr hwnd, IntPtr value);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowProc callback, IntPtr value);
  [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, EnumWindowProc callback, IntPtr value);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int size);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hwnd, StringBuilder text, int size);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
  [DllImport("user32.dll")] private static extern int GetDlgCtrlID(IntPtr hwnd);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] private static extern bool IsWindowEnabled(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint message, UIntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
  private static string Text(IntPtr hwnd, bool className = false) {
    var text = new StringBuilder(4096);
    if (className) GetClassName(hwnd, text, text.Capacity);
    else GetWindowText(hwnd, text, text.Capacity);
    return text.ToString();
  }
  public static NsisWindow[] Windows() {
    var windows = new List<NsisWindow>();
    EnumWindows((hwnd, value) => {
      var title = Text(hwnd);
      var className = Text(hwnd, true);
      if (className != "#32770" && title.IndexOf("mimir", StringComparison.OrdinalIgnoreCase) < 0) return true;
      uint processId;
      GetWindowThreadProcessId(hwnd, out processId);
      string path = null;
      try { using (var process = Process.GetProcessById((int)processId)) path = process.MainModule.FileName; }
      catch { /* Unreadable paths remain null and cannot qualify for actions. */ }
      var controls = new List<NsisControl>();
      EnumChildWindows(hwnd, (child, data) => {
        controls.Add(new NsisControl {
          handle = child.ToInt64(), text = Text(child), className = Text(child, true),
          controlId = GetDlgCtrlID(child), visible = IsWindowVisible(child), enabled = IsWindowEnabled(child)
        });
        return true;
      }, IntPtr.Zero);
      windows.Add(new NsisWindow { handle = hwnd.ToInt64(), processId = (int)processId,
        executablePath = path, title = title, className = className, visible = IsWindowVisible(hwnd), controls = controls.ToArray() });
      return true;
    }, IntPtr.Zero);
    return windows.ToArray();
  }
  public static void Click(long parent, int processId, long button, string caption) {
    var window = new IntPtr(parent);
    var control = new IntPtr(button);
    uint currentProcessId;
    GetWindowThreadProcessId(window, out currentProcessId);
    // Recheck live identity immediately before sending a normal button click.
    if (currentProcessId != processId || !IsWindow(window) || Text(window, true) != "#32770" ||
        GetAncestor(control, 2) != window || Text(control, true) != "Button" || GetDlgCtrlID(control) != 1 ||
        Text(control) != caption || !IsWindowVisible(control) || !IsWindowEnabled(control))
      throw new InvalidOperationException("NSIS action target changed before click");
    if (!SetForegroundWindow(window) && GetForegroundWindow() != window) throw new InvalidOperationException("Cannot foreground official NSIS wizard");
    UIntPtr result;
    // BM_CLICK follows the existing button handler; no installer process is started here.
    if (SendMessageTimeout(control, 0x00F5, UIntPtr.Zero, IntPtr.Zero, 2, 3000, out result) == IntPtr.Zero)
      throw new InvalidOperationException("NSIS BM_CLICK failed or timed out: " + Marshal.GetLastWin32Error());
  }
}
'@
function Test-OfficialWindow($Window, [string]$ExpectedInstaller) {
  return $Window.visible -and $Window.className -ceq '#32770' -and
    $Window.title.Trim() -ieq 'mimir Setup' -and $Window.executablePath -and
    [StringComparer]::OrdinalIgnoreCase.Equals($Window.executablePath, $ExpectedInstaller)
}
function Get-WizardAction($Window, [string]$ExpectedInstaller) {
  if (-not (Test-OfficialWindow $Window $ExpectedInstaller)) { return }
  foreach ($control in $Window.controls) {
    if (-not $control.visible -or -not $control.enabled -or $control.className -cne 'Button' -or $control.controlId -ne 1) { continue }
    $name = ($control.text -replace '&', '').Trim()
    if ($name -cmatch '^(Next\s*>?|Install|Finish|下一步\s*>?|安装|完成)$') {
      return @{ control = $control; name = $name; finish = $name -cmatch '^(Finish|完成)$' }
    }
  }
}
if ($Action -eq 'self-test') {
  $path = 'C:\official-cache\mimir-0.1.6-win-x64.exe'
  $button = @{ handle = 2; text = '&Next >'; className = 'Button'; controlId = 1; visible = $true; enabled = $true }
  $window = @{ handle = 1; processId = 42; executablePath = $path; title = 'mimir Setup '; className = '#32770'; visible = $true; controls = @($button) }
  if ((Get-WizardAction $window $path).name -ne 'Next >') { throw 'Visible official Next was rejected' }
  foreach ($caption in @('Install', '&Finish', '下一步 >', '安装', '完成')) {
    $button.text = $caption
    if (-not (Get-WizardAction $window $path)) { throw "Valid action rejected: $caption" }
  }
  foreach ($caption in @('Cancel', '< Back', 'Run mimir', 'Finish later', '安装失败')) {
    $button.text = $caption
    if (Get-WizardAction $window $path) { throw "Unexpected action accepted: $caption" }
  }
  $button.text = 'Finish'
  if (-not (Get-WizardAction $window $path).finish) { throw 'Finish was not identified' }
  $nativeButton = [NsisControl]::new()
  $nativeButton.handle = 2; $nativeButton.text = '&Next >'; $nativeButton.className = 'Button'
  $nativeButton.controlId = 1; $nativeButton.visible = $true; $nativeButton.enabled = $true
  $nativeWindow = [NsisWindow]::new()
  $nativeWindow.handle = 1; $nativeWindow.processId = 42; $nativeWindow.executablePath = $path
  $nativeWindow.title = 'mimir Setup '; $nativeWindow.className = '#32770'; $nativeWindow.visible = $true
  $nativeWindow.controls = @($nativeButton)
  if ((Get-WizardAction $nativeWindow $path).name -ne 'Next >') { throw 'Native interop fields were not readable' }
  if (($nativeWindow | ConvertTo-Json -Depth 8 | ConvertFrom-Json).controls[0].handle -ne 2) { throw 'Native evidence fields were not serialized' }
  foreach ($change in @(
    @{ object = $window; key = 'executablePath'; value = 'C:\other\mimir-0.1.6-win-x64.exe' },
    @{ object = $window; key = 'executablePath'; value = $null },
    @{ object = $window; key = 'title'; value = 'Other Setup' },
    @{ object = $window; key = 'className'; value = 'OtherClass' },
    @{ object = $window; key = 'visible'; value = $false },
    @{ object = $button; key = 'className'; value = 'Static' },
    @{ object = $button; key = 'controlId'; value = 2 },
    @{ object = $button; key = 'visible'; value = $false },
    @{ object = $button; key = 'enabled'; value = $false }
  )) {
    $original = $change.object[$change.key]
    $change.object[$change.key] = $change.value
    if (Get-WizardAction $window $path) { throw "Unsafe target accepted: $($change.key)" }
    $change.object[$change.key] = $original
  }
  Write-Output 'PASS NSIS exact process path, dialog identity, button policy, Finish classification and interop compilation'
  exit 0
}
if (-not $Installer -or $InstallerSha256 -notmatch '^[a-f0-9]{64}$') { throw 'Wizard requires the verified official installer path and SHA-256' }
$expectedInstaller = (Get-Item -LiteralPath $Installer).FullName
if ((Get-FileHash -LiteralPath $expectedInstaller -Algorithm SHA256).Hash -ine $InstallerSha256) { throw 'Official cached installer SHA-256 changed' }
function Write-NativeSnapshot($Windows, [int]$Sequence) {
  # Diagnostics include real child handles/text even when accessibility providers omit them.
  try {
    $processes = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match '(?i)mimir' } | ForEach-Object {
      @{ id = $_.Id; name = $_.ProcessName; title = $_.MainWindowTitle; handle = $_.MainWindowHandle.ToInt64() }
    })
    $snapshot = @{ at = [DateTime]::UtcNow.ToString('o'); processes = $processes; windows = @($Windows) } | ConvertTo-Json -Depth 8
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
  $windows = [NsisNative]::Windows()
  if ([DateTime]::UtcNow -ge $nextSnapshot) {
    Write-NativeSnapshot $windows $snapshotSequence
    $snapshotSequence++
    $nextSnapshot = [DateTime]::UtcNow.AddSeconds(30)
  }
  foreach ($window in $windows) {
    $actionButton = Get-WizardAction $window $expectedInstaller
    if (-not $actionButton) { continue }
    Write-NativeSnapshot $windows $snapshotSequence
    $snapshotSequence++
    Write-Output "NSIS action: $($actionButton.name); pid=$($window.processId); window=$($window.handle); control=$($actionButton.control.handle); path=$($window.executablePath)"
    [NsisNative]::Click($window.handle, $window.processId, $actionButton.control.handle, $actionButton.control.text)
    $clicked++
    if ($actionButton.finish) {
      $finishDeadline = [DateTime]::UtcNow.AddSeconds(15)
      while ([NsisNative]::IsWindow([IntPtr]::new($window.handle)) -and [DateTime]::UtcNow -lt $finishDeadline) { Start-Sleep -Milliseconds 250 }
      Write-NativeSnapshot ([NsisNative]::Windows()) $snapshotSequence
      if ([NsisNative]::IsWindow([IntPtr]::new($window.handle))) { throw 'Finish click did not close the official wizard' }
      Write-Output "PASS official NSIS Finish clicked and window closed; actions=$clicked"
      exit 0
    }
    break
  }
  Start-Sleep -Milliseconds 750
}
Write-NativeSnapshot $windows $snapshotSequence
throw "NSIS wizard did not finish; actions=$clicked"
