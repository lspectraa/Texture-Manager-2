//! Resolve and invoke ncnn-Vulkan CLI sidecars (Waifu2x shipped; other models stay wired).

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::OnceLock;
use std::thread;
use std::time::Duration;

use image::{Rgba, RgbaImage};

use crate::core::contracts::UpscalerModel;
use crate::core::errors::AppError;
use crate::core::image_io;

/// Cached Vulkan adapter that produced a clean run (-1 = unknown / CPU).
/// Discrete GPUs are preferred after probe; iGPU is kept as fallback for ESRGAN.
static PREFERRED_GPU: AtomicI32 = AtomicI32::new(-1);

/// Consecutive Vulkan ACCESS_VIOLATIONs. After the first, skip CPU fallback
/// (this sidecar still inits Vulkan on `-g -1`, so CPU AVs the same way).
static GPU_FAILURE_STREAK: AtomicI32 = AtomicI32::new(0);

/// Last device that produced output: -2 unknown, -1 CPU, >=0 Vulkan id.
static LAST_DEVICE_ID: AtomicI32 = AtomicI32::new(-2);

/// Probed Vulkan adapters for the current sidecar binary (empty = probe failed).
static PROBED_GPUS: OnceLock<Vec<(i32, String)>> = OnceLock::new();

/// Cached NVIDIA Vulkan ICD path (None = not found).
static NVIDIA_VULKAN_ICD: OnceLock<Option<PathBuf>> = OnceLock::new();

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
const TARGET_TRIPLE: &str = "x86_64-pc-windows-msvc";
#[cfg(all(target_os = "windows", target_arch = "aarch64"))]
const TARGET_TRIPLE: &str = "aarch64-pc-windows-msvc";
#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
const TARGET_TRIPLE: &str = "x86_64-apple-darwin";
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
const TARGET_TRIPLE: &str = "aarch64-apple-darwin";
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const TARGET_TRIPLE: &str = "x86_64-unknown-linux-gnu";
#[cfg(not(any(
    all(target_os = "windows", target_arch = "x86_64"),
    all(target_os = "windows", target_arch = "aarch64"),
    all(target_os = "macos", target_arch = "x86_64"),
    all(target_os = "macos", target_arch = "aarch64"),
    all(target_os = "linux", target_arch = "x86_64"),
)))]
const TARGET_TRIPLE: &str = "unknown";

/// GPU path: keep the graphics queue serial. `2:2:2` AVs this 2022 CUGAN build
/// when the Tauri WebView is also using Vulkan on a hybrid laptop.
const BATCH_LOAD_PROC_SAVE_GPU: &str = "1:2:2";
const BATCH_LOAD_PROC_SAVE_CUGAN: &str = "1:1:1";
const BATCH_LOAD_PROC_SAVE_CPU: &str = "1:1:1";

/// Sprites per CLI invocation. Large enough that the model stays loaded, small
/// enough that one submit cannot wedge the driver while the UI is compositing.
pub const UPSCALE_CHUNK_SIZE: usize = 16;

/// Pause between large chunks so DWM / other apps can run.
const CHUNK_YIELD_MS: u64 = 250;

/// Explicit tile size. Auto (`0`) for CUGAN: forced 64 AVs this 2022 build on
/// current NVIDIA drivers (610.x) when launched from the Tauri process.
const REALESRGAN_TILE_SIZE: &str = "128";
const REALCUGAN_TILE_SIZE: &str = "0";

/// Extra pixels around each sprite so convolution does not see a hard transparent edge.
const UPSCALE_EDGE_PAD: u32 = 12;

fn chunk_size_for_model(_model: UpscalerModel) -> usize {
    UPSCALE_CHUNK_SIZE
}

fn idx(x: u32, y: u32, width: u32) -> usize {
    (y as usize)
        .saturating_mul(width as usize)
        .saturating_add(x as usize)
}

/// Copy RGB from opaque neighbors into fully-transparent pixels so the net does not
/// treat sprite silhouettes as a hard black/clear edge (classic CUGAN halo).
///
/// Work is limited to the occupied bounding box plus a pad-sized halo so large
/// canvases stay cheap. RGB is ping-ponged in packed buffers so a 512×512 skip
/// is not needed to stay off the hot path.
fn bleed_transparent_rgb(img: &mut RgbaImage) {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return;
    }
    let len = (w as usize).saturating_mul(h as usize);
    let raw = img.as_raw();
    let mut filled = vec![false; len];
    let mut rgb = vec![[0u8; 3]; len];
    let mut min_x = w;
    let mut min_y = h;
    let mut max_x = 0u32;
    let mut max_y = 0u32;
    for y in 0..h {
        for x in 0..w {
            let i = idx(x, y, w);
            let o = i.saturating_mul(4);
            rgb[i] = [
                raw.get(o).copied().unwrap_or(0),
                raw.get(o + 1).copied().unwrap_or(0),
                raw.get(o + 2).copied().unwrap_or(0),
            ];
            if raw.get(o + 3).copied().unwrap_or(0) > 8 {
                filled[i] = true;
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
            }
        }
    }
    if min_x > max_x {
        return;
    }

    let max_passes = w.max(h).min(UPSCALE_EDGE_PAD.saturating_add(8));
    let x0 = min_x.saturating_sub(max_passes);
    let y0 = min_y.saturating_sub(max_passes);
    let x1 = max_x.saturating_add(max_passes).min(w.saturating_sub(1));
    let y1 = max_y.saturating_add(max_passes).min(h.saturating_sub(1));
    let mut next_filled = filled.clone();
    let mut next_rgb = rgb.clone();

    for _ in 0..max_passes {
        let mut changed = false;
        for y in y0..=y1 {
            for x in x0..=x1 {
                let i = idx(x, y, w);
                if filled[i] {
                    continue;
                }
                let mut r = 0u32;
                let mut g = 0u32;
                let mut b = 0u32;
                let mut n = 0u32;
                for (dx, dy) in [
                    (-1, 0),
                    (1, 0),
                    (0, -1),
                    (0, 1),
                    (-1, -1),
                    (1, -1),
                    (-1, 1),
                    (1, 1),
                ] {
                    let nx = x as i32 + dx;
                    let ny = y as i32 + dy;
                    if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                        continue;
                    }
                    let ui = idx(nx as u32, ny as u32, w);
                    if !filled[ui] {
                        continue;
                    }
                    let q = rgb[ui];
                    r += u32::from(q[0]);
                    g += u32::from(q[1]);
                    b += u32::from(q[2]);
                    n += 1;
                }
                if n == 0 {
                    continue;
                }
                next_rgb[i] = [(r / n) as u8, (g / n) as u8, (b / n) as u8];
                next_filled[i] = true;
                changed = true;
            }
        }
        rgb.clone_from(&next_rgb);
        filled.clone_from(&next_filled);
        if !changed {
            break;
        }
    }

    for y in y0..=y1 {
        for x in x0..=x1 {
            let i = idx(x, y, w);
            let a = img.get_pixel(x, y).0[3];
            let c = rgb[i];
            img.put_pixel(x, y, Rgba([c[0], c[1], c[2], a]));
        }
    }
}

