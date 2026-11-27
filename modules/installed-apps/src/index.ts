import { requireNativeModule } from "expo-modules-core";

export type InstalledApp = {
  packageName: string;
  appName: string;
  versionName: string | null;
  versionCode: number;
  isSystem: boolean;
  apkPath: string;
};

export type ApkInfo = {
  packageName: string;
  appName: string;
  versionName: string | null;
  versionCode: number;
  minSdk: number;
  targetSdk: number;
  permissions: string[];
  nativeLibs: string[];
  apkFiles: string[];
  splitApkCount: number;
};

type InstalledAppsNativeModule = {
  getInstalledApps(includeSystem: boolean): Promise<InstalledApp[]>;
  getAppLibraries(packageName: string): Promise<string[]>;
  getApkInfo(apkUri: string): Promise<ApkInfo | null>;
  getInstalledApkInfo(packageName: string): Promise<ApkInfo | null>;
};

const InstalledApps =
  requireNativeModule<InstalledAppsNativeModule>("InstalledApps");

export function getInstalledApps(
  includeSystem = false,
): Promise<InstalledApp[]> {
  return InstalledApps.getInstalledApps(includeSystem);
}

export function getAppLibraries(packageName: string): Promise<string[]> {
  if (typeof InstalledApps.getAppLibraries !== "function") {
    return Promise.reject(
      new Error("Fitur ini memerlukan build development terbaru."),
    );
  }
  return InstalledApps.getAppLibraries(packageName);
}

export function getApkInfo(apkUri: string): Promise<ApkInfo | null> {
  if (typeof InstalledApps.getApkInfo !== "function") {
    return Promise.reject(
      new Error("Fitur ini memerlukan build development terbaru."),
    );
  }
  return InstalledApps.getApkInfo(apkUri);
}

export function getInstalledApkInfo(
  packageName: string,
): Promise<ApkInfo | null> {
  if (typeof InstalledApps.getInstalledApkInfo !== "function") {
    return Promise.reject(
      new Error("Fitur ini memerlukan build development terbaru."),
    );
  }
  return InstalledApps.getInstalledApkInfo(packageName);
}
