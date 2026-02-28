// Win32 — Notifications via PowerShell + Windows.UI.Notifications (toast)

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { NotifyProvider } from "../interface.js";

const execAsync = promisify(exec);

/** Escape a string for safe embedding in a PowerShell single-quoted string. */
function escapePowerShell(str: string): string {
  return str.replace(/'/g, "''");
}

export class Win32Notify implements NotifyProvider {
  /**
   * Send a Windows toast notification via PowerShell.
   * @param title    Notification title
   * @param message  Notification body text
   * @param sound    Ignored on Windows (toast notifications use system default)
   */
  async send(title: string, message: string, _sound?: string): Promise<void> {
    const safeTitle = escapePowerShell(title);
    const safeMessage = escapePowerShell(message);

    // Use BurntToast module if available, otherwise fall back to .NET
    const psScript = `
try {
  Import-Module BurntToast -ErrorAction Stop
  New-BurntToastNotification -Text '${safeTitle}', '${safeMessage}'
} catch {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
  $xml = @"
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>${safeTitle}</text>
      <text>${safeMessage}</text>
    </binding>
  </visual>
</toast>
"@
  $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
  $doc.LoadXml($xml)
  $toast = [Windows.UI.Notifications.ToastNotification]::new($doc)
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Jeriko').Show($toast)
}`;

    await execAsync(
      `powershell.exe -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
    );
  }
}