fn padded_dims(w: u32, h: u32, pad: u32) -> (u32, u32) {
    // Extra pixels on the right/bottom so ncnn sees multiples of 8.
    const ALIGN: u32 = 8;
    let mut out_w = w.saturating_add(pad.saturating_mul(2));
    let mut out_h = h.saturating_add(pad.saturating_mul(2));
    let rem_w = out_w % ALIGN;
    let rem_h = out_h % ALIGN;
    if rem_w != 0 {
        out_w = out_w.saturating_add(ALIGN - rem_w);
    }
    if rem_h != 0 {
        out_h = out_h.saturating_add(ALIGN - rem_h);
    }
    (out_w.max(1), out_h.max(1))
}

fn pad_replicate(img: &RgbaImage, pad: u32) -> RgbaImage {
    if pad == 0 {
        return img.clone();
    }
    let w = img.width();
    let h = img.height();
    if w == 0 || h == 0 {
        return img.clone();
    }
    let (out_w, out_h) = padded_dims(w, h, pad);
    let mut out = RgbaImage::new(out_w, out_h);
    for y in 0..out.height() {
        let sy = y.saturating_sub(pad).min(h.saturating_sub(1));
        for x in 0..out.width() {
            let sx = x.saturating_sub(pad).min(w.saturating_sub(1));
            out.put_pixel(x, y, *img.get_pixel(sx, sy));
        }
    }
    out
}

fn prepare_sprite_for_model(image: &RgbaImage) -> RgbaImage {
    let mut bled = image.clone();
    bleed_transparent_rgb(&mut bled);
    pad_replicate(&bled, UPSCALE_EDGE_PAD)
}

fn min_size_for_scale(src_w: u32, src_h: u32, scale: u32) -> (u32, u32) {
    let crop = UPSCALE_EDGE_PAD.saturating_mul(scale);
    (
        src_w
            .saturating_mul(scale)
            .saturating_add(crop.saturating_mul(2))
            .max(1),
        src_h
            .saturating_mul(scale)
            .saturating_add(crop.saturating_mul(2))
            .max(1),
    )
}

/// AnimeVideo v3-x2 device-loses on NVIDIA with this 2022 ncnn build
/// (`vkWaitForFences -4`). Always run the native 4× net; 2× requests
/// downscale after crop (same path as the old Anime6B workaround).
fn sidecar_cli_scale(model: UpscalerModel, requested: u32) -> u32 {
    match model {
        UpscalerModel::RealesrganAnime => 4,
        UpscalerModel::Waifu2x => requested,
    }
}

/// Prefer 4× when the buffer is large enough — a 4× image also satisfies the
/// 2× size check, and cropping it as 2× keeps only the top-left quadrant.
fn infer_native_scale(upscaled: &RgbaImage, src_w: u32, src_h: u32) -> Result<u32, AppError> {
    for native in [4u32, 2] {
        let (need_w, need_h) = min_size_for_scale(src_w, src_h, native);
        if upscaled.width() >= need_w && upscaled.height() >= need_h {
            return Ok(native);
        }
    }
    let (need_w, need_h) = min_size_for_scale(src_w, src_h, 2);
    Err(AppError::IoError(format!(
        "upscaler returned {}x{} which is too small to crop padding (expected at least {}x{})",
        upscaled.width(),
        upscaled.height(),
        need_w,
        need_h
    )))
}

fn crop_at_native_scale(
    upscaled: &RgbaImage,
    src_w: u32,
    src_h: u32,
    native: u32,
) -> Result<RgbaImage, AppError> {
    let crop = UPSCALE_EDGE_PAD.saturating_mul(native);
    let expected_w = src_w.saturating_mul(native).max(1);
    let expected_h = src_h.saturating_mul(native).max(1);
    Ok(image::imageops::crop_imm(upscaled, crop, crop, expected_w, expected_h).to_image())
}

fn fit_native_to_requested(
    cropped: RgbaImage,
    src_w: u32,
    src_h: u32,
    native: u32,
    requested: u32,
) -> Result<RgbaImage, AppError> {
    if native == requested {
        return Ok(cropped);
    }
    if native > requested && native % requested == 0 {
        let target_w = src_w.saturating_mul(requested).max(1);
        let target_h = src_h.saturating_mul(requested).max(1);
        return Ok(image::imageops::resize(
            &cropped,
            target_w,
            target_h,
            image::imageops::FilterType::Triangle,
        ));
    }
    Err(AppError::IoError(format!(
        "upscaler native {native}× cannot be reduced to requested {requested}×"
    )))
}

fn crop_scaled_padding(
    upscaled: &RgbaImage,
    src_w: u32,
    src_h: u32,
    requested_scale: u32,
) -> Result<RgbaImage, AppError> {
    let native = infer_native_scale(upscaled, src_w, src_h)?;
    let cropped = crop_at_native_scale(upscaled, src_w, src_h, native)?;
    fit_native_to_requested(cropped, src_w, src_h, native, requested_scale)
}

fn apply_windows_sidecar_flags(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x0000_4000;
        cmd.creation_flags(CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS);
    }
    let _ = cmd;
}

fn exe_suffix() -> &'static str {
    if cfg!(windows) {
        ".exe"
    } else {
        ""
    }
}

fn binary_base_name(model: UpscalerModel) -> &'static str {
    match model {
        UpscalerModel::RealesrganAnime => "realesrgan-ncnn-vulkan",
        UpscalerModel::Waifu2x => "waifu2x-ncnn-vulkan",
    }
}

fn models_dir_name(model: UpscalerModel) -> &'static str {
    match model {
        UpscalerModel::RealesrganAnime => "models-realesrgan",
        UpscalerModel::Waifu2x => "models-cunet",
    }
}

fn realesrgan_model_name(_scale: u32) -> &'static str {
    // AnimeVideo v3. Invoked at 4× (`realesr-animevideov3-x4`); see sidecar_cli_scale.
    "realesr-animevideov3"
}

/// Parse `[id Device Name]` entries from ncnn-vulkan stderr/stdout.
fn parse_vulkan_gpu_list(blob: &str) -> Vec<(i32, String)> {
    let mut out = Vec::new();
    let mut search_from = 0usize;
    while let Some(rel) = blob[search_from..].find('[') {
        let start = search_from + rel + 1;
        let Some(rest) = blob.get(start..) else {
            break;
        };
        let mut id: i32 = 0;
        let mut digits = 0u32;
        let mut idx = 0usize;
        for (i, ch) in rest.char_indices() {
            if ch.is_ascii_digit() {
                id = id
                    .saturating_mul(10)
                    .saturating_add(ch.to_digit(10).unwrap_or(0) as i32);
                digits += 1;
                idx = i + ch.len_utf8();
            } else {
                break;
            }
        }
        if digits == 0 {
            search_from = start;
            continue;
        }
        let after_id = rest.get(idx..).unwrap_or("");
        if !after_id.starts_with(' ') {
            search_from = start;
            continue;
        }
        let name_part = &after_id[1..];
        let Some(end) = name_part.find(']') else {
            search_from = start;
            continue;
        };
        let name = name_part[..end].trim();
        // Skip noise like empty brackets; require a real adapter label.
        if !name.is_empty() && !name.eq_ignore_ascii_case("cpu") {
            if !out.iter().any(|(existing, _)| *existing == id) {
                out.push((id, name.to_string()));
            }
        }
        search_from = start + idx + 1 + end + 1;
    }
    out
}

