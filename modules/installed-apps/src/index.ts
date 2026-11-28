import { requireNativeModule } from "expo-modules-core";

export type InstalledApp = {
  packageName: string;
  appName: string;
  versionName: string | null;
  versionCode: number;
  isSystem: boolean;
  apkPath: string;
};

export type ApkFileContent = {
  content: string | null;
  error: string | null;
  size: number;
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
  allFiles: string[];
  apkFiles: string[];
  splitApkCount: number;
};

export type StringScanResult = Record<string, number>;

type InstalledAppsNativeModule = {
  getInstalledApps(includeSystem: boolean): Promise<InstalledApp[]>;
  getAppLibraries(packageName: string): Promise<string[]>;
  getApkInfo(apkUri: string): Promise<ApkInfo | null>;
  getInstalledApkInfo(packageName: string): Promise<ApkInfo | null>;
  getInstalledApkFileContent(packageName: string, fileName: string): Promise<ApkFileContent | null>;
  scanInstalledApkFile(
    packageName: string,
    fileName: string,
    needles: string[],
  ): Promise<StringScanResult | null>;
  scanApkFile(
    apkUri: string,
    fileName: string,
    needles: string[],
  ): Promise<StringScanResult | null>;
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

export function getInstalledApkFileContent(
  packageName: string,
  fileName: string,
): Promise<ApkFileContent | null> {
  if (typeof InstalledApps.getInstalledApkFileContent !== "function") {
    console.log("[InstalledApps] getInstalledApkFileContent native function missing");
    return Promise.reject(
      new Error("Fitur ini memerlukan build development terbaru."),
    );
  }
  console.log("[InstalledApps] getInstalledApkFileContent", packageName, fileName);
  return InstalledApps.getInstalledApkFileContent(packageName, fileName).then(
    (result) => {
      console.log("[InstalledApps] getInstalledApkFileContent result", result);
      return result;
    },
  );
}

export function scanInstalledApkFile(
  packageName: string,
  fileName: string,
  needles: string[],
): Promise<StringScanResult | null> {
  if (typeof InstalledApps.scanInstalledApkFile !== "function") {
    console.log("[InstalledApps] scanInstalledApkFile native function missing");
    return Promise.reject(
      new Error("Fitur ini memerlukan build development terbaru."),
    );
  }
  console.log("[InstalledApps] scanInstalledApkFile", packageName, fileName, needles);
  return InstalledApps.scanInstalledApkFile(packageName, fileName, needles).then(
    (result) => {
      console.log("[InstalledApps] scanInstalledApkFile result", result);
      return result;
    },
  );
}

export function scanApkFile(
  apkUri: string,
  fileName: string,
  needles: string[],
): Promise<StringScanResult | null> {
  if (typeof InstalledApps.scanApkFile !== "function") {
    console.log("[InstalledApps] scanApkFile native function missing");
    return Promise.reject(
      new Error("Fitur ini memerlukan build development terbaru."),
    );
  }
  console.log("[InstalledApps] scanApkFile", apkUri, fileName, needles);
  return InstalledApps.scanApkFile(apkUri, fileName, needles).then((result) => {
    console.log("[InstalledApps] scanApkFile result", result);
    return result;
  });
}
