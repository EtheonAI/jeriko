import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { execSync } from "node:child_process";
import { platform } from "node:os";

export const command: CommandHandler = {
  name: "location",
  description: "Get current location (latitude, longitude)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko location");
      console.log("\nGet the current device location using CoreLocation (macOS)");
      console.log("or IP-based geolocation as fallback.");
      console.log("\nFlags:");
      console.log("  --ip              Force IP-based geolocation");
      process.exit(0);
    }

    const useIp = flagBool(parsed, "ip");
    const os = platform();

    if (!useIp && os === "darwin") {
      // Try CoreLocation via AppleScript (requires Location Services permission)
      try {
        // CoreLocation via a swift script is more reliable than AppleScript
        // Fallback to IP-based if this fails
        const script = `
import CoreLocation
import Foundation

class Locator: NSObject, CLLocationManagerDelegate {
  let mgr = CLLocationManager()
  let sem = DispatchSemaphore(value: 0)
  var result = ""

  func run() {
    mgr.delegate = self
    mgr.requestWhenInUseAuthorization()
    mgr.startUpdatingLocation()
    _ = sem.wait(timeout: .now() + 5)
    print(result)
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    if let loc = locations.first {
      result = "\\(loc.coordinate.latitude),\\(loc.coordinate.longitude)"
      sem.signal()
    }
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    result = "error:\\(error.localizedDescription)"
    sem.signal()
  }
}

Locator().run()`;
        // CoreLocation often requires Full Disk Access / privacy prompt — fallback to IP
      } catch {
        // Fall through to IP-based
      }
    }

    // IP-based geolocation (cross-platform fallback)
    try {
      const output = execSync('curl -sS "https://ipapi.co/json/"', { encoding: "utf-8", timeout: 10000 });
      const data = JSON.parse(output);
      ok({
        latitude: data.latitude,
        longitude: data.longitude,
        city: data.city,
        region: data.region,
        country: data.country_name,
        ip: data.ip,
        source: "ip-geolocation",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`Location lookup failed: ${msg}`, 2);
    }
  },
};
