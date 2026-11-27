package expo.modules.installedapps

import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class InstalledAppsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("InstalledApps")

    Function("getInstalledApps") { includeSystem: Boolean ->
      val context = appContext.reactContext ?: return@Function emptyList<Map<String, Any?>>()
      val pm = context.packageManager
      val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
      apps
        .filter { includeSystem || (it.flags and ApplicationInfo.FLAG_SYSTEM) == 0 }
        .map { app ->
          val info = try { pm.getPackageInfo(app.packageName, 0) } catch (e: Exception) { null }
          mapOf(
            "packageName" to app.packageName,
            "appName" to pm.getApplicationLabel(app).toString(),
            "versionName" to info?.versionName,
            "versionCode" to (info?.longVersionCode ?: 0L),
            "isSystem" to ((app.flags and ApplicationInfo.FLAG_SYSTEM) != 0),
            "apkPath" to app.sourceDir
          )
        }
    }
  }
}
