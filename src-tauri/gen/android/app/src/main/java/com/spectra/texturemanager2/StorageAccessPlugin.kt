package com.spectra.texturemanager2

import android.Manifest
import android.util.Log
import android.app.Activity
import android.app.AppOpsManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Process
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.provider.Settings
import android.webkit.MimeTypeMap
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
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
import java.util.ArrayDeque

/**
 * All-files access for Geode media paths, plus SAF pickers that materialize selections
 * into app-private storage before Rust reads them.
 *
 * Android file reads use two tiers:
 * - **All files access**: return real `/storage/...` paths when plist + atlas are readable.
 * - **SAF only**: copy picked files (and plist sibling images) into `game-files/imports`.
 */
@InvokeArg
class PickFolderArgs {
  var importToSandbox: Boolean? = false
}

@InvokeArg
class PickFileArgs {
  var extensions: Array<String>? = null
}

@InvokeArg
class SaveFileArgs {
  var defaultName: String? = null
  var extensions: Array<String>? = null
}

@InvokeArg
class CommitSaveArgs {
  var sourcePath: String? = null
}

@TauriPlugin
class StorageAccessPlugin(private val activity: Activity) : Plugin(activity) {
  private var pendingImportToSandbox: Boolean = false
  private var pendingPickFileExtensions: Array<String>? = null
  private var pendingSaveUri: Uri? = null
  private var pendingSaveDefaultName: String? = null

  companion object {
    private const val TAG = "TM.StorageAccess"
  }

  @Command
  fun checkAllFilesAccess(invoke: Invoke) {
    try {
      val allFilesGranted = hasAllFilesAccess()
      val geodeProbe = if (allFilesGranted) probeGeodeMedia() else GeodeProbe(path = null, readable = false)
      val result = JSObject()
      // Prefer camelCase keys that match the Rust/TS contract.
      result.put("allFilesGranted", allFilesGranted)
      result.put("geodeReadable", geodeProbe.readable)
      result.put("geodePath", geodeProbe.path)
      // Legacy key kept so older Rust builds keep working.
      result.put("granted", allFilesGranted)
      invoke.resolve(result)
    } catch (ex: Exception) {
      Log.e(TAG, "checkAllFilesAccess failed", ex)
      val result = JSObject()
      result.put("allFilesGranted", false)
      result.put("geodeReadable", false)
      result.put("geodePath", null)
      result.put("granted", false)
      invoke.resolve(result)
    }
  }

