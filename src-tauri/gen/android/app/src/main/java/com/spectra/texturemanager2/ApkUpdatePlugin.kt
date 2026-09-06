package com.spectra.texturemanager2

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class InstallApkArgs {
  var path: String? = null
}

/**
 * Unknown-sources install permission helpers and APK install via FileProvider.
 */
@TauriPlugin
class ApkUpdatePlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun canInstallPackages(invoke: Invoke) {
    val result = JSObject()
    result.put("allowed", isInstallAllowed())
    invoke.resolve(result)
  }

  @Command
  fun openInstallPermissionSettings(invoke: Invoke) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val intent =
          Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
            data = Uri.parse("package:${activity.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
        activity.startActivity(intent)
      } else {
        val intent =
          Intent(Settings.ACTION_SECURITY_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
        activity.startActivity(intent)
      }
      invoke.resolve()
    } catch (ex: Exception) {
      invoke.reject(ex.message ?: "Failed to open install permission settings")
    }
  }

  @Command
  fun installApk(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(InstallApkArgs::class.java)
      val path =
        args.path?.trim().orEmpty().ifEmpty {
          invoke.reject("APK path is required")
          return
        }
      val file = File(path)
      if (!file.isFile) {
        invoke.reject("APK file not found: $path")
        return
      }
      val authority = "${activity.packageName}.fileprovider"
      val uri = FileProvider.getUriForFile(activity, authority, file)
      val intent =
        Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(uri, "application/vnd.android.package-archive")
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
      activity.startActivity(intent)
      invoke.resolve()
    } catch (ex: Exception) {
      invoke.reject(ex.message ?: "Failed to install APK")
    }
  }

  private fun isInstallAllowed(): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      activity.packageManager.canRequestPackageInstalls()
    } else {
      true
    }
  }
}
