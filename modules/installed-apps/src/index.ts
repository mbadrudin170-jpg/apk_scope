import { requireNativeModule } from "expo-modules-core";

export type InstalledApp = {
  packageName: string;
  appName: string;
  versionName: string | null;
  versionCode: number;
  isSystem: boolean;
  apkPath: string;
};

type InstalledAppsNativeModule = {
  getInstalledApps(includeSystem: boolean): Promise<InstalledApp[]>;
  getAppLibraries(packageName: string): Promise<string[]>;
};

const InstalledApps =
  requireNativeModule<InstalledAppsNativeModule>("InstalledApps");

export function getInstalledApps(
  includeSystem = false,
): Promise<InstalledApp[]> {
  return InstalledApps.getInstalledApps(includeSystem);
}

export function getAppLibraries(packageName: string): Promise<string[]> {
  return InstalledApps.getAppLibraries(packageName);
}

