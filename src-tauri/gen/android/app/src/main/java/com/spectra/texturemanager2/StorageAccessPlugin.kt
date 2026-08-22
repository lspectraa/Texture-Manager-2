package com.spectra.texturemanager2

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.provider.Settings
import android.webkit.MimeTypeMap
import androidx.activity.result.ActivityResult
import androidx.documentfile.provider.DocumentFile
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.io.FileOutputStream

/**
 * All-files access for Geode media paths, plus SAF folder/file pickers that
 * materialize selections into app-private storage (or real paths when possible).
 */
@InvokeArg
class PickFolderArgs {
  var importToSandbox: Boolean? = true
}

@InvokeArg
class PickFileArgs {
  var extensions: Array<String>? = null
}

@TauriPlugin
class StorageAccessPlugin(private val activity: Activity) : Plugin(activity) {
  private var pendingImportToSandbox: Boolean = true

  @Command
  fun checkAllFilesAccess(invoke: Invoke) {
    val granted =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Environment.isExternalStorageManager()
      } else {
        true
      }
    val result = JSObject()
    result.put("granted", granted)
    invoke.resolve(result)
  }

  @Command
  fun requestAllFilesAccess(invoke: Invoke) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        try {
          val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
          intent.data = Uri.parse("package:${activity.packageName}")
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          activity.startActivity(intent)
        } catch (_: Exception) {
          val intent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          activity.startActivity(intent)
        }
      }
      invoke.resolve()
    } catch (ex: Exception) {
      invoke.reject(ex.message)
    }
  }

  @Command
  fun pickFolder(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(PickFolderArgs::class.java)
      pendingImportToSandbox = args.importToSandbox ?: true
      val intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
          addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION or
              Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
          )
        }
      startActivityForResult(invoke, intent, "onFolderPicked")
    } catch (ex: Exception) {
      invoke.reject(ex.message ?: "Failed to open folder picker")
    }
  }

  @ActivityCallback
  fun onFolderPicked(invoke: Invoke, result: ActivityResult) {
    try {
      if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) {
        resolvePath(invoke, null)
        return
      }
      val uri = result.data!!.data!!
      try {
        activity.contentResolver.takePersistableUriPermission(
          uri,
          Intent.FLAG_GRANT_READ_URI_PERMISSION,
        )
      } catch (_: SecurityException) {
        // Some providers do not support persistable grants; read still works for this session.
      }

      if (!pendingImportToSandbox) {
        val realPath = treeUriToFilesystemPath(uri)
        if (realPath != null) {
          resolvePath(invoke, realPath)
          return
        }
        invoke.reject(
          "Could not resolve a filesystem path for that folder. Grant All files access, then pick again.",
        )
        return
      }

      val tree =
        DocumentFile.fromTreeUri(activity, uri)
          ?: run {
            invoke.reject("Unable to access the selected folder")
            return
          }
      val dest = uniqueImportDir(tree.name ?: uri.lastPathSegment ?: "folder")
      dest.mkdirs()
      for (child in tree.listFiles()) {
        val childName = child.name ?: continue
        copyDocumentEntry(child, File(dest, childName))
      }
      resolvePath(invoke, dest.absolutePath)
    } catch (ex: Exception) {
      invoke.reject(ex.message ?: "Failed to import selected folder")
    }
  }

  @Command
  fun pickFile(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(PickFileArgs::class.java)
      val mimeTypes = mimeTypesForExtensions(args.extensions)
      val intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "*/*"
          if (mimeTypes.isNotEmpty()) {
            putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes)
          }
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
      startActivityForResult(invoke, intent, "onFilePicked")
    } catch (ex: Exception) {
      invoke.reject(ex.message ?: "Failed to open file picker")
    }
  }

  @ActivityCallback
  fun onFilePicked(invoke: Invoke, result: ActivityResult) {
    try {
      if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) {
        resolvePath(invoke, null)
        return
      }
      val uri = result.data!!.data!!
      val displayName = queryDisplayName(uri) ?: uri.lastPathSegment?.substringAfterLast('/') ?: "file"
      val dest = File(importsRoot(), "${System.currentTimeMillis()}-$displayName")
      activity.contentResolver.openInputStream(uri)?.use { input ->
        FileOutputStream(dest).use { output -> input.copyTo(output) }
      }
        ?: run {
          invoke.reject("Unable to read the selected file")
          return
        }
      resolvePath(invoke, dest.absolutePath)
    } catch (ex: Exception) {
      invoke.reject(ex.message ?: "Failed to import selected file")
    }
  }

  private fun resolvePath(invoke: Invoke, path: String?) {
    val payload = JSObject()
    payload.put("path", path)
    invoke.resolve(payload)
  }

  private fun importsRoot(): File {
    val root = File(activity.filesDir, "imports")
    if (!root.exists()) {
      root.mkdirs()
    }
    return root
  }

  private fun uniqueImportDir(name: String): File {
    val safe =
      name
        .replace(Regex("[\\\\/:*?\"<>|]"), "_")
        .trim()
        .ifEmpty { "folder" }
    return File(importsRoot(), "${System.currentTimeMillis()}-$safe")
  }

  private fun copyDocumentEntry(source: DocumentFile, dest: File) {
    if (source.isDirectory) {
      dest.mkdirs()
      for (child in source.listFiles()) {
        val childName = child.name ?: continue
        copyDocumentEntry(child, File(dest, childName))
      }
      return
    }
    if (!source.isFile) {
      return
    }
    dest.parentFile?.mkdirs()
    activity.contentResolver.openInputStream(source.uri)?.use { input ->
      FileOutputStream(dest).use { output -> input.copyTo(output) }
    }
  }

  private fun queryDisplayName(uri: Uri): String? {
    activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
      ?.use { cursor ->
        if (cursor.moveToFirst()) {
          val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          if (index >= 0) {
            return cursor.getString(index)
          }
        }
      }
    return null
  }

  private fun mimeTypesForExtensions(extensions: Array<String>?): Array<String> {
    if (extensions.isNullOrEmpty()) {
      return emptyArray()
    }
    val mime = MimeTypeMap.getSingleton()
    val types =
      extensions
        .map { it.trim().lowercase().removePrefix(".") }
        .mapNotNull { ext ->
          when (ext) {
            "zip" -> "application/zip"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "plist" -> "application/xml"
            else -> mime.getMimeTypeFromExtension(ext)
          }
        }
        .distinct()
    return types.toTypedArray()
  }

  /**
   * Best-effort mapping from a primary-storage tree URI to a real path.
   * Requires All files access for the path to be usable afterwards.
   */
  private fun treeUriToFilesystemPath(uri: Uri): String? {
    if (uri.authority != "com.android.externalstorage.documents") {
      return null
    }
    val docId =
      try {
        DocumentsContract.getTreeDocumentId(uri)
      } catch (_: Exception) {
        return null
      }
    val split = docId.split(":", limit = 2)
    val volume = split.getOrNull(0) ?: return null
    val relative = split.getOrNull(1)?.trim('/') ?: ""
    return if (volume.equals("primary", ignoreCase = true)) {
      if (relative.isEmpty()) {
        "/storage/emulated/0"
      } else {
        "/storage/emulated/0/$relative"
      }
    } else {
      if (relative.isEmpty()) {
        "/storage/$volume"
      } else {
        "/storage/$volume/$relative"
      }
    }
  }
}
