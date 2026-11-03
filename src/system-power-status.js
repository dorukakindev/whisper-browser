'use strict';
const path = require('node:path');
const { execFile: nativeExecFile } = require('node:child_process');
// Fixed, read-only Win32 query. Neither renderer arguments nor file paths enter this script.
const WINDOWS_QUERY = `$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WhisperSystemPower {
  [StructLayout(LayoutKind.Sequential)] public struct Status {
    public byte ACLineStatus, BatteryFlag, BatteryLifePercent, SystemStatusFlag;
    public uint BatteryLifeTime, BatteryFullLifeTime;
  }
  [DllImport("kernel32.dll", SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool GetSystemPowerStatus(out Status value);
}
'@
$status = New-Object WhisperSystemPower+Status
if (-not [WhisperSystemPower]::GetSystemPowerStatus([ref]$status)) { exit 1 }
@{ac=[int]$status.ACLineStatus;percent=[int]$status.BatteryLifePercent;saver=[int]$status.SystemStatusFlag} | ConvertTo-Json -Compress`;

function parseWindowsPowerStatus(text, fallbackOnBattery = null) {
  try {
    const value = JSON.parse(String(text).replace(/^\uFEFF/, '').trim());
    if (!value || ![0, 1].includes(value.saver) || ![0, 1, 255].includes(value.ac) || !Number.isInteger(value.percent) || value.percent < 0 || value.percent > 255) return null;
    return { ok: true, source: 'windows', saverEnabled: value.saver === 1, onBattery: value.ac === 255 ? fallbackOnBattery : value.ac === 0, batteryPercent: value.percent <= 100 ? value.percent : null };
  } catch { return null; }
}
function createSystemPowerStatus({ platform = process.platform, execFile = nativeExecFile, now = Date.now, getOnBattery = () => null, powershellPath = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') } = {}) {
  let cached = null, expires = 0, pending = null;
  function read() {
    if (cached && now() < expires) return Promise.resolve(cached);
    if (pending) return pending;
    let onBattery = null; try { const flag = getOnBattery(); if (typeof flag === 'boolean') onBattery = flag; } catch {}
    const fallback = { ok: true, source: 'electron', saverEnabled: null, onBattery, batteryPercent: null };
    if (platform !== 'win32') { cached = fallback; expires = now() + 30000; return Promise.resolve(cached); }
    pending = new Promise(resolve => {
      try {
        execFile(powershellPath, ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_QUERY], { windowsHide: true, timeout: 3000, maxBuffer: 4096, encoding: 'utf8' }, (error, stdout) => resolve(error ? fallback : parseWindowsPowerStatus(stdout, onBattery) || fallback));
      } catch { resolve(fallback); }
    }).then(value => { cached = value; expires = now() + 30000; return value; }).finally(() => { pending = null; });
    return pending;
  }
  return Object.freeze({ read });
}
module.exports = { createSystemPowerStatus, parseWindowsPowerStatus };
