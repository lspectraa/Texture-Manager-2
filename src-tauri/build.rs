fn main() {
    // Windows embeds icons at compile time; watch them so `tauri icon` regenerations
    // force a rebuild instead of leaving a stale .exe resource.
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.png");
    println!("cargo:rerun-if-changed=icons/32x32.png");
    println!("cargo:rerun-if-changed=icons/128x128.png");
    println!("cargo:rerun-if-changed=icons/128x128@2x.png");
    println!("cargo:rerun-if-changed=binaries");
    ensure_upscaler_sidecar_executables();
    tauri_build::build()
}

/// Real-ESRGAN macOS archives ship without the execute bit; ensure Tauri externalBin copies are runnable.
#[cfg(unix)]
fn ensure_upscaler_sidecar_executables() {
    use std::os::unix::fs::PermissionsExt;
    use std::path::Path;

    let dir = Path::new("binaries");
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !name.contains("ncnn-vulkan") || name.ends_with(".dll") {
            continue;
        }
        let Ok(meta) = std::fs::metadata(&path) else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }
        let mut perms = meta.permissions();
        let mode = perms.mode();
        if mode & 0o111 == 0 {
            perms.set_mode(mode | 0o755);
            let _ = std::fs::set_permissions(&path, perms);
        }
    }
}

#[cfg(not(unix))]
fn ensure_upscaler_sidecar_executables() {}
