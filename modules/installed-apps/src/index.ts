import { requireNativeModule } from "expo-modules-core";

type InstalledApp = {
  packageName: string;
  appName: string;
  versionName: string | null;
  versionCode: number;
  isSystem: boolean;
  apkPath: string;
};

const InstalledApps = requireNativeModule("InstalledApps");

export function getInstalledApps(includeSystem = false): InstalledApp[] {
  return InstalledApps.getInstalledApps(includeSystem);
}

export type { InstalledApp };