fn gpu_preference_rank(name: &str) -> u8 {
    let n = name.to_ascii_lowercase();
    if n.contains("nvidia")
        || n.contains("geforce")
        || n.contains("quadro")
        || n.contains("rtx")
        || n.contains("gtx")
    {
        0
    } else if n.contains("radeon") || n.contains("amd ") || n.starts_with("amd") {
        1
    } else if n.contains("intel") || n.contains("iris") || n.contains("uhd graphics") {
        3
    } else {
        2
    }
}

fn probe_vulkan_gpus(binary: &Path) -> Vec<(i32, String)> {
    // Passing an out-of-range GPU id makes the sidecar print the adapter list.
    let mut cmd = Command::new(binary);
    cmd.arg("-g").arg("999");
    cmd.arg("-i").arg("__tm2_gpu_probe_missing_in.png");
    cmd.arg("-o").arg("__tm2_gpu_probe_missing_out.png");
    if let Some(bin_dir) = binary.parent() {
        cmd.current_dir(bin_dir);
    }
    cmd.env("VK_LOADER_LAYERS_DISABLE", "~implicit~*");
    apply_nvidia_icd_env(&mut cmd);
    apply_windows_sidecar_flags(&mut cmd);
    let output = match cmd.output() {
        Ok(o) => o,
        Err(_) => return Vec::new(),
    };
    let blob = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    );
    let mut gpus = parse_vulkan_gpu_list(&blob);
    gpus.sort_by(|(id_a, name_a), (id_b, name_b)| {
        gpu_preference_rank(name_a)
            .cmp(&gpu_preference_rank(name_b))
            .then_with(|| id_a.cmp(id_b))
    });
    gpus
}

fn discovered_gpus(binary: &Path) -> &'static [(i32, String)] {
    PROBED_GPUS
        .get_or_init(|| probe_vulkan_gpus(binary))
        .as_slice()
}

fn is_integrated_gpu_name(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n.contains("intel")
        || n.contains("iris")
        || n.contains("uhd graphics")
        || n.contains("radeon graphics") // AMD iGPU naming on many laptops
        || n.contains("amd radeon(tm) graphics")
}

fn is_nvidia_gpu_name(name: &str) -> bool {
    gpu_preference_rank(name) == 0
}

fn find_nvidia_vulkan_icd() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let repo = Path::new(r"C:\Windows\System32\DriverStore\FileRepository");
        if let Ok(entries) = fs::read_dir(repo) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                let n = name.to_string_lossy();
                if n.len() >= 2 && n[..2].eq_ignore_ascii_case("nv") && entry.path().is_dir() {
                    let json = entry.path().join("nv-vk64.json");
                    if json.is_file() {
                        return Some(json);
                    }
                }
            }
        }
        let fallback = PathBuf::from(r"C:\Windows\System32\nv-vk64.json");
        if fallback.is_file() {
            return Some(fallback);
        }
    }
    None
}

fn nvidia_vulkan_icd_path() -> Option<&'static Path> {
    NVIDIA_VULKAN_ICD
        .get_or_init(find_nvidia_vulkan_icd)
        .as_deref()
}

/// Hide Intel from every ncnn launch. The 2022 sidecar always creates a Vulkan
/// instance (even with `-g -1` / CPU) and enumerating Iris Xe is what AVs.
fn apply_nvidia_icd_env(cmd: &mut Command) {
    if let Some(icd) = nvidia_vulkan_icd_path() {
        cmd.env("VK_ICD_FILENAMES", icd);
        cmd.env("VK_DRIVER_FILES", icd);
    }
}

fn vulkan_icd_for_gpu(_binary: &Path, _gpu_id: i32) -> Option<&'static Path> {
    nvidia_vulkan_icd_path()
}

/// Ask Windows to run this exe on the High Performance (discrete) GPU.
#[cfg(windows)]
fn pin_windows_high_performance_gpu(exe: &Path) {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let Some(path) = exe.to_str() else {
        return;
    };
    let Ok((key, _)) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey(r"Software\Microsoft\DirectX\UserGpuPreferences")
    else {
        return;
    };
    let _ = key.set_value(path, &"GpuPreference=2;");
}

#[cfg(not(windows))]
fn pin_windows_high_performance_gpu(_exe: &Path) {}

/// waifu2x-ncnn-vulkan 2025 links OpenMP (`vcomp140.dll`). Copy it next to the sidecar.
fn ensure_sidecar_runtime_dlls(binary: &Path) {
    #[cfg(windows)]
    {
        const DLL: &str = "vcomp140.dll";
        let Some(dir) = binary.parent() else {
            return;
        };
        let dest = dir.join(DLL);
        if dest.is_file() {
            return;
        }
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let src = manifest.join("binaries").join(DLL);
        if src.is_file() {
            let _ = fs::copy(&src, &dest);
        }
    }
}

/// Human-readable device used by the last successful sidecar invocation.
pub fn last_upscaler_device_label() -> String {
    let id = LAST_DEVICE_ID.load(Ordering::Relaxed);
    if id < 0 {
        return if id == -1 {
            "CPU".to_string()
        } else {
            "unknown".to_string()
        };
    }
    if let Some(gpus) = PROBED_GPUS.get() {
        if let Some((_, name)) = gpus.iter().find(|(gpu_id, _)| *gpu_id == id) {
            return format!("GPU {id} ({name})");
        }
    }
    format!("GPU {id}")
}

pub fn reset_upscaler_run_state() {
    GPU_FAILURE_STREAK.store(0, Ordering::Relaxed);
}

fn gpu_try_order(binary: &Path, model: UpscalerModel) -> Vec<i32> {
    let discovered = discovered_gpus(binary);
    let preferred = PREFERRED_GPU.load(Ordering::Relaxed);
    let mut order = Vec::with_capacity(discovered.len().saturating_add(2));

    let allow_id = |id: i32, name: &str| -> bool {
        if id < 0 {
            return true;
        }
        // Real-CUGAN regularly AVs on Intel Iris (bugbilz≠0) after NVIDIA fails.
        if matches!(model, UpscalerModel::Waifu2x) && is_integrated_gpu_name(name) {
            return false;
        }
        true
    };

    if preferred >= 0 {
        if let Some((_, name)) = discovered.iter().find(|(id, _)| *id == preferred) {
            if allow_id(preferred, name) {
                order.push(preferred);
            }
        } else if discovered.is_empty() {
            order.push(preferred);
        }
    }

    for (id, name) in discovered {
        if allow_id(*id, name) && !order.contains(id) {
            order.push(*id);
        }
    }

    if order.is_empty() {
        order.push(0);
    }

    // CPU still initializes Vulkan in this sidecar, so it is not a safe fallback
    // after ACCESS_VIOLATION. Only try it when Vulkan has not already AVed.
    if GPU_FAILURE_STREAK.load(Ordering::Relaxed) == 0 && !order.contains(&-1) {
        order.push(-1);
    }
    order
}

