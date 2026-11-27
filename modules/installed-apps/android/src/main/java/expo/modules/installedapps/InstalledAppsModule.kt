package expo.modules.installedapps

import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.Build.VERSION_CODES
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class InstalledAppsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("InstalledApps")

    AsyncFunction("getInstalledApps") { includeSystem: Boolean ->
      val context = appContext.reactContext
        ?: return@AsyncFunction emptyList<Map<String, Any?>>()

      val pm = context.packageManager
      val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)

      apps
        .filter { includeSystem || (it.flags and ApplicationInfo.FLAG_SYSTEM) == 0 }
        .map { app ->
          val info = try {
            pm.getPackageInfo(app.packageName, 0)
          } catch (error: PackageManager.NameNotFoundException) {
            null
          }

          val versionCode = when {
            info == null -> 0L
            Build.VERSION.SDK_INT >= VERSION_CODES.P -> info.longVersionCode
            else -> info.versionCode.toLong()
          }

          mapOf(
            "packageName" to app.packageName,
            "appName" to pm.getApplicationLabel(app).toString(),
            "versionName" to info?.versionName,
            "versionCode" to versionCode,
            "isSystem" to ((app.flags and ApplicationInfo.FLAG_SYSTEM) != 0),
            "apkPath" to app.sourceDir
          )
        }
    }
  }
}
