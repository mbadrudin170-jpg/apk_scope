package expo.modules.installedapps

import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Build.VERSION_CODES
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.util.zip.ZipFile

private data class ResolvedApkPath(
  val path: String,
  val temporaryFile: File? = null,
)

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

      val appInfo = try {
        context.packageManager.getApplicationInfo(packageName, 0)
      } catch (error: PackageManager.NameNotFoundException) {
        null
      } ?: return@AsyncFunction emptyList<String>()

      val apkPaths = (listOf(appInfo.sourceDir) + appInfo.splitSourceDirs.orEmpty().toList())
        .filter { File(it).isFile }

      readNativeLibraries(apkPaths).sorted()
    }

    AsyncFunction("getApkInfo") { apkUri: String ->
      val context = appContext.reactContext
        ?: return@AsyncFunction null

      val resolved = resolveApkPath(context, apkUri)
        ?: return@AsyncFunction null

      try {
        readApkInfo(context, listOf(resolved.path))
      } finally {
        resolved.temporaryFile?.delete()
      }
    }

    AsyncFunction("getInstalledApkInfo") { packageName: String ->
      val context = appContext.reactContext
        ?: return@AsyncFunction null

      val appInfo = try {
        context.packageManager.getApplicationInfo(packageName, 0)
      } catch (error: PackageManager.NameNotFoundException) {
        null
      } ?: return@AsyncFunction null

      val apkPaths = (listOf(appInfo.sourceDir) + appInfo.splitSourceDirs.orEmpty().toList())
        .filter { File(it).isFile }

      readApkInfo(context, apkPaths)
    }

    AsyncFunction("getInstalledApkFileContent") { packageName: String, fileName: String ->
      val context = appContext.reactContext
        ?: return@AsyncFunction null

      val appInfo = try {
        context.packageManager.getApplicationInfo(packageName, 0)
      } catch (error: PackageManager.NameNotFoundException) {
        null
      } ?: return@AsyncFunction null

      val apkPaths = (listOf(appInfo.sourceDir) + appInfo.splitSourceDirs.orEmpty().toList())
        .filter { File(it).isFile }

      readApkFileContent(apkPaths, fileName)
    }
  }

  private fun resolveApkPath(
    context: android.content.Context,
    rawUri: String,
  ): ResolvedApkPath? {
    val uri = Uri.parse(rawUri)

    return when (uri.scheme) {
      "content" -> {
        val input = try {
          context.contentResolver.openInputStream(uri)
        } catch (error: Exception) {
          null
        } ?: return null

        val temporaryFile = try {
          File.createTempFile("apk_scope_", ".apk", context.cacheDir)
        } catch (error: Exception) {
          input.close()
          return null
        }

        try {
          input.use { source ->
            FileOutputStream(temporaryFile).use { destination ->
              source.copyTo(destination)
            }
          }
          ResolvedApkPath(temporaryFile.absolutePath, temporaryFile)
        } catch (error: Exception) {
          temporaryFile.delete()
          null
        }
      }
      "file" -> uri.path
        ?.takeIf { File(it).isFile }
        ?.let { ResolvedApkPath(it) }
      null -> rawUri
        .takeIf { File(it).isFile }
        ?.let { ResolvedApkPath(it) }
      else -> null
    }
  }

  private fun readApkInfo(
    context: android.content.Context,
    apkPaths: List<String>,
  ): Map<String, Any?>? {
    val existingPaths = apkPaths.filter { File(it).isFile }
    val baseApkPath = existingPaths.firstOrNull() ?: return null
    val pm = context.packageManager

    val archiveInfo = try {
      pm.getPackageArchiveInfo(
        baseApkPath,
        PackageManager.GET_PERMISSIONS or PackageManager.GET_META_DATA,
      )
    } catch (error: Exception) {
      null
    } ?: return null

    val appInfo = archiveInfo.applicationInfo
    if (appInfo != null) {
      appInfo.sourceDir = baseApkPath
      appInfo.publicSourceDir = baseApkPath
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

    return mapOf(
      "packageName" to archiveInfo.packageName,
      "appName" to appName,
      "versionName" to archiveInfo.versionName,
      "versionCode" to versionCode,
      "minSdk" to (appInfo?.minSdkVersion ?: 0),
      "targetSdk" to (appInfo?.targetSdkVersion ?: 0),
      "permissions" to (archiveInfo.requestedPermissions?.toList() ?: emptyList<String>()),
      "nativeLibs" to readNativeLibraries(existingPaths).sorted(),
      "allFiles" to readAllFiles(existingPaths).sorted(),
      "apkFiles" to existingPaths.map { File(it).name },
      "splitApkCount" to (existingPaths.size - 1).coerceAtLeast(0),
    )
  }

  private fun readNativeLibraries(apkPaths: List<String>): Set<String> {
    val libraries = mutableSetOf<String>()

    apkPaths.forEach { apkPath ->
      try {
        ZipFile(apkPath).use { zip ->
          val entries = zip.entries()
          while (entries.hasMoreElements()) {
            val entry = entries.nextElement()
            if (
              !entry.isDirectory &&
              entry.name.startsWith("lib/") &&
              entry.name.endsWith(".so")
            ) {
              libraries.add(entry.name.substringAfterLast('/'))
            }
          }
        }
      } catch (error: Exception) {
        // Skip unreadable APK parts; metadata remains available from the base APK.
      }
    }

    return libraries
  }

  private fun readAllFiles(apkPaths: List<String>): Set<String> {
    val files = mutableSetOf<String>()

    apkPaths.forEach { apkPath ->
      try {
        ZipFile(apkPath).use { zip ->
          val entries = zip.entries()
          while (entries.hasMoreElements()) {
            val entry = entries.nextElement()
            if (!entry.isDirectory) {
              files.add(entry.name)
            }
          }
        }
      } catch (error: Exception) {
        // Skip unreadable APK parts; metadata remains available from the base APK.
      }
    }

    return files
  }

  private fun readApkFileContent(
    apkPaths: List<String>,
    fileName: String,
  ): Map<String, Any?>? {
    val maxBytes = 200_000
    if (
      fileName.isBlank() ||
      fileName.startsWith("/") ||
      fileName.contains('\\') ||
      fileName.split('/').any { it == ".." || it.isBlank() }
    ) {
      return fileContentResult(error = "Lokasi file tidak valid.")
    }

    val extension = fileName.substringAfterLast('.', "").lowercase()
    val textExtensions = setOf(
      "txt", "xml", "json", "html", "htm", "css", "js", "mjs", "cjs",
      "ts", "tsx", "jsx", "java", "kt", "kts", "smali", "properties",
      "yml", "yaml", "toml", "cfg", "ini", "md", "gradle", "pro",
      "sh", "bat", "csv", "sql", "svg", "plist",
    )
    if (extension !in textExtensions) {
      return fileContentResult(
        error = "File ini bukan format teks yang didukung. DEX, gambar, dan library native tidak dapat ditampilkan sebagai teks."
      )
    }

    var entryFound = false
    for (apkPath in apkPaths) {
      try {
        ZipFile(apkPath).use { zip ->
          val entry = zip.getEntry(fileName) ?: return@use
          entryFound = true
          if (entry.isDirectory) {
            return fileContentResult(error = "Lokasi tersebut adalah direktori.")
          }
          if (entry.size > maxBytes) {
            return fileContentResult(
              error = "File terlalu besar untuk ditampilkan (maksimal 200 KB).",
              size = entry.size,
            )
          }

          val output = ByteArrayOutputStream()
          zip.getInputStream(entry).use { input ->
            val buffer = ByteArray(8_192)
            var totalBytes = 0
            while (true) {
              val count = input.read(buffer)
              if (count < 0) break
              if (totalBytes + count > maxBytes) {
                return fileContentResult(
                  error = "Ukuran aktual file melebihi batas 200 KB.",
                  size = (totalBytes + count).toLong(),
                )
              }
              output.write(buffer, 0, count)
              totalBytes += count
            }
          }

          val content = try {
            Charsets.UTF_8.newDecoder()
              .onMalformedInput(CodingErrorAction.REPORT)
              .onUnmappableCharacter(CodingErrorAction.REPORT)
              .decode(ByteBuffer.wrap(output.toByteArray()))
              .toString()
          } catch (error: CharacterCodingException) {
            return fileContentResult(
              error = "Isi file bukan teks UTF-8 yang valid.",
              size = output.size().toLong(),
            )
          }

          if (content.contains('\u0000')) {
            return fileContentResult(
              error = "File terdeteksi sebagai data binary, bukan teks biasa.",
              size = output.size().toLong(),
            )
          }

          return fileContentResult(
            content = content,
            size = output.size().toLong(),
          )
        }
      } catch (error: Exception) {
        if (entryFound) {
          return fileContentResult(error = "Gagal membaca konten file APK.")
        }
        // Continue searching split APK parts.
      }
    }

    return if (entryFound) {
      fileContentResult(error = "Konten file tidak dapat dibaca.")
    } else {
      null
    }
  }

  private fun fileContentResult(
    content: String? = null,
    error: String? = null,
    size: Long = 0L,
  ): Map<String, Any?> = mapOf(
    "content" to content,
    "error" to error,
    "size" to size,
  )
}