fn error_is_access_violation(err: &AppError) -> bool {
    let s = err.to_string().to_ascii_lowercase();
    s.contains("0xc0000005") || s.contains("access violation")
}

fn error_is_skippable_gpu_failure(err: &AppError) -> bool {
    let s = err.to_string().to_ascii_lowercase();
    s.contains("invalid gpu device")
        || s.contains("0xc0000005")
        || s.contains("access violation")
        || s.contains("vkqueuesubmit failed")
        || s.contains("vkwaitforfences failed")
        || s.contains("device lost")
        || s.contains("vk_error_device_lost")
}

fn candidate_binary_paths(base: &str) -> Vec<PathBuf> {
    let suffix = exe_suffix();
    let with_triple = format!("{base}-{TARGET_TRIPLE}{suffix}");
    let plain = format!("{base}{suffix}");
    let mut out = Vec::new();

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            out.push(dir.join(&plain));
            out.push(dir.join(&with_triple));
            out.push(dir.join("binaries").join(&plain));
            out.push(dir.join("binaries").join(&with_triple));
            if let Some(contents) = dir.parent() {
                out.push(contents.join("Resources").join(&plain));
                out.push(contents.join("Resources").join(&with_triple));
            }
        }
    }

    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    out.push(manifest.join("binaries").join(&with_triple));
    out.push(manifest.join("binaries").join(&plain));

    out
}

fn candidate_model_roots(model: UpscalerModel) -> Vec<PathBuf> {
    let folder = models_dir_name(model);
    let mut out = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            out.push(dir.join("resources").join("upscaler").join(folder));
            out.push(dir.join("upscaler").join(folder));
            if let Some(contents) = dir.parent() {
                out.push(
                    contents
                        .join("Resources")
                        .join("resources")
                        .join("upscaler")
                        .join(folder),
                );
                out.push(contents.join("Resources").join("upscaler").join(folder));
            }
        }
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    out.push(manifest.join("resources").join("upscaler").join(folder));
    out
}

pub fn resolve_sidecar_binary(model: UpscalerModel) -> Result<PathBuf, AppError> {
    let base = binary_base_name(model);
    for path in candidate_binary_paths(base) {
        if path.is_file() {
            pin_windows_high_performance_gpu(&path);
            if let Ok(host) = std::env::current_exe() {
                pin_windows_high_performance_gpu(&host);
            }
            ensure_sidecar_runtime_dlls(&path);
            return Ok(path);
        }
    }
    Err(AppError::IoError(format!(
        "Upscaler binary `{base}` not found. Run `npm run fetch:upscaler-binaries` and ensure a Vulkan-capable GPU is available."
    )))
}

pub fn resolve_models_dir(model: UpscalerModel) -> Result<PathBuf, AppError> {
    let folder = models_dir_name(model);
    for path in candidate_model_roots(model) {
        if path.is_dir() {
            return Ok(path);
        }
    }
    Err(AppError::IoError(format!(
        "Upscaler models folder `{folder}` not found. Run `npm run fetch:upscaler-binaries`."
    )))
}

fn configure_model_args(
    cmd: &mut Command,
    model: UpscalerModel,
    scale: u32,
    models: &Path,
    gpu_id: i32,
    vulkan_icd: Option<&Path>,
) {
    let cli_gpu = if vulkan_icd.is_some() && gpu_id >= 0 {
        0
    } else {
        gpu_id
    };
    cmd.arg("-s")
        .arg(sidecar_cli_scale(model, scale).to_string());
    cmd.arg("-j").arg(if gpu_id < 0 {
        BATCH_LOAD_PROC_SAVE_CPU
    } else if matches!(model, UpscalerModel::Waifu2x) {
        BATCH_LOAD_PROC_SAVE_CUGAN
    } else {
        BATCH_LOAD_PROC_SAVE_GPU
    });
    cmd.arg("-f").arg("png");
    cmd.arg("-g").arg(cli_gpu.to_string());
    // OBS/Steam/etc. implicit Vulkan layers commonly break ncnn compute submits.
    cmd.env("VK_LOADER_LAYERS_DISABLE", "~implicit~*");
    if let Some(icd) = vulkan_icd {
        cmd.env("VK_ICD_FILENAMES", icd);
        cmd.env("VK_DRIVER_FILES", icd);
    }
    match model {
        UpscalerModel::RealesrganAnime => {
            cmd.arg("-t").arg(REALESRGAN_TILE_SIZE);
            cmd.arg("-n").arg(realesrgan_model_name(scale));
            cmd.arg("-m").arg(models);
        }
        UpscalerModel::Waifu2x => {
            cmd.arg("-t").arg(REALCUGAN_TILE_SIZE);
            cmd.arg("-n").arg("-1");
            cmd.arg("-m").arg(models);
        }
    }
}

fn stderr_indicates_vulkan_failure(stderr: &str, stdout: &str) -> bool {
    let blob = format!("{stderr}\n{stdout}").to_ascii_lowercase();
    blob.contains("vkqueuesubmit failed")
        || blob.contains("vkwaitforfences failed")
        || blob.contains("device lost")
        || blob.contains("vk_error_device_lost")
}

fn validate_scaled_dims(src: &RgbaImage, out: &RgbaImage, scale: u32) -> Result<(), AppError> {
    let expected_w = src.width().saturating_mul(scale).max(1);
    let expected_h = src.height().saturating_mul(scale).max(1);
    if out.width() != expected_w || out.height() != expected_h {
        return Err(AppError::IoError(format!(
            "upscaler returned wrong size {}x{} (expected {}x{} at {scale}×). Output may be corrupted — try again or lower GPU load.",
            out.width(),
            out.height(),
            expected_w,
            expected_h
        )));
    }
    Ok(())
}

fn run_sidecar_on_gpu(
    binary: &Path,
    model: UpscalerModel,
    scale: u32,
    models: &Path,
    input: &Path,
    output: &Path,
    gpu_id: i32,
) -> Result<(), AppError> {
    let mut cmd = Command::new(binary);
    cmd.arg("-i").arg(input);
    cmd.arg("-o").arg(output);
    let vulkan_icd = vulkan_icd_for_gpu(binary, gpu_id);
    configure_model_args(&mut cmd, model, scale, models, gpu_id, vulkan_icd);
    apply_windows_sidecar_flags(&mut cmd);
    if let Some(bin_dir) = binary.parent() {
        cmd.current_dir(bin_dir);
    }

    let output = cmd.output().map_err(|err| {
        AppError::IoError(format!(
            "failed to launch upscaler `{}`: {err}. A Vulkan-compatible GPU is required.",
            binary.display()
        ))
    })?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);

    let gpu_label = if gpu_id < 0 {
        "CPU".to_string()
    } else {
        format!("GPU {gpu_id}")
    };

    if !output.status.success() {
        return Err(AppError::IoError(format!(
            "upscaler exited with {} on {gpu_label}: {}\n{}",
            output.status,
            stderr.trim(),
            stdout.trim()
        )));
    }

    if stderr_indicates_vulkan_failure(&stderr, &stdout) {
        return Err(AppError::IoError(format!(
            "upscaler reported a Vulkan GPU error on {gpu_label} (output may be corrupted): {}\n{}",
            stderr.trim(),
            stdout.trim()
        )));
    }

    Ok(())
}

