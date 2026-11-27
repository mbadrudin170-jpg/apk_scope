package expo.modules.installedapps

import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Build.VERSION_CODES
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.zip.ZipFile

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

    AsyncFunction("getAppLibraries") { packageName: String ->
      val context = appContext.reactContext
        ?: return@AsyncFunction emptyList<String>()

      val pm = context.packageManager
      val appInfo = try {
        pm.getApplicationInfo(packageName, 0)
      } catch (error: PackageManager.NameNotFoundException) {
        null
      } ?: return@AsyncFunction emptyList<String>()

      val libs = mutableSetOf<String>()
      try {
        ZipFile(appInfo.sourceDir).use { zip ->
          val entries = zip.entries()
          while (entries.hasMoreElements()) {
            val entry = entries.nextElement()
            if (!entry.isDirectory && entry.name.startsWith("lib/") && entry.name.endsWith(".so")) {
              libs.add(entry.name.substringAfterLast('/'))
            }
          }
        }
      } catch (error: Exception) {
        // ignore
      }

      libs.sorted()
    }

    AsyncFunction("getApkInfo") { apkUri: String ->
      val context = appContext.reactContext
        ?: return@AsyncFunction null

      val pm = context.packageManager

      val apkPath = if (apkUri.startsWith("content://")) {
        val uri = Uri.parse(apkUri)
        val input = try {
          context.contentResolver.openInputStream(uri)
        } catch (error: Exception) {
          null
        } ?: return@AsyncFunction null
        val outFile = File(context.cacheDir, "apk_scope_analysis.apk")
        try {
          input.use { ins ->
            FileOutputStream(outFile).use { outs ->
              ins.copyTo(outs)
            }
          }
        } catch (error: Exception) {
          return@AsyncFunction null
        }
        outFile.absolutePath
      } else {
        apkUri
      }

      val archiveInfo = try {
        pm.getPackageArchiveInfo(
          apkPath,
          PackageManager.GET_PERMISSIONS or PackageManager.GET_META_DATA,
        )
      } catch (error: Exception) {
        null
      } ?: return@AsyncFunction null

      val appInfo = archiveInfo.applicationInfo
      if (appInfo != null) {
        appInfo.sourceDir = apkPath
        appInfo.publicSourceDir = apkPath
      }

      val appName = try {
        appInfo?.let { pm.getApplicationLabel(it).toString() }
      } catch (error: Exception) {
        null
      } ?: archiveInfo.packageName

      val versionCode = when {
        Build.VERSION.SDK_INT >= VERSION_CODES.P -> archiveInfo.longVersionCode
        else -> archiveInfo.versionCode.toLong()
      }

      val nativeLibs = mutableSetOf<String>()
      try {
        ZipFile(apkPath).use { zip ->
          val entries = zip.entries()
          while (entries.hasMoreElements()) {
            val entry = entries.nextElement()
            if (!entry.isDirectory && entry.name.startsWith("lib/") && entry.name.endsWith(".so")) {
              nativeLibs.add(entry.name.substringAfterLast('/'))
            }
          }
        }
      } catch (error: Exception) {
        // ignore
      }

      mapOf(
        "packageName" to archiveInfo.packageName,
        "appName" to appName,
        "versionName" to archiveInfo.versionName,
        "versionCode" to versionCode,
        "minSdk" to (appInfo?.minSdkVersion ?: 0),
        "targetSdk" to (appInfo?.targetSdkVersion ?: 0),
        "permissions" to (archiveInfo.requestedPermissions?.toList() ?: emptyList<String>()),
        "nativeLibs" to nativeLibs.sorted(),
      )
    }
  }
}
