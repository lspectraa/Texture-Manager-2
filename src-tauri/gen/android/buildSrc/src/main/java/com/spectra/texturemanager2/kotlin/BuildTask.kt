import java.io.File
import java.net.InetSocketAddress
import java.net.Socket
import java.util.Properties
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val release = release ?: throw GradleException("release cannot be null")
        // Debug builds from Android Studio load the webview from the dev CLI; release/CI builds bundle assets.
        if (!release) {
            assertTauriDevCliRunning()
        }
        val executable = resolveNpmExecutable()
        try {
            runTauriCli(executable)
        } catch (e: Exception) {
            if (Os.isFamily(Os.FAMILY_WINDOWS) && !looksLikeAbsolutePath(executable)) {
                val fallbacks = listOf(
                    "$executable.exe",
                    "$executable.cmd",
                    "$executable.bat",
                )

                var lastException: Exception = e
                for (fallback in fallbacks) {
                    try {
                        runTauriCli(fallback)
                        return
                    } catch (fallbackException: Exception) {
                        lastException = fallbackException
                    }
                }
                throw lastException
            } else {
                throw e
            }
        }
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val args = listOf("run", "--", "tauri", "android", "android-studio-script")

        project.exec {
            workingDir(File(project.projectDir, rootDirRel))
            executable(executable)
            args(args)
            buildToolEnvironment(executable, target).forEach { (key, value) ->
                environment(key, value)
            }
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }

    private fun buildToolEnvironment(npmExecutable: String, rustTarget: String): Map<String, String> {
        val localProps = readLocalProperties()
        val pathSeparator = if (Os.isFamily(Os.FAMILY_WINDOWS)) ";" else ":"
        val pathEntries = linkedSetOf<String>()

        File(npmExecutable).parentFile?.takeIf { it.exists() }?.let { pathEntries.add(it.absolutePath) }
        resolveRustBinDir(localProps)?.let { pathEntries.add(it) }

        val androidHome = resolveAndroidHome(localProps)
        val ndkHome = androidHome?.let { resolveNdkHome(it) }
        val ndkBin = ndkHome?.let { resolveNdkToolchainBin(it) }
        if (ndkBin != null) {
            pathEntries.add(ndkBin)
        }

        val existingPath = System.getenv("PATH") ?: ""
        val filteredPath = existingPath.split(pathSeparator)
            .filter { segment ->
                val lower = segment.lowercase()
                segment.isNotBlank() &&
                    !lower.contains("msys") &&
                    !lower.contains("mingw") &&
                    !lower.contains("cygwin")
            }
        val augmentedPath = (pathEntries + filteredPath).joinToString(pathSeparator)

        val env = mutableMapOf("PATH" to augmentedPath)
        if (androidHome != null) {
            env["ANDROID_HOME"] = androidHome
            env["ANDROID_SDK_ROOT"] = androidHome
        }
        if (ndkHome != null) {
            env["NDK_HOME"] = ndkHome
        }

        if (ndkBin != null) {
            configureAndroidLinkers(env, ndkBin, rustTarget)
        }

        // Prevent MSYS/MinGW toolchains from overriding the NDK linker via cc/collect2.
        listOf("CC", "CXX", "AR", "LD", "RANLIB").forEach { key ->
            env[key] = ""
        }

        return env
    }

    private fun resolveNdkToolchainBin(ndkHome: String): String {
        val hostTag = when {
            Os.isFamily(Os.FAMILY_WINDOWS) -> "windows-x86_64"
            Os.isFamily(Os.FAMILY_MAC) -> "darwin-x86_64"
            else -> "linux-x86_64"
        }
        return File(ndkHome, "toolchains/llvm/prebuilt/$hostTag/bin").absolutePath
    }

    private fun configureAndroidLinkers(env: MutableMap<String, String>, ndkBin: String, rustTarget: String) {
        val minSdk = 24
        val linkerEnvKey = when (rustTarget) {
            "aarch64" -> "CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER"
            "armv7" -> "CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER"
            "i686" -> "CARGO_TARGET_I686_LINUX_ANDROID_LINKER"
            "x86_64" -> "CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER"
            else -> return
        }
        val linkerName = when (rustTarget) {
            "aarch64" -> "aarch64-linux-android$minSdk-clang"
            "armv7" -> "armv7a-linux-androideabi$minSdk-clang"
            "i686" -> "i686-linux-android$minSdk-clang"
            "x86_64" -> "x86_64-linux-android$minSdk-clang"
            else -> return
        }
        val linkerSuffix = if (Os.isFamily(Os.FAMILY_WINDOWS)) ".cmd" else ""
        val linker = File(ndkBin, linkerName + linkerSuffix)
        if (linker.exists()) {
            env[linkerEnvKey] = linker.absolutePath
        }
    }

    private fun resolveNpmExecutable(): String {
        readNodeJsDirFromLocalProperties()?.let { nodeDir ->
            val npmCmd = File(nodeDir, "npm.cmd")
            if (npmCmd.exists()) {
                return npmCmd.absolutePath
            }
        }

        listOfNotNull(
            System.getenv("NPM_PATH"),
            System.getenv("NODEJS_HOME")?.let { File(it, "npm.cmd").absolutePath },
        ).forEach { candidate ->
            if (File(candidate).exists()) {
                return candidate
            }
        }

        if (Os.isFamily(Os.FAMILY_WINDOWS)) {
            val commonPaths = listOfNotNull(
                System.getenv("ProgramFiles")?.let { "$it\\nodejs\\npm.cmd" },
                System.getenv("LocalAppData")?.let { "$it\\Programs\\nodejs\\npm.cmd" },
                "C:\\Program Files\\nodejs\\npm.cmd",
            )
            for (path in commonPaths) {
                if (File(path).exists()) {
                    return path
                }
            }
            return "npm.cmd"
        }

        return "npm"
    }

    private fun readLocalProperties(): Properties {
        val props = Properties()
        val file = project.rootProject.file("local.properties")
        if (file.exists()) {
            file.inputStream().use { props.load(it) }
        }
        return props
    }

    private fun readNodeJsDirFromLocalProperties(): String? {
        return readLocalProperties()
            .getProperty("nodejs.dir")
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
    }

    private fun resolveRustBinDir(localProps: Properties): String? {
        localProps.getProperty("rust.dir")?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }

        listOfNotNull(
            System.getenv("CARGO_HOME")?.let { File(it, "bin").absolutePath },
            System.getenv("RUSTUP_HOME")?.let { File(it, "bin").absolutePath },
            System.getenv("USERPROFILE")?.let { File(it, ".cargo\\bin").absolutePath },
            System.getenv("HOME")?.let { File(it, ".cargo/bin").absolutePath },
        ).forEach { candidate ->
            if (File(candidate, if (Os.isFamily(Os.FAMILY_WINDOWS)) "cargo.exe" else "cargo").exists()) {
                return candidate
            }
        }

        return null
    }

    private fun resolveAndroidHome(localProps: Properties): String? {
        localProps.getProperty("sdk.dir")?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
        return listOfNotNull(
            System.getenv("ANDROID_HOME"),
            System.getenv("ANDROID_SDK_ROOT"),
        ).firstOrNull { File(it).exists() }
    }

    private fun resolveNdkHome(androidHome: String): String? {
        System.getenv("NDK_HOME")?.takeIf { File(it).exists() }?.let { return it }

        val ndkRoot = File(androidHome, "ndk")
        if (!ndkRoot.isDirectory) {
            return null
        }

        return ndkRoot.listFiles()
            ?.filter { it.isDirectory }
            ?.maxByOrNull { it.name }
            ?.absolutePath
    }

    private fun looksLikeAbsolutePath(path: String): Boolean {
        return path.contains("\\") || path.contains("/") || File(path).isAbsolute
    }

    private fun assertTauriDevCliRunning() {
        val tempDir = System.getenv("TEMP") ?: System.getenv("TMP")
        if (tempDir.isNullOrBlank()) {
            throw devCliMissingException(null)
        }

        val addrFile = File(tempDir, "com.spectra.texturemanager2-server-addr")
        if (!addrFile.exists()) {
            throw devCliMissingException(null)
        }

        val address = addrFile.readText().trim()
        val parts = address.split(":")
        if (parts.size != 2) {
            addrFile.delete()
            throw devCliMissingException("Removed stale Tauri dev CLI address file.")
        }

        val host = parts[0]
        val port = parts[1].toIntOrNull()
        if (port == null) {
            addrFile.delete()
            throw devCliMissingException("Removed stale Tauri dev CLI address file.")
        }

        try {
            Socket().use { socket ->
                socket.connect(InetSocketAddress(host, port), 2000)
            }
        } catch (_: Exception) {
            addrFile.delete()
            throw devCliMissingException(
                "Could not connect to Tauri dev CLI at $address.",
            )
        }
    }

    private fun devCliMissingException(detail: String?): GradleException {
        val prefix = detail?.let { "$it " } ?: ""
        return GradleException(
            prefix +
                "Tauri Android dev CLI is not running. " +
                "Run startTauriDevServer (or: npm run tauri -- android dev) and keep that window open, " +
                "then rebuild from Android Studio. " +
                "For the x86 emulator: Build Variants -> x86_64Debug (not arm64Debug or universalDebug).",
        )
    }
}