fn run_sidecar(
    binary: &Path,
    model: UpscalerModel,
    scale: u32,
    models: &Path,
    input: &Path,
    output: &Path,
) -> Result<(), AppError> {
    let mut last_err: Option<AppError> = None;
    let try_order = gpu_try_order(binary, model);
    let mut skip_remaining_vulkan = false;
    let mut skip_cpu = GPU_FAILURE_STREAK.load(Ordering::Relaxed) > 0;

    for gpu_id in try_order {
        if skip_remaining_vulkan && gpu_id >= 0 {
            continue;
        }
        if skip_cpu && gpu_id < 0 {
            continue;
        }

        // Stale / partial files from a failed adapter must not be reused.
        let _ = fs::remove_file(output);
        if output.is_dir() {
            let _ = fs::remove_dir_all(output);
            let _ = fs::create_dir_all(output);
        }

        match run_sidecar_on_gpu(binary, model, scale, models, input, output, gpu_id) {
            Ok(()) => {
                GPU_FAILURE_STREAK.store(0, Ordering::Relaxed);
                LAST_DEVICE_ID.store(gpu_id, Ordering::Relaxed);
                // Only cache real Vulkan adapters — not CPU (-1).
                if gpu_id >= 0 {
                    PREFERRED_GPU.store(gpu_id, Ordering::Relaxed);
                }
                return Ok(());
            }
            Err(err) => {
                if gpu_id >= 0 && PREFERRED_GPU.load(Ordering::Relaxed) == gpu_id {
                    PREFERRED_GPU.store(-1, Ordering::Relaxed);
                }

                if error_is_access_violation(&err) {
                    // Waifu2x still enumerates Vulkan on `-g -1`, so CPU AVs the same way.
                    // Real-ESRGAN can still succeed on CPU after a discrete-GPU crash.
                    skip_remaining_vulkan = true;
                    if !matches!(model, UpscalerModel::RealesrganAnime) {
                        skip_cpu = true;
                    }
                    GPU_FAILURE_STREAK.fetch_add(1, Ordering::Relaxed);
                    thread::sleep(Duration::from_millis(400));
                    last_err = Some(err);
                    continue;
                }
                if gpu_id >= 0 && error_is_skippable_gpu_failure(&err) {
                    GPU_FAILURE_STREAK.fetch_add(1, Ordering::Relaxed);
                    last_err = Some(err);
                    continue;
                }
                last_err = Some(err);
                if gpu_id >= 0 {
                    skip_remaining_vulkan = true;
                    continue;
                }
                break;
            }
        }
    }

    let fallback = AppError::IoError("upscaler failed on the NVIDIA GPU.".to_string());
    Err(last_err.unwrap_or(fallback))
}

/// Upscale one RGBA image via the ncnn-Vulkan CLI. Returns the upscaled RGBA image.
pub fn upscale_rgba_image(
    image: &RgbaImage,
    model: UpscalerModel,
    scale: u32,
    work_dir: &Path,
) -> Result<RgbaImage, AppError> {
    if !(scale == 2 || scale == 4) {
        return Err(AppError::InvalidOperation("upscaler scale must be 2 or 4"));
    }

    fs::create_dir_all(work_dir)?;
    let input_path = work_dir.join("in.png");
    let output_path = work_dir.join("out.png");
    let prepared = prepare_sprite_for_model(image);
    image_io::save_rgba_png_fast(&input_path, &prepared)?;

    let binary = resolve_sidecar_binary(model)?;
    let models = resolve_models_dir(model)?;
    run_sidecar(&binary, model, scale, &models, &input_path, &output_path)?;

    if !output_path.is_file() {
        return Err(AppError::IoError(
            "upscaler finished but output PNG was not created".to_string(),
        ));
    }

    let upscaled = image::open(&output_path)
        .map_err(|e| AppError::IoError(e.to_string()))?
        .to_rgba8();
    let cropped = crop_scaled_padding(&upscaled, image.width(), image.height(), scale)?;
    validate_scaled_dims(image, &cropped, scale)?;
    let _ = fs::remove_file(&input_path);
    let _ = fs::remove_file(&output_path);
    Ok(cropped)
}

fn upscale_chunk_directory(
    images: &[RgbaImage],
    model: UpscalerModel,
    scale: u32,
    work_dir: &Path,
) -> Result<Vec<RgbaImage>, AppError> {
    let input_dir = work_dir.join("in");
    let output_dir = work_dir.join("out");
    let _ = fs::remove_dir_all(&input_dir);
    let _ = fs::remove_dir_all(&output_dir);
    fs::create_dir_all(&input_dir)?;
    fs::create_dir_all(&output_dir)?;

    for (idx, image) in images.iter().enumerate() {
        let path = input_dir.join(format!("{idx:06}.png"));
        let prepared = prepare_sprite_for_model(image);
        image_io::save_rgba_png_fast(&path, &prepared)?;
    }

    let binary = resolve_sidecar_binary(model)?;
    let models = resolve_models_dir(model)?;
    run_sidecar(&binary, model, scale, &models, &input_dir, &output_dir)?;

    let mut out = Vec::with_capacity(images.len());
    for (idx, src) in images.iter().enumerate() {
        let path = output_dir.join(format!("{idx:06}.png"));
        if !path.is_file() {
            return Err(AppError::IoError(format!(
                "upscaler batch missing output for sprite index {idx} (`{}`)",
                path.display()
            )));
        }
        let upscaled = image::open(&path)
            .map_err(|e| AppError::IoError(e.to_string()))?
            .to_rgba8();
        let cropped = crop_scaled_padding(&upscaled, src.width(), src.height(), scale)?;
        validate_scaled_dims(src, &cropped, scale)?;
        out.push(cropped);
    }

    let _ = fs::remove_dir_all(&input_dir);
    let _ = fs::remove_dir_all(&output_dir);
    Ok(out)
}

fn upscale_chunk_one_by_one(
    images: &[RgbaImage],
    model: UpscalerModel,
    scale: u32,
    work_dir: &Path,
) -> Result<Vec<RgbaImage>, AppError> {
    let mut out = Vec::with_capacity(images.len());
    for (idx, image) in images.iter().enumerate() {
        let sprite_dir = work_dir.join(format!("one-{idx:06}"));
        fs::create_dir_all(&sprite_dir)?;
        out.push(upscale_rgba_image(image, model, scale, &sprite_dir)?);
        let _ = fs::remove_dir_all(&sprite_dir);
        thread::sleep(Duration::from_millis(15));
    }
    Ok(out)
}

