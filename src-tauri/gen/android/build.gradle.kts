buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.13.2")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

tasks.register("clean").configure {
    delete("build")
}

tasks.register("waitForTauriDevCli") {
    group = "tauri"
    description = "Block until Tauri Android dev CLI IPC is reachable (run after startTauriDevServer)"
    mustRunAfter("startTauriDevServer")
    doLast {
        val tempDir = System.getenv("TEMP") ?: System.getenv("TMP")
            ?: throw GradleException("TEMP is not set")
        val addrFile = java.io.File(tempDir, "com.spectra.texturemanager2-server-addr")
        val deadline = System.currentTimeMillis() + 180_000
        while (System.currentTimeMillis() < deadline) {
            if (addrFile.exists()) {
                val address = addrFile.readText().trim()
                val parts = address.split(":")
                if (parts.size == 2) {
                    val port = parts[1].toIntOrNull()
                    if (port != null) {
                        try {
                            java.net.Socket().use { socket ->
                                socket.connect(java.net.InetSocketAddress(parts[0], port), 2000)
                            }
                            logger.lifecycle("Tauri dev CLI ready at $address")
                            return@doLast
                        } catch (_: Exception) {
                            // CLI address file exists but socket not up yet.
                        }
                    }
                }
            }
            Thread.sleep(2000)
        }
        throw GradleException(
            "Timed out waiting for Tauri Android dev CLI. " +
                "Run startTauriDevServer first and wait for Vite on port 1420.",
        )
    }
}

tasks.register("startTauriDevServer") {
    group = "tauri"
    description = "Open Tauri Android dev CLI in a separate terminal (keep that window open while developing)"
    doLast {
        val launcher = rootProject.projectDir.resolve("scripts/launch-tauri-dev-cli-window.cmd")
        if (!launcher.exists()) {
            throw GradleException("Missing dev CLI launcher: ${launcher.absolutePath}")
        }
        if (System.getProperty("os.name").lowercase().contains("windows")) {
            exec {
                commandLine("cmd", "/c", launcher.absolutePath)
            }
        } else {
            val script = rootProject.projectDir.resolve("scripts/start-tauri-cli-for-studio.sh")
            exec {
                workingDir = rootProject.projectDir
                commandLine("bash", script.absolutePath)
            }
        }
    }
}

