export type InstalledApp = {
  packageName: string;
  appName: string;
  versionName: string | null;
  versionCode: number;
  isSystem: boolean;
  apkPath: string;
};

export async function getInstalledApps(
  _includeSystem = false,
): Promise<InstalledApp[]> {
  throw new Error("Pemindaian aplikasi terpasang hanya tersedia di Android.");
}

export async function getAppLibraries(
  _packageName: string,
): Promise<string[]> {
  throw new Error("Pemindaian aplikasi terpasang hanya tersedia di Android.");
}