/// Prefer one directory invocation (model stays loaded). On failure, split the
/// batch in half instead of immediately spawning one exe per sprite.
fn upscale_chunk_adaptive(
    images: &[RgbaImage],
    model: UpscalerModel,
    scale: u32,
    work_dir: &Path,
) -> Result<Vec<RgbaImage>, AppError> {
    match upscale_chunk_directory(images, model, scale, work_dir) {
        Ok(v) => Ok(v),
        Err(dir_err) => {
            if images.len() <= 1 {
                let one_dir = work_dir.join("one");
                fs::create_dir_all(&one_dir)?;
                return upscale_chunk_one_by_one(images, model, scale, &one_dir).map_err(
                    |one_err| {
                        AppError::IoError(format!(
                            "upscaler chunk failed ({dir_err}); one-by-one retry also failed ({one_err})"
                        ))
                    },
                );
            }
            let mid = images.len() / 2;
            let left_dir = work_dir.join("a");
            let right_dir = work_dir.join("b");
            fs::create_dir_all(&left_dir)?;
            fs::create_dir_all(&right_dir)?;
            let mut out = upscale_chunk_adaptive(&images[..mid], model, scale, &left_dir)?;
            out.extend(upscale_chunk_adaptive(
                &images[mid..],
                model,
                scale,
                &right_dir,
            )?);
            Ok(out)
        }
    }
}

/// Upscale many images in large CLI chunks so the ncnn model stays loaded.
///
/// If a directory chunk hits a GPU error, that chunk splits in half (then one-by-one)
/// instead of immediately relaunching the sidecar per sprite.
///
/// `on_chunk` is invoked after each chunk with `(sprites_done_in_this_call, total)`.
pub fn upscale_rgba_images_batch(
    images: &[RgbaImage],
    model: UpscalerModel,
    scale: u32,
    work_dir: &Path,
) -> Result<Vec<RgbaImage>, AppError> {
    upscale_rgba_images_batch_with_progress(images, model, scale, work_dir, &mut |_, _| {})
}