  /**
   * Checks whether the app has All files access (MANAGE_EXTERNAL_STORAGE).
   * On Android 11+ (API 30+), this strictly requires Environment.isExternalStorageManager()
   * or AppOpsManager OPSTR_MANAGE_EXTERNAL_STORAGE.
   * On Android 10 and below, this checks READ_EXTERNAL_STORAGE.
   */
  private fun hasAllFilesAccess(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      return ContextCompat.checkSelfPermission(
        activity,
        Manifest.permission.READ_EXTERNAL_STORAGE,
      ) == PackageManager.PERMISSION_GRANTED
    }
    if (Environment.isExternalStorageManager()) {
      return true
    }
    return manageExternalStorageAppOpAllowed()
  }

  private fun manageExternalStorageAppOpAllowed(): Boolean {
    return try {
      val appOps = activity.getSystemService(AppOpsManager::class.java) ?: return false
      val mode =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          appOps.unsafeCheckOpRawNoThrow(
            "android:manage_external_storage",
            Process.myUid(),
            activity.packageName,
          )
        } else {
          @Suppress("DEPRECATION")
          appOps.checkOpNoThrow(
            "android:manage_external_storage",
            Process.myUid(),
            activity.packageName,
          )
        }
      mode == AppOpsManager.MODE_ALLOWED
    } catch (_: Exception) {
      false
    }
  }

  private fun hasManageExternalStorage(): Boolean {
    return hasAllFilesAccess()
  }

  /** True when the mapped SAF document path is readable on disk (Geode media or full storage access). */
  private fun canReadMappedFilesystemUri(uri: Uri): Boolean {
    val fsPath = filesystemPathFromDocumentUri(uri) ?: return false
    val file = File(fsPath)
    return file.isFile && file.canRead()
  }

  /**
   * Relative atlas paths to try beside a Geode icon plist folder.
   * Geode packs usually store the sheet at `icons/{stem}.png`, not `{stem}.png`.
   */
  private fun geodeAtlasRelativeCandidates(stem: String, textureNames: Collection<String>): List<String> {
    val wanted = linkedSetOf<String>()
    wanted.add("$stem.png")
    wanted.add("icons/$stem.png")
    for (textureName in textureNames) {
      val normalized = textureName.replace('\\', '/').trimStart('/')
      if (normalized.isEmpty()) {
        continue
      }
      wanted.add(normalized)
      val base = normalized.substringAfterLast('/')
      if (base.isNotEmpty()) {
        wanted.add(base)
      }
    }
    return wanted.toList()
  }

  private fun describeAtlasCandidatesOnFilesystem(plistFsPath: String?, candidates: Collection<String>): String {
    if (plistFsPath.isNullOrBlank()) {
      return "picker URI could not be mapped to a filesystem path (SAF parent-folder import was attempted)"
    }
    val parent = File(plistFsPath).parentFile ?: return "plist has no parent folder"
    return candidates.joinToString("; ") { relative ->
      val file = File(parent, relative)
      when {
        file.isFile && file.canRead() && file.length() > 0L -> "$relative (${file.length()} bytes)"
        file.isFile -> "$relative (unreadable or empty)"
        else -> "$relative (missing)"
      }
    }
  }

  private data class GeodeProbe(val path: String?, val readable: Boolean)

  private fun probeGeodeMedia(): GeodeProbe {
    return try {
      val packages = arrayOf("com.geode.launcher", "com.geode.launcher.play")
      for (root in primaryStorageRoots()) {
        for (packageId in packages) {
          val geode = File(root, "Android/media/$packageId/game/geode")
          if (!geode.isDirectory || !geode.canRead()) {
            continue
          }
          if (canReadAnyFileUnder(geode)) {
            val game = geode.parentFile?.absolutePath
            return GeodeProbe(path = game, readable = true)
          }
        }
      }
      GeodeProbe(path = null, readable = false)
    } catch (ex: Exception) {
      Log.w(TAG, "probeGeodeMedia failed", ex)
      GeodeProbe(path = null, readable = false)
    }
  }

  private fun canReadAnyFileUnder(dir: File): Boolean {
    val queue = ArrayDeque<File>()
    queue.add(dir)
    var visited = 0
    while (queue.isNotEmpty() && visited < 64) {
      val current = queue.removeFirst()
      visited += 1
      val children = current.listFiles() ?: continue
      for (child in children) {
        if (child.isFile && child.canRead()) {
          return true
        }
        if (child.isDirectory && child.canRead()) {
          queue.add(child)
        }
      }
    }
    return false
  }

  private fun primaryStorageRoots(): List<File> {
    val roots = linkedSetOf<File>()
    try {
      Environment.getExternalStorageDirectory()?.let { roots.add(it) }
    } catch (_: Exception) {
      // Ignore — fall through to hard-coded roots.
    }
    roots.add(File("/storage/emulated/0"))
    roots.add(File("/sdcard"))
    return roots.toList()
  }

  @Command
  fun requestAllFilesAccess(invoke: Invoke) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        try {
          val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
            data = Uri.parse("package:${activity.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          activity.startActivity(intent)
        } catch (_: Exception) {
          val intent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          activity.startActivity(intent)
        }
      } else {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
          data = Uri.parse("package:${activity.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        activity.startActivity(intent)
      }
      invoke.resolve()
    } catch (ex: Exception) {
      Log.e(TAG, "requestAllFilesAccess failed", ex)
      invoke.reject(ex.message ?: "Failed to open settings")
    }
  }

  @Command
  fun pickFolder(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(PickFolderArgs::class.java)
      pendingImportToSandbox = args.importToSandbox ?: false
      val intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
          addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION or
              Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
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
        val flags =
          (result.data!!.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION))
            .let { if (it != 0) it else (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION) }
        activity.contentResolver.takePersistableUriPermission(
          uri,
          flags,
        )
      } catch (_: SecurityException) {
        // Some providers do not support persistable grants; read still works for this session.
      }

      val realPath = filesystemPathFromTreeUri(uri)
      if (realPath != null) {
        Log.i(TAG, "Using filesystem folder path: $realPath")
        resolvePath(invoke, realPath)
        return
      }

      if (!pendingImportToSandbox) {
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
      pendingPickFileExtensions = args.extensions
      val mimeTypes = mimeTypesForExtensions(args.extensions)
      val intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "*/*"
          if (mimeTypes.isNotEmpty()) {
            putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes)
          }
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
          }
        }
      startActivityForResult(invoke, intent, "onFilePicked")
    } catch (ex: Exception) {
      pendingPickFileExtensions = null
      invoke.reject(ex.message ?: "Failed to open file picker")
    }
  }

  @Command
  fun saveFile(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(SaveFileArgs::class.java)
      pendingSaveUri = null
      pendingSaveDefaultName = args.defaultName?.trim()?.ifEmpty { null } ?: "file"
      val mimeTypes = mimeTypesForExtensions(args.extensions)
      val intent =
        Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = primaryMimeTypeForExtensions(args.extensions) ?: "*/*"
          putExtra(Intent.EXTRA_TITLE, pendingSaveDefaultName)
          if (mimeTypes.isNotEmpty()) {
            putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes)
          }
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        }
      startActivityForResult(invoke, intent, "onSaveFilePicked")
    } catch (ex: Exception) {
      pendingSaveDefaultName = null
      invoke.reject(ex.message ?: "Failed to open save picker")
    }
  }

  @ActivityCallback
  fun onSaveFilePicked(invoke: Invoke, result: ActivityResult) {
    val defaultName = pendingSaveDefaultName
    pendingSaveDefaultName = null
    try {
      if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) {
        pendingSaveUri = null
        resolveSavePick(invoke, null, false)
        return
      }
      val uri = result.data!!.data!!
      pendingSaveUri = uri
      Log.i(
        TAG,
        "Save picked: name=$defaultName authority=${uri.authority} docId=${documentIdFromUri(uri)} uri=$uri",
      )
      val effectiveName =
        defaultName
          ?: filenameFromDocumentUri(uri)
          ?: queryDisplayName(uri)
          ?: uri.lastPathSegment?.substringAfterLast('/')
          ?: "file"
      val mappedPath = filesystemPathFromDocumentUri(uri) ?: filesystemPathForSaveUri(uri, effectiveName)
      if (mappedPath != null && isWritableFilesystemDestination(File(mappedPath))) {
        Log.i(TAG, "Save using writable filesystem path: $mappedPath")
        resolveSavePick(invoke, mappedPath, false)
        return
      }
      val stagingDir =
        File(activity.filesDir, "game-files/staging/${System.currentTimeMillis()}").also { it.mkdirs() }
      val staged = File(stagingDir, effectiveName)
      Log.i(TAG, "Save staging to ${staged.absolutePath} (commit via SAF after write)")
      resolveSavePick(invoke, staged.absolutePath, true)
    } catch (ex: Exception) {
      pendingSaveUri = null
      invoke.reject(ex.message ?: "Failed to prepare save location")
    }
  }

  @Command
  fun commitSave(invoke: Invoke) {
    try {
      val args = invoke.parseArgs(CommitSaveArgs::class.java)
      val sourcePath = args.sourcePath?.trim()
      if (sourcePath.isNullOrEmpty()) {
        invoke.reject("Missing source path for save commit")
        return
      }
      val source = File(sourcePath)
      if (!source.isFile || source.length() <= 0L) {
        invoke.reject("Saved file is missing or empty at $sourcePath")
        return
      }
      val destUri = pendingSaveUri
      if (destUri == null) {
        invoke.reject("No pending save location. Pick a save location again.")
        return
      }
      if (!copyFileToUri(source, destUri)) {
        invoke.reject("Failed to write the saved file to the selected location")
        return
      }
      if (source.name.lowercase().endsWith(".plist")) {
        commitPlistAtlasSiblingsToSaveUri(destUri, source)
      }
      pendingSaveUri = null
      invoke.resolve()
    } catch (ex: Exception) {
      invoke.reject(ex.message ?: "Failed to commit save")
    }
  }

  @ActivityCallback
  fun onFilePicked(invoke: Invoke, result: ActivityResult) {
    val allowedExtensions = pendingPickFileExtensions
    pendingPickFileExtensions = null
    try {
      if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) {
        resolvePath(invoke, null)
        return
      }
      val uri = result.data!!.data!!
      try {
        val takeFlags =
          (result.data!!.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION))
        activity.contentResolver.takePersistableUriPermission(uri, takeFlags)
      } catch (_: Exception) {
        // Optional — temporary grant from OPEN_DOCUMENT is enough for one-shot import.
      }
      val displayName = queryDisplayName(uri) ?: uri.lastPathSegment?.substringAfterLast('/') ?: "file"
      val effectiveName = filenameFromDocumentUri(uri) ?: displayName
      if (!extensionAllowed(effectiveName, allowedExtensions)) {
        val allowed = normalizeExtensionTokens(allowedExtensions)
        val hint =
          if (allowed.isNotEmpty()) {
            allowed.joinToString(", ") { ".$it" }
          } else {
            "allowed type"
          }
        invoke.reject("Selected file type is not allowed ($hint)")
        return
      }
      val isPlist = effectiveName.substringAfterLast('.', "").equals("plist", ignoreCase = true)
      if (isPlist) {
        Log.i(TAG, "Plist picked: name=$effectiveName authority=${uri.authority} docId=${documentIdFromUri(uri)} uri=$uri")
        val filesystemPlist = tryFilesystemPlistPath(uri, effectiveName)
        if (filesystemPlist != null) {
          Log.i(TAG, "Using filesystem plist path: $filesystemPlist")
          resolvePath(invoke, filesystemPlist)
          return
        }
        Log.i(TAG, "Materializing plist to sandbox (no readable filesystem plist+atlas)")
        val stem = effectiveName.substringBeforeLast('.', effectiveName)
        val plistDest = materializePlistToSandbox(uri, effectiveName)
        val destDir = plistDest.parentFile ?: plistDest
        Log.i(
          TAG,
          "Sandbox plist=${plistDest.absolutePath} folder=${describeDirectoryFiles(destDir)}",
        )
        if (!atlasImportedInDirectory(destDir, stem, plistDest)) {
          val folderListing = describeDirectoryFiles(destDir)
          val fsPath = filesystemPathFromDocumentUri(uri)
          val textureNames = textureNamesFromImportedPlist(plistDest)
          val candidates = geodeAtlasRelativeCandidates(stem, textureNames)
          val atlasStatus = describeAtlasCandidatesOnFilesystem(fsPath, candidates)
          val geodeStatus = describeGeodeFilesystemSearch(effectiveName, plistDest)
          val hint =
            if (!hasManageExternalStorage() && fsPath == null) {
              "Grant All files access for Texture Manager in Android Settings, then pick the plist again."
            } else {
              "Atlas not imported. On disk: $atlasStatus. Geode: $geodeStatus. Import folder: $folderListing"
            }
          Log.e(TAG, "Atlas import failed for $stem (fs=$fsPath manager=${hasManageExternalStorage()}): $hint")
          invoke.reject("Icon sheet PNG could not be imported beside the plist. $hint")
          return
        }
        resolvePath(invoke, plistDest.absolutePath)
        return
      }
      val fsPath = filesystemPathFromDocumentUri(uri)
      if (fsPath != null && File(fsPath).canRead()) {
        Log.i(TAG, "Using filesystem file path: $fsPath")
        resolvePath(invoke, fsPath)
        return
      }
      val destDir = importsRoot()
      val dest = File(destDir, "${System.currentTimeMillis()}-$effectiveName")
      if (!copyUriToFile(uri, dest)) {
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

  private fun resolveSavePick(invoke: Invoke, path: String?, needsCommit: Boolean) {
    val payload = JSObject()
    payload.put("path", path)
    payload.put("needsCommit", needsCommit)
    invoke.resolve(payload)
  }

  /**
   * Match Rust [`resolve_game_files_root`]/`imports` (`app_data_dir/game-files/imports`).
   */
  private fun importsRoot(): File {
    val root = File(activity.filesDir, "game-files/imports")
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

  /**
   * Tier A: return the real plist path only when the picker URI maps to a readable plist+atlas.
   * Never substitute a different on-disk plist with the same filename (vanilla vs custom mod).
   */
  private fun tryFilesystemPlistPath(uri: Uri, displayName: String): String? {
    val mappedPath = filesystemPathFromDocumentUri(uri)
    if (mappedPath == null) {
      Log.d(TAG, "Filesystem plist path: URI could not be mapped for $displayName")
      return null
    }
    val plist = File(mappedPath)
    if (!plist.isFile || !plist.canRead()) {
      Log.d(TAG, "Filesystem plist path skipped: not readable at $mappedPath")
      return null
    }
    if (atlasReadableOnFilesystem(plist)) {
      Log.i(TAG, "Using mapped filesystem plist+atlas at $mappedPath")
      return mappedPath
    }
    val stem = plist.name.substringBeforeLast('.', plist.name)
    val tried =
      describeAtlasCandidatesOnFilesystem(
        mappedPath,
        geodeAtlasRelativeCandidates(stem, textureNamesFromImportedPlist(plist)),
      )
    Log.w(TAG, "Mapped plist readable but atlas missing at $mappedPath; tried=$tried")
    return null
  }

  private fun hasFilesystemSearchAccess(): Boolean {
    return hasManageExternalStorage() || probeGeodeMedia().readable
  }

  private fun geodeSearchRoots(): List<File> {
    val roots = linkedSetOf<File>()
    val packages = arrayOf("com.geode.launcher", "com.geode.launcher.play")
    for (storageRoot in primaryStorageRoots()) {
      for (packageId in packages) {
        roots.add(File(storageRoot, "Android/media/$packageId/game/geode"))
        roots.add(File(storageRoot, "Android/media/$packageId/game"))
      }
      roots.add(File(storageRoot, "Android/media"))
    }
    return roots.filter { it.isDirectory && it.canRead() }
  }

  private fun findReadableFilesByName(searchRoots: List<File>, filename: String, maxResults: Int = 8): List<File> {
    val matches = mutableListOf<File>()
    val queue = ArrayDeque<Pair<File, Int>>()
    for (root in searchRoots) {
      queue.add(root to 0)
    }
    while (queue.isNotEmpty() && matches.size < maxResults) {
      val (dir, depth) = queue.removeFirst()
      if (depth > 14) {
        continue
      }
      val children = dir.listFiles() ?: continue
      for (child in children) {
        when {
          child.isFile &&
            child.name.equals(filename, ignoreCase = true) &&
            child.canRead() -> {
            matches.add(child)
          }
          child.isDirectory && child.canRead() -> {
            queue.add(child to depth + 1)
          }
        }
      }
    }
    return matches
  }

  private fun plistBytesMatch(source: File, expectedBytes: ByteArray): Boolean {
    if (!source.isFile || !source.canRead()) {
      return false
    }
    return try {
      source.readBytes().contentEquals(expectedBytes)
    } catch (_: Exception) {
      false
    }
  }

  private fun describeGeodeFilesystemSearch(filename: String, pickedPlist: File? = null): String {
    if (!hasFilesystemSearchAccess()) {
      return "storage search skipped (no read access)"
    }
    val expectedBytes =
      pickedPlist?.let {
        try {
          it.readBytes()
        } catch (_: Exception) {
          null
        }
      }
    val matches = findReadableFilesByName(geodeSearchRoots(), filename, maxResults = 3)
    if (matches.isEmpty()) {
      return "no readable `$filename` under Android/media"
    }
    return matches.joinToString("; ") { match ->
      val samePlist =
        expectedBytes == null || plistBytesMatch(match, expectedBytes)
      val atlasOk = atlasReadableOnFilesystem(match)
      "${match.absolutePath} samePlist=$samePlist atlas=${if (atlasOk) "ok" else "missing"}"
    }
  }

  private fun atlasReadableOnFilesystem(plistFile: File): Boolean {
    val parent = plistFile.parentFile ?: return false
    val stem = plistFile.name.substringBeforeLast('.', plistFile.name)
    for (relative in geodeAtlasRelativeCandidates(stem, textureNamesFromImportedPlist(plistFile))) {
      val candidate = File(parent, relative)
      if (candidate.isFile && candidate.canRead() && candidate.length() > 0L) {
        return true
      }
    }
    return false
  }

  /**
   * Tier B (SAF): copy plist + every image in its parent folder into app sandbox.
   * Rust only ever sees absolute paths under [importsRoot].
   */
  private fun materializePlistToSandbox(uri: Uri, displayName: String): File {
    val stem = displayName.substringBeforeLast('.', displayName)
    val destDir = uniqueImportDir(stem).also { it.mkdirs() }
    val dest = File(destDir, displayName)
    if (!copyUriToFile(uri, dest)) {
      throw IllegalStateException("Unable to read the selected plist")
    }
    importPlistAtlasImages(uri, destDir, dest, stem, displayName)
    val stemPng = File(destDir, "$stem.png")
    Log.i(
      TAG,
      "Plist materialized: plist=${dest.name} stemPng=${stemPng.exists()} (${stemPng.length()} bytes) siblings=${describeDirectoryFiles(destDir)}",
    )
    return dest
  }

  private fun atlasImportedInDirectory(destDir: File, stem: String, plistFile: File): Boolean {
    for (relative in geodeAtlasRelativeCandidates(stem, textureNamesFromImportedPlist(plistFile))) {
      val baseName = relative.substringAfterLast('/')
      if (!isImageFilename(baseName)) {
        continue
      }
      val flat = File(destDir, baseName)
      if (flat.isFile && flat.length() > 0L) {
        return true
      }
      if (relative.contains('/')) {
        val nested = File(destDir, relative.replace('\\', '/'))
        if (nested.isFile && nested.length() > 0L) {
          return true
        }
      }
    }
    return false
  }

  /** Copy plist atlas images: Geode search, SAF parent listing, filesystem, metadata paths. */
  private fun importPlistAtlasImages(
    plistUri: Uri,
    destDir: File,
    importedPlist: File,
    stem: String,
    plistFilename: String,
  ) {
    importAtlasFromGeodeFilesystemSearch(plistFilename, destDir, stem, importedPlist)
    // SAF single-file picks do not grant sibling read access; this often fails silently.
    importAtlasViaParentDocument(plistUri, destDir, stem, importedPlist)
    val fsPath = filesystemPathFromDocumentUri(plistUri)
    if (fsPath != null && File(fsPath).isFile && File(fsPath).canRead()) {
      importGeodeAtlasCandidatesFromFilesystem(fsPath, importedPlist, destDir, stem)
      importImagesFromFilesystemSubdir(fsPath, destDir, "icons")
    }
    importStemPngSibling(plistUri, destDir, stem)
    importAllSiblingImages(plistUri, destDir)
    importImagesViaChildDocumentQuery(plistUri, "icons", destDir)
    val textureNames = textureNamesFromImportedPlist(importedPlist)
    for (relative in geodeAtlasRelativeCandidates(stem, textureNames)) {
      val baseName = relative.substringAfterLast('/')
      if (!isImageFilename(baseName)) {
        continue
      }
      importDocumentRelativeSibling(plistUri, relative, File(destDir, baseName))
      if (relative.contains('/')) {
        importDocumentRelativeSibling(
          plistUri,
          relative,
          File(destDir, relative.replace('\\', '/')),
        )
      }
    }
  }

  private fun importAtlasFromGeodeFilesystemSearch(
    plistFilename: String,
    destDir: File,
    stem: String,
    importedPlist: File,
  ) {
    if (!hasFilesystemSearchAccess()) {
      return
    }
    val expectedBytes =
      try {
        importedPlist.readBytes()
      } catch (_: Exception) {
        return
      }
    val matches = findReadableFilesByName(geodeSearchRoots(), plistFilename)
    for (match in matches) {
      if (!plistBytesMatch(match, expectedBytes)) {
        Log.d(TAG, "Geode atlas import skip ${match.absolutePath}: plist bytes differ from picked file")
        continue
      }
      Log.i(TAG, "Geode filesystem atlas import beside ${match.absolutePath}")
      importGeodeAtlasCandidatesFromFilesystem(match.absolutePath, importedPlist, destDir, stem)
      importImagesFromFilesystemSubdir(match.absolutePath, destDir, "icons")
      if (atlasImportedInDirectory(destDir, stem, importedPlist)) {
        return
      }
    }
  }

  /**
   * List the picked plist's parent folder (and Geode `icons/` child) via SAF and copy atlas PNGs.
   * Does not require [filesystemPathFromDocumentUri] to succeed.
   */
  private fun importAtlasViaParentDocument(
    plistUri: Uri,
    destDir: File,
    stem: String,
    importedPlist: File,
  ) {
    val parentUri = parentDocumentUri(plistUri)
    if (parentUri == null) {
      Log.w(
        TAG,
        "importAtlasViaParentDocument: no parent URI for $plistUri (docId=${documentIdFromUri(plistUri)})",
      )
      return
    }
    Log.i(TAG, "importAtlasViaParentDocument: parent=$parentUri")
    val wantedNames =
      geodeAtlasRelativeCandidates(stem, textureNamesFromImportedPlist(importedPlist))
        .map { it.substringAfterLast('/') }
        .filter { isImageFilename(it) }
        .toSet()
    importMatchingImagesFromDocumentFolder(parentUri, destDir, wantedNames, null)
    val iconsUri = findChildDocumentUriByName(parentUri, "icons")
    if (iconsUri != null) {
      Log.i(TAG, "importAtlasViaParentDocument: icons folder=$iconsUri")
      importMatchingImagesFromDocumentFolder(iconsUri, destDir, wantedNames, null)
      importMatchingImagesFromDocumentFolder(iconsUri, destDir, wantedNames, "icons")
    }
  }

  /** Build the parent document URI from volume:relative doc id (API-safe alternative to getParentDocumentUri). */
  private fun parentDocumentUri(documentUri: Uri): Uri? {
    val authority = documentUri.authority ?: return null
    val parsed = parseDocumentVolumeAndRelativePath(documentUri) ?: return null
    val relative = parsed.second
    val slash = relative.lastIndexOf('/')
    if (slash < 0) {
      return null
    }
    val parentRelative = relative.substring(0, slash)
    val parentDocId = "${parsed.first}:$parentRelative"
    return try {
      DocumentsContract.buildDocumentUri(authority, parentDocId)
    } catch (_: Exception) {
      null
    }
  }

  private fun findChildDocumentUriByName(parentUri: Uri, childName: String): Uri? {
    val authority = parentUri.authority ?: return null
    val parentDocId = documentIdFromUri(parentUri) ?: return null
    val childrenUri = DocumentsContract.buildChildDocumentsUri(authority, parentDocId)
    try {
      activity.contentResolver
        .query(
          childrenUri,
          arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
          ),
          null,
          null,
          null,
        )
        ?.use { cursor ->
          val idCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
          val nameCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
          val mimeCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
          if (idCol < 0 || nameCol < 0) {
            return null
          }
          while (cursor.moveToNext()) {
            val name = cursor.getString(nameCol) ?: continue
            if (!name.equals(childName, ignoreCase = true)) {
              continue
            }
            if (mimeCol >= 0) {
              val mime = cursor.getString(mimeCol)
              if (mime != null && mime != DocumentsContract.Document.MIME_TYPE_DIR) {
                continue
              }
            }
            val childId = cursor.getString(idCol) ?: continue
            return DocumentsContract.buildDocumentUri(authority, childId)
          }
        }
    } catch (_: Exception) {
      // Provider may block child listing.
    }
    return null
  }

  private fun importMatchingImagesFromDocumentFolder(
    folderUri: Uri,
    destDir: File,
    wantedNames: Set<String>,
    nestedPrefix: String?,
  ) {
    val authority = folderUri.authority ?: return
    val folderDocId = documentIdFromUri(folderUri) ?: return
    val childrenUri = DocumentsContract.buildChildDocumentsUri(authority, folderDocId)
    try {
      activity.contentResolver
        .query(
          childrenUri,
          arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
          ),
          null,
          null,
          null,
        )
        ?.use { cursor ->
          val idCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
          val nameCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
          if (idCol < 0 || nameCol < 0) {
            return
          }
          while (cursor.moveToNext()) {
            val name = cursor.getString(nameCol) ?: continue
            if (!isImageFilename(name)) {
              continue
            }
            if (wantedNames.isNotEmpty() && !wantedNames.any { it.equals(name, ignoreCase = true) }) {
              continue
            }
            val childId = cursor.getString(idCol) ?: continue
            val childUri = DocumentsContract.buildDocumentUri(authority, childId)
            val flatDest = File(destDir, name)
            if (!(flatDest.isFile && flatDest.length() > 0L)) {
              copyUriToFile(childUri, flatDest)
            }
            if (nestedPrefix != null) {
              val nestedDest = File(destDir, "$nestedPrefix/$name")
              if (!(nestedDest.isFile && nestedDest.length() > 0L)) {
                nestedDest.parentFile?.mkdirs()
                copyUriToFile(childUri, nestedDest)
              }
            }
          }
        }
    } catch (ex: Exception) {
      Log.w(TAG, "importMatchingImagesFromDocumentFolder failed for $folderUri: ${ex.message}")
    }
  }

  private fun importGeodeAtlasCandidatesFromFilesystem(
    plistFsPath: String,
    importedPlist: File,
    destDir: File,
    stem: String,
  ) {
    val parent = File(plistFsPath).parentFile ?: return
    for (relative in geodeAtlasRelativeCandidates(stem, textureNamesFromImportedPlist(importedPlist))) {
      val baseName = relative.substringAfterLast('/')
      if (!isImageFilename(baseName)) {
        continue
      }
      copyFilesystemFileIfReadable(File(parent, relative), File(destDir, baseName))
      if (relative.contains('/')) {
        copyFilesystemFileIfReadable(File(parent, relative), File(destDir, relative.replace('\\', '/')))
      }
    }
  }

  private fun importImagesFromFilesystemSubdir(plistFsPath: String, destDir: File, subdirName: String) {
    val subdir = File(File(plistFsPath).parentFile, subdirName)
    if (!subdir.isDirectory || !subdir.canRead()) {
      return
    }
    subdir.listFiles()?.forEach { file ->
      if (!file.isFile || !isImageFilename(file.name)) {
        return@forEach
      }
      copyFilesystemFileIfReadable(file, File(destDir, file.name))
      copyFilesystemFileIfReadable(file, File(destDir, "$subdirName/${file.name}"))
    }
  }

  private fun importDocumentRelativeSibling(plistUri: Uri, relativeFromParent: String, dest: File) {
    if (dest.isFile && dest.length() > 0L) {
      return
    }
    val normalized = relativeFromParent.replace('\\', '/').trimStart('/')
    if (normalized.isEmpty()) {
      return
    }
    val authority = plistUri.authority ?: return
    val parsed = parseDocumentVolumeAndRelativePath(plistUri) ?: return
    val volume = parsed.first
    val relativePath = parsed.second
    val slash = relativePath.lastIndexOf('/')
    if (slash < 0) {
      return
    }
    val parentRelative = relativePath.substring(0, slash)
    val siblingDocId = "$volume:$parentRelative/$normalized"
    try {
      val siblingUri = DocumentsContract.buildDocumentUri(authority, siblingDocId)
      copyUriToFile(siblingUri, dest)
    } catch (_: Exception) {
      // Fall through — filesystem copy may still work.
    }
    filesystemPathFromDocumentUri(plistUri)?.let { plistFsPath ->
      val parent = File(plistFsPath).parentFile ?: return@let
      copyFilesystemFileIfReadable(File(parent, normalized), dest)
    }
  }

  private fun textureNamesFromImportedPlist(plistFile: File): List<String> {
    if (!plistFile.isFile) {
      return emptyList()
    }
    val text =
      try {
        plistFile.readText()
      } catch (_: Exception) {
        return emptyList()
      }
    val names = mutableListOf<String>()
    val patterns =
      listOf(
        Regex("<key>textureFileName</key>\\s*<string>([^<]+)</string>", RegexOption.IGNORE_CASE),
        Regex("<key>realTextureFileName</key>\\s*<string>([^<]+)</string>", RegexOption.IGNORE_CASE),
      )
    for (pattern in patterns) {
      pattern.findAll(text).forEach { match ->
        val name = match.groupValues[1].trim()
        if (name.isNotEmpty()) {
          names.add(name)
        }
      }
    }
    if (names.isEmpty()) {
      val raw =
        try {
          String(plistFile.readBytes(), Charsets.ISO_8859_1)
        } catch (_: Exception) {
          ""
        }
      Regex("icons/[A-Za-z0-9_\\-]+\\.png", RegexOption.IGNORE_CASE)
        .findAll(raw)
        .forEach { match -> names.add(match.value) }
    }
    return names.distinct()
  }

  private fun describeDirectoryFiles(dir: File?, limit: Int = 16): String {
    if (dir == null || !dir.isDirectory) {
      return "(no folder)"
    }
    val names =
      dir.listFiles()
        ?.filter { it.isFile }
        ?.map { it.name }
        ?.sorted()
        ?: emptyList()
    if (names.isEmpty()) {
      return "(empty)"
    }
    val shown = names.take(limit).joinToString(", ")
    return if (names.size > limit) {
      "$shown (+${names.size - limit} more)"
    } else {
      shown
    }
  }

  /** Copy `{stem}.png` from the plist's folder (plist path with `.png` extension). */
  private fun importStemPngSibling(plistUri: Uri, destDir: File, plistStem: String) {
    val dest = File(destDir, "$plistStem.png")
    if (dest.isFile && dest.length() > 0L) {
      return
    }
    val authority = plistUri.authority ?: return
    val parsed = parseDocumentVolumeAndRelativePath(plistUri) ?: return
    val volume = parsed.first
    val relativePath = parsed.second
    val slash = relativePath.lastIndexOf('/')
    if (slash < 0) {
      return
    }
    val parentRelative = relativePath.substring(0, slash)
    val siblingDocId = "$volume:$parentRelative/$plistStem.png"
    try {
      val siblingUri = DocumentsContract.buildDocumentUri(authority, siblingDocId)
      copyUriToFile(siblingUri, dest)
    } catch (_: Exception) {
      // Fall through — filesystem / parent-folder import may still succeed.
    }
    filesystemPathFromDocumentUri(plistUri)?.let { plistFsPath ->
      val parent = File(plistFsPath).parentFile ?: return@let
      copyFilesystemFileIfReadable(File(parent, "$plistStem.png"), dest)
      copyFilesystemFileIfReadable(File(parent, "icons/$plistStem.png"), dest)
    }
    importDocumentRelativeSibling(plistUri, "icons/$plistStem.png", dest)
  }

  private fun atlasReadableBesidePlist(plistFile: File): Boolean {
    val parent = plistFile.parentFile ?: return false
    if (!parent.isDirectory) {
      return false
    }
    val stem = plistFile.name.substringBeforeLast('.', plistFile.name)
    val stemPng = File(parent, "$stem.png")
    if (stemPng.isFile && stemPng.canRead() && stemPng.length() > 0L) {
      return true
    }
    val images =
      parent
        .listFiles()
        ?.filter { file ->
          file.isFile && isImageFilename(file.name) && file.canRead() && file.length() > 0L
        }
        ?: emptyList()
    for (image in images) {
      if (image.name.equals("$stem.png", ignoreCase = true)) {
        return true
      }
    }
    return images.size == 1
  }

  /** Copy all images from the picked document's parent folder into [destDir]. */
  private fun importAllSiblingImages(uri: Uri, destDir: File) {
    importImagesViaParentDocumentQuery(uri, destDir)
    filesystemPathFromDocumentUri(uri)?.let { importAllImagesFromFilesystemParent(it, destDir) }
  }

  /** List parent folder children through the DocumentsProvider (works without All files access). */
  private fun importImagesViaParentDocumentQuery(plistUri: Uri, destDir: File) {
    val authority = plistUri.authority ?: return
    val parsed = parseDocumentVolumeAndRelativePath(plistUri) ?: return
    val volume = parsed.first
    val relativePath = parsed.second
    val slash = relativePath.lastIndexOf('/')
    if (slash < 0) {
      return
    }
    val parentDocId = "$volume:${relativePath.substring(0, slash)}"
    val childrenUri = DocumentsContract.buildChildDocumentsUri(authority, parentDocId)
    try {
      activity.contentResolver
        .query(
          childrenUri,
          arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
          ),
          null,
          null,
          null,
        )
        ?.use { cursor ->
          val idCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
          val nameCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
          if (idCol < 0 || nameCol < 0) {
            return
          }
          while (cursor.moveToNext()) {
            val childId = cursor.getString(idCol) ?: continue
            val name = cursor.getString(nameCol) ?: continue
            if (!isImageFilename(name)) {
              continue
            }
            val destFile = File(destDir, name)
            if (destFile.isFile && destFile.length() > 0L) {
              continue
            }
            val childUri = DocumentsContract.buildDocumentUri(authority, childId)
            copyUriToFile(childUri, destFile)
          }
        }
    } catch (_: Exception) {
      // Provider may block child listing when All files access is missing.
    }
  }

  /** Import images from a subfolder next to the plist (e.g. Geode `icons/`). */
  private fun importImagesViaChildDocumentQuery(plistUri: Uri, childFolder: String, destDir: File) {
    val authority = plistUri.authority ?: return
    val parsed = parseDocumentVolumeAndRelativePath(plistUri) ?: return
    val volume = parsed.first
    val relativePath = parsed.second
    val slash = relativePath.lastIndexOf('/')
    if (slash < 0) {
      return
    }
    val parentRelative = relativePath.substring(0, slash)
    val childDocId = "$volume:$parentRelative/$childFolder"
    val childrenUri = DocumentsContract.buildChildDocumentsUri(authority, childDocId)
    try {
      activity.contentResolver
        .query(
          childrenUri,
          arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
          ),
          null,
          null,
          null,
        )
        ?.use { cursor ->
          val idCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
          val nameCol = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
          if (idCol < 0 || nameCol < 0) {
            return
          }
          while (cursor.moveToNext()) {
            val childId = cursor.getString(idCol) ?: continue
            val name = cursor.getString(nameCol) ?: continue
            if (!isImageFilename(name)) {
              continue
            }
            val flatDest = File(destDir, name)
            if (!(flatDest.isFile && flatDest.length() > 0L)) {
              val childUri = DocumentsContract.buildDocumentUri(authority, childId)
              copyUriToFile(childUri, flatDest)
            }
            val nestedDest = File(destDir, "$childFolder/$name")
            if (!(nestedDest.isFile && nestedDest.length() > 0L)) {
              val childUri = DocumentsContract.buildDocumentUri(authority, childId)
              nestedDest.parentFile?.mkdirs()
              copyUriToFile(childUri, nestedDest)
            }
          }
        }
    } catch (_: Exception) {
      // Provider may block nested listing.
    }
  }

  private fun copyFilesystemFileIfReadable(source: File, dest: File) {
    if (!source.isFile || !source.canRead() || source.length() <= 0L) {
      return
    }
    if (dest.isFile && dest.length() > 0L) {
      return
    }
    try {
      dest.parentFile?.mkdirs()
      source.copyTo(dest, overwrite = true)
      if (!(dest.isFile && dest.length() > 0L)) {
        dest.delete()
      }
    } catch (_: Exception) {
      // Fall through — other import strategies may still succeed.
    }
  }

  private fun copyUriToFile(sourceUri: Uri, dest: File): Boolean {
    if (dest.isFile && dest.length() > 0L) {
      return true
    }
    try {
      dest.parentFile?.mkdirs()
      activity.contentResolver.openInputStream(sourceUri)?.use { input ->
        FileOutputStream(dest).use { output -> input.copyTo(output) }
      }
      if (dest.isFile && dest.length() > 0L) {
        return true
      }
    } catch (_: Exception) {
      // Fall through to DocumentFile copy.
    }
    try {
      val document = DocumentFile.fromSingleUri(activity, sourceUri)
      if (document != null && document.isFile) {
        dest.parentFile?.mkdirs()
        activity.contentResolver.openInputStream(document.uri)?.use { input ->
          FileOutputStream(dest).use { output -> input.copyTo(output) }
        }
        if (dest.isFile && dest.length() > 0L) {
          return true
        }
      }
    } catch (_: Exception) {
      // No readable content for this URI.
    }
    return false
  }

  /**
   * Document id from SAF URIs. [DocumentsContract.getDocumentId] fails on some providers;
   * fall back to encoded path segments (`primary:Android/media/...`).
   */
  private fun documentIdFromUri(uri: Uri): String? {
    try {
      val id = DocumentsContract.getDocumentId(uri)
      if (id.isNotEmpty()) {
        return id
      }
    } catch (_: Exception) {
      // Fall through to URI parsing.
    }
    val last = uri.lastPathSegment
    if (last != null) {
      val decoded = Uri.decode(last)
      if (decoded.contains(':') || decoded.startsWith("raw:")) {
        return decoded
      }
    }
    val path = uri.path
    if (path != null) {
      when {
        path.contains("/document/") -> {
          val part = Uri.decode(path.substringAfter("/document/", ""))
          if (part.isNotEmpty()) {
            return part
          }
        }
        path.contains("/tree/") -> {
          val part = Uri.decode(path.substringAfter("/tree/", ""))
          if (part.isNotEmpty()) {
            return part
          }
        }
      }
    }
    uri.getQueryParameter("documentId")?.let { param ->
      val decoded = Uri.decode(param)
      if (decoded.isNotEmpty()) {
        return decoded
      }
    }
    return null
  }

  private fun parseDocumentVolumeAndRelativePath(uri: Uri): Pair<String, String>? {
    val docId = documentIdFromUri(uri) ?: return null
    if (docId.startsWith("raw:")) {
      val rawPath = Uri.decode(docId.substring(4))
      val file = File(rawPath)
      val parent = file.parentFile ?: return null
      for (root in primaryStorageRoots()) {
        if (!isPathUnderRoot(parent, root)) {
          continue
        }
        val rootPath = canonicalPathOrAbsolute(root)
        val parentPath = canonicalPathOrAbsolute(parent)
        val relative = parentPath.removePrefix(rootPath).trimStart('/') + "/" + file.name
        return "primary" to relative
      }
      return null
    }
    val colon = docId.indexOf(':')
    if (colon < 0) {
      return null
    }
    val volume = docId.substring(0, colon)
    val relative = Uri.decode(docId.substring(colon + 1).trim('/'))
    return volume to relative
  }

  private fun canonicalPathOrAbsolute(file: File): String {
    return try {
      file.canonicalPath
    } catch (_: Exception) {
      file.absolutePath
    }
  }

  private fun isPathUnderRoot(path: File, root: File): Boolean {
    val pathCanonical = canonicalPathOrAbsolute(path)
    val rootCanonical = canonicalPathOrAbsolute(root)
    return pathCanonical == rootCanonical || pathCanonical.startsWith("$rootCanonical/")
  }

  private fun filesystemPathFromDocumentUri(uri: Uri): String? {
    if (uri.scheme.equals("file", ignoreCase = true)) {
      val path = uri.path
      if (path != null) {
        val file = File(path)
        if (file.isFile) {
          return path
        }
      }
    }

    val docId = documentIdFromUri(uri)
    if (docId != null && docId.startsWith("raw:")) {
      val raw = Uri.decode(docId.substring(4))
      if (File(raw).isFile) {
        return raw
      }
    }

    val parsed = parseDocumentVolumeAndRelativePath(uri)
    if (parsed != null) {
      val mapped = volumeRelativeToFilesystemPath(parsed.first, parsed.second)
      if (mapped != null && File(mapped).isFile) {
        return mapped
      }
    }

    return filesystemPathFromDataColumn(uri) ?: mappedVolumeRelativeGuess(parsed)
  }

  private fun mappedVolumeRelativeGuess(parsed: Pair<String, String>?): String? {
    if (parsed == null) {
      return null
    }
    return volumeRelativeToFilesystemPath(parsed.first, parsed.second)
  }

  private fun volumeRelativeToFilesystemPath(volume: String, relative: String): String? {
    if (volume.equals("primary", ignoreCase = true)) {
      for (root in primaryStorageRoots()) {
        val path =
          if (relative.isEmpty()) {
            root.absolutePath
          } else {
            File(root, relative).absolutePath
          }
        if (File(path).exists()) {
          return path
        }
      }
      val fallbackRoot = primaryStorageRoots().firstOrNull() ?: File("/storage/emulated/0")
      return if (relative.isEmpty()) {
        fallbackRoot.absolutePath
      } else {
        File(fallbackRoot, relative).absolutePath
      }
    }
    return if (relative.isEmpty()) {
      "/storage/$volume"
    } else {
      "/storage/$volume/$relative"
    }
  }

  /** Legacy `_data` column — still populated for some providers and with All files access. */
  private fun filesystemPathFromDataColumn(uri: Uri): String? {
    val columns =
      arrayOf(
        "_data",
        "android:path",
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
      )
    try {
      activity.contentResolver.query(uri, columns, null, null, null)?.use { cursor ->
        if (!cursor.moveToFirst()) {
          return null
        }
        val dataCol = cursor.getColumnIndex("_data")
        if (dataCol >= 0) {
          val data = cursor.getString(dataCol)
          if (data != null && File(data).isFile) {
            return data
          }
        }
        val pathCol = cursor.getColumnIndex("android:path")
        if (pathCol >= 0) {
          val path = cursor.getString(pathCol)
          if (path != null && File(path).isFile) {
            return path
          }
        }
      }
    } catch (_: Exception) {
      // Column not supported for this URI.
    }
    return null
  }

  private fun importAllImagesFromFilesystemParent(plistFsPath: String, destDir: File) {
    val parent = File(plistFsPath).parentFile ?: return
    if (!parent.isDirectory) {
      return
    }
    val imageExts = listOf("png", "jpg", "jpeg", "tif", "tiff", "bmp", "webp")
    parent.listFiles()?.forEach { file ->
      if (!file.isFile || !file.canRead()) {
        return@forEach
      }
      val ext = file.name.substringAfterLast('.', "")
      if (!imageExts.any { it.equals(ext, ignoreCase = true) }) {
        return@forEach
      }
      copyFilesystemFileIfReadable(file, File(destDir, file.name))
    }
  }

  private fun imageExtensions(): List<String> =
    listOf("png", "jpg", "jpeg", "tif", "tiff", "bmp", "webp")

  private fun isImageFilename(name: String): Boolean {
    val ext = name.substringAfterLast('.', "")
    return imageExtensions().any { it.equals(ext, ignoreCase = true) }
  }

  private fun filenameFromDocumentUri(uri: Uri): String? {
    val relative = parseDocumentVolumeAndRelativePath(uri)?.second
    if (relative != null && relative.isNotEmpty()) {
      return relative.substringAfterLast('/')
    }
    val docId = documentIdFromUri(uri)
    if (docId != null && docId.startsWith("raw:")) {
      return File(Uri.decode(docId.substring(4))).name
    }
    if (docId != null) {
      val colon = docId.indexOf(':')
      if (colon >= 0) {
        val relativePath = Uri.decode(docId.substring(colon + 1).trim('/'))
        if (relativePath.isNotEmpty()) {
          return relativePath.substringAfterLast('/')
        }
      }
    }
    return null
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
    copyUriToFile(source.uri, dest)
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

  private fun normalizeExtensionTokens(extensions: Array<String>?): List<String> {
    if (extensions.isNullOrEmpty()) {
      return emptyList()
    }
    return extensions
      .map { it.trim().lowercase().removePrefix(".") }
      .filter { it.isNotEmpty() }
  }

  private fun extensionAllowed(displayName: String, extensions: Array<String>?): Boolean {
    val allowed = normalizeExtensionTokens(extensions)
    if (allowed.isEmpty()) {
      return true
    }
    val pickedExt = displayName.substringAfterLast('.', "").lowercase()
    return pickedExt in allowed
  }

  /**
   * SAF MIME filters are unreliable for `.plist` (often `octet-stream` / `text/plain`).
   * Plist-only pickers skip MIME filtering and validate the extension after selection.
   */
  /**
   * Best-effort MIME list for SAF save/open filters.
   */
  private fun mimeTypesForExtensions(extensions: Array<String>?): Array<String> {
    val normalized = normalizeExtensionTokens(extensions)
    if (normalized.isEmpty()) {
      return emptyArray()
    }
    if (normalized.size == 1 && normalized[0] == "plist") {
      return emptyArray()
    }
    val mime = MimeTypeMap.getSingleton()
    val types =
      normalized
        .flatMap { ext ->
          when (ext) {
            "zip" -> listOf("application/zip")
            "png" -> listOf("image/png")
            "jpg", "jpeg" -> listOf("image/jpeg")
            "plist" ->
              listOf(
                "application/xml",
                "text/xml",
                "application/octet-stream",
                "text/plain",
              )
            else -> mime.getMimeTypeFromExtension(ext)?.let { listOf(it) } ?: emptyList()
          }
        }
        .distinct()
    return types.toTypedArray()
  }

  private fun primaryMimeTypeForExtensions(extensions: Array<String>?): String? {
    val types = mimeTypesForExtensions(extensions)
    return types.firstOrNull()
  }

  private fun isWritableFilesystemDestination(file: File): Boolean {
    if (!hasFilesystemSearchAccess()) {
      return false
    }
    val parent = file.parentFile ?: return false
    if (!parent.exists() && !parent.mkdirs()) {
      return false
    }
    return parent.canWrite()
  }

  /** Map a CREATE_DOCUMENT URI to a target filesystem path when All files access allows it. */
  private fun filesystemPathForSaveUri(uri: Uri, effectiveName: String): String? {
    val parsed = parseDocumentVolumeAndRelativePath(uri)
    if (parsed != null) {
      return volumeRelativeToFilesystemPath(parsed.first, parsed.second)
    }
    val parentUri = parentDocumentUri(uri)
    if (parentUri != null) {
      val parentPath = filesystemPathFromDocumentUri(parentUri)
      if (parentPath != null) {
        return File(parentPath, effectiveName).absolutePath
      }
    }
    return null
  }

  private fun filesystemPathFromTreeUri(uri: Uri): String? {
    val docId =
      try {
        DocumentsContract.getTreeDocumentId(uri)
      } catch (_: Exception) {
        documentIdFromUri(uri)
      }
    if (docId == null) {
      return null
    }
    if (docId.startsWith("raw:")) {
      return Uri.decode(docId.substring(4))
    }
    val colon = docId.indexOf(':')
    if (colon < 0) {
      return null
    }
    val volume = docId.substring(0, colon)
    val relative = Uri.decode(docId.substring(colon + 1).trim('/'))
    return volumeRelativeToFilesystemPath(volume, relative)
  }

  private fun copyFileToUri(source: File, destUri: Uri): Boolean {
    if (!source.isFile || source.length() <= 0L) {
      return false
    }
    return try {
      activity.contentResolver.openOutputStream(destUri, "wt")?.use { output ->
        source.inputStream().use { input -> input.copyTo(output) }
      } != null
    } catch (ex: Exception) {
      Log.w(TAG, "copyFileToUri failed for $destUri: ${ex.message}")
      false
    }
  }

  private fun commitPlistAtlasSiblingsToSaveUri(plistSaveUri: Uri, plistSource: File) {
    val parent = plistSource.parentFile ?: return
    val stem = plistSource.name.substringBeforeLast('.', plistSource.name)
    val relatives = linkedSetOf("$stem.png", "icons/$stem.png")
    parent.listFiles()?.forEach { file ->
      if (file.isFile && isImageFilename(file.name)) {
        relatives.add(file.name)
      }
    }
    for (relative in relatives) {
      val normalized = relative.replace('\\', '/').trimStart('/')
      if (normalized.isEmpty()) {
        continue
      }
      val baseName = normalized.substringAfterLast('/')
      val candidate = if (normalized.contains('/')) File(parent, normalized) else File(parent, baseName)
      if (!candidate.isFile || candidate.length() <= 0L) {
        continue
      }
      exportDocumentRelativeSibling(plistSaveUri, normalized, candidate)
      if (baseName != normalized) {
        exportDocumentRelativeSibling(plistSaveUri, baseName, candidate)
      }
    }
  }

  private fun exportDocumentRelativeSibling(plistSaveUri: Uri, relativeFromParent: String, source: File) {
    if (!source.isFile || source.length() <= 0L) {
      return
    }
    val normalized = relativeFromParent.replace('\\', '/').trimStart('/')
    if (normalized.isEmpty()) {
      return
    }
    val authority = plistSaveUri.authority ?: return
    val parsed = parseDocumentVolumeAndRelativePath(plistSaveUri) ?: return
    val relativePath = parsed.second
    val slash = relativePath.lastIndexOf('/')
    if (slash < 0) {
      return
    }
    val parentRelative = relativePath.substring(0, slash)
    val siblingDocId = "${parsed.first}:$parentRelative/$normalized"
    try {
      val siblingUri = DocumentsContract.buildDocumentUri(authority, siblingDocId)
      copyFileToUri(source, siblingUri)
    } catch (_: Exception) {
      // Fall through — filesystem copy may still work.
    }
    filesystemPathFromDocumentUri(plistSaveUri)?.let { plistPath ->
      val destParent = File(plistPath).parentFile ?: return@let
      val dest = File(destParent, normalized)
      try {
        dest.parentFile?.mkdirs()
        source.copyTo(dest, overwrite = true)
      } catch (_: Exception) {
        // Ignore — SAF write is the primary path.
      }
    }
  }
}