pub fn upscale_rgba_images_batch_with_progress<F>(
    images: &[RgbaImage],
    model: UpscalerModel,
    scale: u32,
    work_dir: &Path,
    on_chunk: &mut F,
) -> Result<Vec<RgbaImage>, AppError>
where
    F: FnMut(usize, usize),
{
    if images.is_empty() {
        return Ok(Vec::new());
    }
    if !(scale == 2 || scale == 4) {
        return Err(AppError::InvalidOperation("upscaler scale must be 2 or 4"));
    }

    let chunk_size = chunk_size_for_model(model);
    let mut out = Vec::with_capacity(images.len());
    let mut offset = 0usize;
    let mut chunk_idx = 0usize;
    while offset < images.len() {
        let end = (offset + chunk_size).min(images.len());
        let chunk = &images[offset..end];
        let chunk_dir = work_dir.join(format!("chunk-{chunk_idx:04}"));
        fs::create_dir_all(&chunk_dir)?;

        let chunk_out = upscale_chunk_adaptive(chunk, model, scale, &chunk_dir)?;

        out.extend(chunk_out);
        let _ = fs::remove_dir_all(&chunk_dir);
        offset = end;
        chunk_idx += 1;
        on_chunk(offset, images.len());
        if offset < images.len() {
            thread::sleep(Duration::from_millis(CHUNK_YIELD_MS));
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn binary_names_are_stable() {
        assert_eq!(
            binary_base_name(UpscalerModel::RealesrganAnime),
            "realesrgan-ncnn-vulkan"
        );
        assert_eq!(
            binary_base_name(UpscalerModel::Waifu2x),
            "waifu2x-ncnn-vulkan"
        );
    }

    #[test]
    fn realesrgan_picks_animevideov3_weights() {
        assert_eq!(realesrgan_model_name(2), "realesr-animevideov3");
        assert_eq!(realesrgan_model_name(4), "realesr-animevideov3");
    }

    #[test]
    fn realesrgan_cli_scale_is_always_native_4x() {
        assert_eq!(sidecar_cli_scale(UpscalerModel::RealesrganAnime, 2), 4);
        assert_eq!(sidecar_cli_scale(UpscalerModel::RealesrganAnime, 4), 4);
        assert_eq!(sidecar_cli_scale(UpscalerModel::Waifu2x, 2), 2);
        assert_eq!(sidecar_cli_scale(UpscalerModel::Waifu2x, 4), 4);
    }

    #[test]
    fn chunk_size_keeps_model_warm() {
        assert!(UPSCALE_CHUNK_SIZE >= 16);
        assert!(UPSCALE_CHUNK_SIZE <= 64);
    }

    #[test]
    fn pad_and_crop_round_trip_size() {
        let src = RgbaImage::from_pixel(20, 10, Rgba([10, 20, 30, 255]));
        let prepared = prepare_sprite_for_model(&src);
        assert_eq!(prepared.width() % 8, 0);
        assert_eq!(prepared.height() % 8, 0);
        assert!(prepared.width() >= 20 + UPSCALE_EDGE_PAD * 2);
        assert!(prepared.height() >= 10 + UPSCALE_EDGE_PAD * 2);
        let fake_upscaled = RgbaImage::from_pixel(
            prepared.width() * 2,
            prepared.height() * 2,
            Rgba([10, 20, 30, 255]),
        );
        let cropped = crop_scaled_padding(&fake_upscaled, 20, 10, 2).unwrap();
        assert_eq!(cropped.width(), 40);
        assert_eq!(cropped.height(), 20);
    }

    #[test]
    fn crop_4x_output_to_2x_keeps_bottom_right_sprite() {
        // A mark in the bottom-right of the HD sprite is lost if a 4× buffer is
        // cropped as 2× (top-left quadrant only) — leftover 4×-net corruption.
        let mut src = RgbaImage::from_pixel(32, 32, Rgba([0, 0, 0, 0]));
        for y in 20..24 {
            for x in 20..24 {
                src.put_pixel(x, y, Rgba([255, 255, 255, 255]));
            }
        }
        let prepared = pad_replicate(&src, UPSCALE_EDGE_PAD);
        let fake_4x = image::imageops::resize(
            &prepared,
            prepared.width().saturating_mul(4),
            prepared.height().saturating_mul(4),
            image::imageops::FilterType::Nearest,
        );
        let cropped = crop_scaled_padding(&fake_4x, 32, 32, 2).unwrap();
        assert_eq!(cropped.dimensions(), (64, 64));
        let mark = cropped.get_pixel(42, 42).0;
        assert!(
            mark[0] > 200 && mark[3] > 200,
            "expected the bottom-right mark after 4×→2× crop, got {mark:?}"
        );
        assert_eq!(infer_native_scale(&fake_4x, 32, 32).unwrap(), 4);
    }

    #[test]
    fn bleed_fills_transparent_rgb_from_opaque_neighbor() {
        let mut img = RgbaImage::from_pixel(3, 1, Rgba([0, 0, 0, 0]));
        img.put_pixel(0, 0, Rgba([255, 0, 0, 255]));
        bleed_transparent_rgb(&mut img);
        let mid = img.get_pixel(1, 0).0;
        assert_eq!(mid[3], 0);
        assert!(mid[0] > 200, "expected red bleed, got {mid:?}");
    }

    #[test]
    fn bleed_still_runs_on_images_larger_than_512() {
        let mut img = RgbaImage::from_pixel(513, 513, Rgba([0, 0, 0, 0]));
        img.put_pixel(10, 10, Rgba([255, 0, 0, 255]));
        bleed_transparent_rgb(&mut img);
        let mid = img.get_pixel(11, 10).0;
        assert_eq!(mid[3], 0);
        assert!(
            mid[0] > 200,
            "expected red bleed on large canvas, got {mid:?}"
        );
    }

    #[test]
    fn parse_vulkan_gpu_list_reads_ncnn_device_dump() {
        let blob = r#"
[0 NVIDIA GeForce RTX 3080 Laptop GPU]  queueC=2[8]  queueG=0[16]
[0 NVIDIA GeForce RTX 3080 Laptop GPU]  bugsbn1=0
[1 Intel(R) Iris(R) Xe Graphics]  queueC=0[1]  queueG=0[1]
invalid gpu device
"#;
        let gpus = parse_vulkan_gpu_list(blob);
        assert_eq!(gpus.len(), 2);
        assert_eq!(gpus[0].0, 0);
        assert!(gpus[0].1.contains("NVIDIA"));
        assert_eq!(gpus[1].0, 1);
        assert!(gpus[1].1.contains("Intel"));
        assert_eq!(gpu_preference_rank(&gpus[0].1), 0);
        assert_eq!(gpu_preference_rank(&gpus[1].1), 3);
        assert!(!is_integrated_gpu_name(&gpus[0].1));
        assert!(is_integrated_gpu_name(&gpus[1].1));
    }

    #[test]
    fn access_violation_errors_are_detected() {
        let err = AppError::IoError(
            "upscaler exited with exit code: 0xc0000005 on GPU 0: dump".to_string(),
        );
        assert!(error_is_access_violation(&err));
        assert!(error_is_skippable_gpu_failure(&err));
    }

    #[test]
    fn waifu2x_uses_directory_chunks() {
        assert_eq!(
            chunk_size_for_model(UpscalerModel::Waifu2x),
            UPSCALE_CHUNK_SIZE
        );
        assert!(UPSCALE_CHUNK_SIZE >= 16);
    }

    #[test]
    fn nvidia_icd_remap_uses_gpu_zero() {
        assert!(is_nvidia_gpu_name("NVIDIA GeForce RTX 3080 Laptop GPU"));
        assert!(!is_nvidia_gpu_name("Intel(R) Iris(R) Xe Graphics"));
    }

    fn pixel_luma(pixel: [u8; 4]) -> u8 {
        ((u16::from(pixel[0]) + u16::from(pixel[1]) + u16::from(pixel[2])) / 3) as u8
    }

    fn edge_coverage_stats(img: &RgbaImage) -> (u32, u32, u32) {
        let mut alpha_fringe = 0u32;
        let mut rgb_gray_edge = 0u32;
        let mut solid = 0u32;
        let w = img.width();
        let h = img.height();
        for y in 0..h {
            for x in 0..w {
                let p = img.get_pixel(x, y).0;
                if p[3] >= 250 {
                    solid = solid.saturating_add(1);
                } else if p[3] >= 16 {
                    alpha_fringe = alpha_fringe.saturating_add(1);
                }
                if p[3] < 250 {
                    continue;
                }
                let luma = pixel_luma(p);
                if !(30..=220).contains(&luma) {
                    continue;
                }
                let mut near_empty = false;
                for dy in -1i32..=1 {
                    for dx in -1i32..=1 {
                        let nx = x as i32 + dx;
                        let ny = y as i32 + dy;
                        if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                            continue;
                        }
                        if img.get_pixel(nx as u32, ny as u32).0[3] < 16 {
                            near_empty = true;
                        }
                    }
                }
                if near_empty {
                    rgb_gray_edge = rgb_gray_edge.saturating_add(1);
                }
            }
        }
        (alpha_fringe, rgb_gray_edge, solid)
    }

    fn fringe_distance_summary(img: &RgbaImage) -> String {
        let w = img.width();
        let h = img.height();
        let body = |x: i32, y: i32| -> bool {
            if x < 0 || y < 0 || x >= w as i32 || y >= h as i32 {
                return false;
            }
            let p = img.get_pixel(x as u32, y as u32).0;
            p[3] >= 250 || pixel_luma(p) <= 24 && p[3] >= 176
        };
        let mut dist_hist = [0u32; 5];
        let mut ink_fringe = 0u32;
        let mut light_fringe = 0u32;
        let mut aa_alpha_sum = 0u32;
        let mut aa_n = 0u32;
        for y in 0..h {
            for x in 0..w {
                let p = img.get_pixel(x, y).0;
                if p[3] < 16 || p[3] >= 250 {
                    continue;
                }
                if pixel_luma(p) <= 24 {
                    ink_fringe = ink_fringe.saturating_add(1);
                } else {
                    light_fringe = light_fringe.saturating_add(1);
                    aa_alpha_sum = aa_alpha_sum.saturating_add(u32::from(p[3]));
                    aa_n = aa_n.saturating_add(1);
                }
                let mut d = 4u32;
                'search: for r in 1i32..=3 {
                    for dy in -r..=r {
                        for dx in -r..=r {
                            if dx.abs().max(dy.abs()) != r {
                                continue;
                            }
                            if body(x as i32 + dx, y as i32 + dy) {
                                d = r as u32;
                                break 'search;
                            }
                        }
                    }
                }
                dist_hist[d as usize] = dist_hist[d as usize].saturating_add(1);
            }
        }
        let avg_aa = if aa_n == 0 { 0 } else { aa_alpha_sum / aa_n };
        format!(
            "ink_midα={ink_fringe} light_midα={light_fringe} avg_light_α={avg_aa} dist1={} dist2={} dist3={} dist4+={}",
            dist_hist[1], dist_hist[2], dist_hist[3], dist_hist[4]
        )
    }

    fn stack_sprites_vertically(sprites: &[(String, RgbaImage)]) -> RgbaImage {
        let gap = 6u32;
        let width = sprites
            .iter()
            .map(|(_, img)| img.width())
            .max()
            .unwrap_or(1);
        let height = sprites
            .iter()
            .map(|(_, img)| img.height().saturating_add(gap))
            .sum::<u32>()
            .saturating_add(gap);
        let mut sheet = RgbaImage::from_pixel(width.max(1), height.max(1), Rgba([0, 0, 0, 255]));
        let mut y = gap;
        for (_, img) in sprites {
            for (px, py, pixel) in img.enumerate_pixels() {
                sheet.put_pixel(px, y.saturating_add(py), *pixel);
            }
            y = y.saturating_add(img.height()).saturating_add(gap);
        }
        sheet
    }

    fn nearest_zoom(img: &RgbaImage, scale: u32) -> RgbaImage {
        let scale = scale.max(1);
        let mut out = RgbaImage::new(
            img.width().saturating_mul(scale),
            img.height().saturating_mul(scale),
        );
        for (x, y, pixel) in img.enumerate_pixels() {
            for dy in 0..scale {
                for dx in 0..scale {
                    out.put_pixel(
                        x.saturating_mul(scale).saturating_add(dx),
                        y.saturating_mul(scale).saturating_add(dy),
                        *pixel,
                    );
                }
            }
        }
        out
    }

    fn composite_on_magenta(img: &RgbaImage) -> RgbaImage {
        let mut out = RgbaImage::from_pixel(img.width(), img.height(), Rgba([255, 0, 255, 255]));
        for (x, y, pixel) in img.enumerate_pixels() {
            let p = pixel.0;
            if p[3] == 0 {
                continue;
            }
            let a = f32::from(p[3]) / 255.0;
            let dst = out.get_pixel_mut(x, y);
            dst.0[0] = (f32::from(p[0]) * a + 255.0 * (1.0 - a)).round() as u8;
            dst.0[1] = (f32::from(p[1]) * a).round() as u8;
            dst.0[2] = (f32::from(p[2]) * a + 255.0 * (1.0 - a)).round() as u8;
            dst.0[3] = 255;
        }
        out
    }

    #[test]
    #[ignore]
    fn experiment_aa_on_medium_test_icons() {
        use crate::core::contracts::SplitterOptions;
        use crate::core::discovery::SheetCandidate;
        use crate::core::image_finish::{finish_ai_upscaled_sprite_layers, FinishPolicy};
        use crate::core::image_io::save_rgba_png_fast;
        use crate::core::splitter::split_sheet_candidate_memory;
        use std::fs;
        use std::path::PathBuf;

        let icons = PathBuf::from(r"C:\Users\Kevin\Downloads\medium test\icons");
        let out_root = PathBuf::from(r"C:\Users\Kevin\Downloads\medium test\aa-iter");
        assert!(icons.is_dir(), "expected HD icons at {}", icons.display());
        eprintln!("icons dir listing:");
        if let Ok(entries) = fs::read_dir(&icons) {
            for entry in entries.flatten() {
                eprintln!("  {}", entry.path().display());
            }
        }
        fs::create_dir_all(&out_root).expect("aa-iter dir");
        reset_upscaler_run_state();

        let sheets = [
            "bird_15-hd",
            "bird_18-hd",
            "bird_01-hd",
            "bird_21-hd",
            "dart_01-hd",
            "player_129-hd",
        ];
        let splitter_opts = SplitterOptions {
            sheet_concurrency: 1,
            skip_icons: false,
        };

        let mut processed = 0usize;
        for stem in sheets {
            let png_path = icons.join(format!("{stem}.png"));
            let plist_path = icons.join(format!("{stem}.plist"));
            if !png_path.is_file() || !plist_path.is_file() {
                eprintln!(
                    "skip {stem}: png={} plist={}",
                    png_path.is_file(),
                    plist_path.is_file()
                );
                continue;
            }
            processed = processed.saturating_add(1);
            let candidate = SheetCandidate {
                stem: stem.to_string(),
                relative_dir: PathBuf::new(),
                plist_path,
                png_path,
            };
            let split =
                split_sheet_candidate_memory(&candidate, &splitter_opts, || {}).expect("split");
            let mut frames: Vec<(String, RgbaImage)> = split.sprites.into_iter().collect();
            frames.sort_by(|a, b| a.0.cmp(&b.0));
            let cache_dir = out_root.join("cache_v3").join(stem);
            fs::create_dir_all(&cache_dir).expect("cache dir");

            let mut sharpened: Vec<(String, RgbaImage)> = Vec::new();
            let mut missing: Vec<(usize, RgbaImage)> = Vec::new();
            for (idx, (name, src)) in frames.iter().enumerate() {
                let cache_path = cache_dir.join(format!("{idx:02}_{name}"));
                if cache_path.is_file() {
                    let img = image::open(&cache_path).expect("open cache").to_rgba8();
                    sharpened.push((name.clone(), img));
                } else {
                    missing.push((idx, src.clone()));
                    sharpened.push((name.clone(), src.clone()));
                }
            }
            if !missing.is_empty() {
                let images: Vec<RgbaImage> = missing.iter().map(|(_, img)| img.clone()).collect();
                let work = out_root.join("_work").join(stem);
                let _ = fs::remove_dir_all(&work);
                fs::create_dir_all(&work).expect("work dir");
                let upscaled = upscale_rgba_images_batch(&images, UpscalerModel::Waifu2x, 2, &work)
                    .expect("upscale");
                for ((idx, _), up) in missing.iter().zip(upscaled.into_iter()) {
                    let name = &frames[*idx].0;
                    let cache_path = cache_dir.join(format!("{idx:02}_{name}"));
                    save_rgba_png_fast(&cache_path, &up).expect("write cache");
                    sharpened[*idx] = (name.clone(), up);
                }
                let _ = fs::remove_dir_all(&work);
            }

            let before: Vec<(String, RgbaImage)> = sharpened
                .iter()
                .filter(|(n, _)| !n.contains("_glow_"))
                .cloned()
                .collect();
            let aaed: Vec<(String, RgbaImage)> = before
                .iter()
                .map(|(n, ai)| {
                    (
                        n.clone(),
                        finish_ai_upscaled_sprite_layers(
                            ai,
                            FinishPolicy::for_upscaled_sprite(true, n),
                        )
                        .composed,
                    )
                })
                .collect();

            let sheet_dir = out_root.join("sheets");
            fs::create_dir_all(&sheet_dir).expect("sheets dir");
            save_rgba_png_fast(
                &sheet_dir.join(format!("{stem}_0_sharpened.png")),
                &stack_sprites_vertically(&before),
            )
            .expect("write sharpened sheet");
            save_rgba_png_fast(
                &sheet_dir.join(format!("{stem}_1_outward_aa.png")),
                &stack_sprites_vertically(&aaed),
            )
            .expect("write aa sheet");
            save_rgba_png_fast(
                &sheet_dir.join(format!("{stem}_0_sharpened_magenta.png")),
                &composite_on_magenta(&stack_sprites_vertically(&before)),
            )
            .expect("write before magenta");
            save_rgba_png_fast(
                &sheet_dir.join(format!("{stem}_1_outward_aa_magenta.png")),
                &composite_on_magenta(&stack_sprites_vertically(&aaed)),
            )
            .expect("write aa magenta");
            let stacked = stack_sprites_vertically(&before);
            let (af, rgb, sol) = edge_coverage_stats(&stacked);
            eprintln!("{stem} before:  alpha_fringe={af} rgb_gray_edge={rgb} solid={sol}");
            let stacked = stack_sprites_vertically(&aaed);
            let (af, rgb, sol) = edge_coverage_stats(&stacked);
            eprintln!("{stem} outward: alpha_fringe={af} rgb_gray_edge={rgb} solid={sol}");
            eprintln!("{stem} fringe dist {}", fringe_distance_summary(&stacked));
            if stem == "bird_18-hd" {
                if let Some((_, img)) = aaed.first() {
                    let zoom = nearest_zoom(img, 4);
                    save_rgba_png_fast(
                        &sheet_dir.join("bird_18_001_aa_x4_magenta.png"),
                        &composite_on_magenta(&zoom),
                    )
                    .expect("write zoom");
                }
                if let Some((_, img)) = before.first() {
                    let zoom = nearest_zoom(img, 4);
                    save_rgba_png_fast(
                        &sheet_dir.join("bird_18_001_before_x4_magenta.png"),
                        &composite_on_magenta(&zoom),
                    )
                    .expect("write before zoom");
                }
            }
        }
        assert!(
            processed > 0,
            "no HD sheets processed from {}",
            icons.display()
        );
    }
}
