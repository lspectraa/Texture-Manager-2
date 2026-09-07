//! Android native APK update check, download, and install.

use serde::{Deserialize, Serialize};
use tauri::{
  plugin::{Builder as PluginBuilder, TauriPlugin},
  AppHandle, Manager, Runtime,
};

#[cfg(target_os = "android")]
use tauri::{plugin::PluginHandle, Emitter};

#[cfg(target_os = "android")]
const ANDROID_PLUGIN_PACKAGE: &str = "com.spectra.texturemanager2";
#[cfg(target_os = "android")]
const ANDROID_PLUGIN_CLASS: &str = "ApkUpdatePlugin";

#[cfg(target_os = "android")]
const MANIFEST_URL: &str =
  "https://github.com/lspectraa/Texture-Manager-2/releases/latest/download/android-latest.json";
#[cfg(target_os = "android")]
const PLATFORM_KEY: &str = "aarch64-linux-android";
#[cfg(target_os = "android")]
const DOWNLOAD_PROGRESS_EVENT: &str = "android-update-download-progress";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CanInstallPackagesResponse {
  allowed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallApkRequest {
  path: String,
}

#[cfg(target_os = "android")]
#[derive(Debug, Deserialize)]
struct UpdateManifest {
  version: String,
  #[serde(default)]
  notes: String,
  #[serde(default)]
  pub_date: Option<String>,
  platforms: std::collections::HashMap<String, PlatformArtifact>,
}

#[cfg(target_os = "android")]
#[derive(Debug, Deserialize)]
struct PlatformArtifact {
  url: String,
  sha256: String,
}

#[cfg(target_os = "android")]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
  downloaded: u64,
  total: Option<u64>,
}

#[cfg(target_os = "android")]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadResult {
  path: String,
}

pub struct AndroidApkUpdate<R: Runtime> {
  #[cfg(target_os = "android")]
  handle: PluginHandle<R>,
  #[cfg(not(target_os = "android"))]
  _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> AndroidApkUpdate<R> {
  pub fn can_install_packages(&self) -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
      let response: CanInstallPackagesResponse = self
        .handle
        .run_mobile_plugin("canInstallPackages", ())
        .map_err(|err| err.to_string())?;
      return Ok(response.allowed);
    }
    #[cfg(not(target_os = "android"))]
    {
      Ok(false)
    }
  }

  pub fn open_install_permission_settings(&self) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
      let _: () = self
        .handle
        .run_mobile_plugin("openInstallPermissionSettings", ())
        .map_err(|err| err.to_string())?;
      return Ok(());
    }
    #[cfg(not(target_os = "android"))]
    {
      Err("Install permission settings are only available on Android.".to_string())
    }
  }

  pub fn install_apk(&self, path: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
      let _: () = self
        .handle
        .run_mobile_plugin("installApk", InstallApkRequest { path })
        .map_err(|err| err.to_string())?;
      return Ok(());
    }
    #[cfg(not(target_os = "android"))]
    {
      let _ = path;
      Err("APK install is only available on Android.".to_string())
    }
  }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  PluginBuilder::new("android-apk-update")
    .setup(|app, api| {
      #[cfg(target_os = "android")]
      {
        let handle = api.register_android_plugin(ANDROID_PLUGIN_PACKAGE, ANDROID_PLUGIN_CLASS)?;
        app.manage(AndroidApkUpdate::<R> { handle });
      }
      #[cfg(not(target_os = "android"))]
      {
        let _ = api;
        app.manage(AndroidApkUpdate::<R> {
          _marker: std::marker::PhantomData,
        });
      }
      Ok(())
    })
    .build()
}

#[cfg(target_os = "android")]
fn create_update_client(timeout: Option<std::time::Duration>) -> Result<reqwest::Client, String> {
  let roots = webpki_root_certs::TLS_SERVER_ROOT_CERTS
    .iter()
    .filter_map(|der| reqwest::tls::Certificate::from_der(der.as_ref()).ok());

  let mut builder = reqwest::Client::builder()
    .user_agent(concat!("Texture-Manager-2/", env!("CARGO_PKG_VERSION")))
    .connect_timeout(std::time::Duration::from_secs(10))
    .tls_certs_only(roots);

  if let Some(timeout) = timeout {
    builder = builder.timeout(timeout);
  }

  builder
    .build()
    .map_err(|err| format!("Failed to build HTTP client: {err}"))
}

pub async fn check_app_update<R: Runtime>(app: AppHandle<R>) -> Result<serde_json::Value, String> {
  #[cfg(not(target_os = "android"))]
  {
    let _ = app;
    return Ok(serde_json::json!({ "status": "unsupported" }));
  }

  #[cfg(target_os = "android")]
  {
    use futures_util::FutureExt;

    let res = std::panic::AssertUnwindSafe(async {
      let current_version = app.package_info().version.to_string();
      let client = create_update_client(Some(std::time::Duration::from_secs(20)))?;

      let manifest: UpdateManifest = client
        .get(MANIFEST_URL)
        .send()
        .await
        .map_err(|err| format!("Failed to fetch update manifest: {err}"))?
        .error_for_status()
        .map_err(|err| format!("Update manifest request failed: {err}"))?
        .json()
        .await
        .map_err(|err| format!("Invalid update manifest JSON: {err}"))?;

      if !is_newer_version(&manifest.version, &current_version) {
        return Ok(serde_json::json!({
          "status": "upToDate",
          "currentVersion": current_version,
        }));
      }

      let artifact = manifest
        .platforms
        .get(PLATFORM_KEY)
        .ok_or_else(|| format!("Update manifest missing platform '{PLATFORM_KEY}'"))?;

      validate_download_url(&artifact.url)?;

      Ok(serde_json::json!({
        "status": "available",
        "currentVersion": current_version,
        "version": manifest.version,
        "notes": manifest.notes,
        "date": manifest.pub_date,
        "url": artifact.url,
        "sha256": artifact.sha256,
      }))
    })
    .catch_unwind()
    .await;

    match res {
      Ok(outcome) => outcome,
      Err(panic_payload) => {
        let msg = if let Some(s) = panic_payload.downcast_ref::<&str>() {
          (*s).to_string()
        } else if let Some(s) = panic_payload.downcast_ref::<String>() {
          s.clone()
        } else {
          "Unknown panic during Android update check".to_string()
        };
        Err(format!("Android update check panicked: {msg}"))
      }
    }
  }
}

pub async fn download_app_update<R: Runtime>(
  app: AppHandle<R>,
  url: String,
  sha256: String,
) -> Result<serde_json::Value, String> {
  #[cfg(not(target_os = "android"))]
  {
    let _ = (app, url, sha256);
    return Err("APK download is only available on Android.".to_string());
  }

  #[cfg(target_os = "android")]
  {
    use futures_util::StreamExt;
    use sha2::{Digest, Sha256};
    use tokio::io::AsyncWriteExt;

    validate_download_url(&url)?;
    let expected = normalize_sha256(&sha256)?;

    let updates_dir = app
      .path()
      .app_data_dir()
      .map_err(|err| err.to_string())?
      .join("updates");
    tokio::fs::create_dir_all(&updates_dir)
      .await
      .map_err(|err| format!("Failed to create updates directory: {err}"))?;
    let dest = updates_dir.join("update.apk");
    let tmp = updates_dir.join("update.apk.partial");

    let client = create_update_client(None)?;

    let response = client
      .get(&url)
      .send()
      .await
      .map_err(|err| format!("Failed to download APK: {err}"))?
      .error_for_status()
      .map_err(|err| format!("APK download request failed: {err}"))?;

    let total = response.content_length();
    let mut stream = response.bytes_stream();
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;

    let mut file = tokio::fs::File::create(&tmp)
      .await
      .map_err(|err| format!("Failed to create APK temp file: {err}"))?;

    while let Some(chunk) = stream.next().await {
      let chunk = chunk.map_err(|err| format!("Download stream error: {err}"))?;
      hasher.update(&chunk);
      file
        .write_all(&chunk)
        .await
        .map_err(|err| format!("Failed to write APK: {err}"))?;
      downloaded = downloaded.saturating_add(chunk.len() as u64);
      let _ = app.emit(
        DOWNLOAD_PROGRESS_EVENT,
        DownloadProgress { downloaded, total },
      );
    }

    file
      .flush()
      .await
      .map_err(|err| format!("Failed to flush APK: {err}"))?;
    drop(file);

    let actual: String = hasher
      .finalize()
      .iter()
      .map(|byte| format!("{byte:02x}"))
      .collect();
    if actual != expected {
      let _ = tokio::fs::remove_file(&tmp).await;
      return Err(format!(
        "APK checksum mismatch (expected {expected}, got {actual})"
      ));
    }

    if dest.exists() {
      tokio::fs::remove_file(&dest)
        .await
        .map_err(|err| format!("Failed to replace previous APK: {err}"))?;
    }
    tokio::fs::rename(&tmp, &dest)
      .await
      .map_err(|err| format!("Failed to finalize APK download: {err}"))?;

    let path = dest
      .to_str()
      .ok_or_else(|| "APK path is not valid UTF-8".to_string())?
      .to_string();

    serde_json::to_value(DownloadResult { path }).map_err(|err| err.to_string())
  }
}

#[cfg(target_os = "android")]
fn validate_download_url(url: &str) -> Result<(), String> {
  let parsed = reqwest::Url::parse(url).map_err(|err| format!("Invalid download URL: {err}"))?;
  if parsed.scheme() != "https" {
    return Err("APK download URL must use HTTPS.".to_string());
  }
  let host = parsed
    .host_str()
    .ok_or_else(|| "APK download URL is missing a host.".to_string())?;
  let host_ok = host.eq_ignore_ascii_case("github.com")
    || host
      .to_ascii_lowercase()
      .ends_with(".githubusercontent.com");
  if !host_ok {
    return Err(format!(
      "APK download host '{host}' is not allowed (github.com / *.githubusercontent.com only)."
    ));
  }
  Ok(())
}

#[cfg(target_os = "android")]
fn normalize_sha256(value: &str) -> Result<String, String> {
  let cleaned = value.trim().to_ascii_lowercase();
  if cleaned.len() != 64 || !cleaned.chars().all(|c| c.is_ascii_hexdigit()) {
    return Err("Expected a 64-character hex SHA-256 digest.".to_string());
  }
  Ok(cleaned)
}

#[cfg(any(target_os = "android", test))]
fn parse_semver_triple(version: &str) -> Option<(u64, u64, u64)> {
  let trimmed = version.trim().trim_start_matches('v');
  let numeric = trimmed.split(['-', '+']).next().unwrap_or(trimmed);
  let mut parts = numeric.split('.');
  let major = parts.next()?.parse::<u64>().ok()?;
  let minor = parts.next().unwrap_or("0").parse::<u64>().ok()?;
  let patch = parts.next().unwrap_or("0").parse::<u64>().ok()?;
  Some((major, minor, patch))
}

#[cfg(any(target_os = "android", test))]
fn is_newer_version(remote: &str, current: &str) -> bool {
  match (parse_semver_triple(remote), parse_semver_triple(current)) {
    (Some(remote_v), Some(current_v)) => remote_v > current_v,
    _ => remote.trim() != current.trim(),
  }
}

#[cfg(test)]
mod tests {
  use super::{is_newer_version, parse_semver_triple};

  #[test]
  fn parses_semver_triples() {
    assert_eq!(parse_semver_triple("0.4.1"), Some((0, 4, 1)));
    assert_eq!(parse_semver_triple("v1.2"), Some((1, 2, 0)));
    assert_eq!(parse_semver_triple("2.0.0-beta"), Some((2, 0, 0)));
  }

  #[test]
  fn compares_versions() {
    assert!(is_newer_version("0.4.1", "0.4.0"));
    assert!(!is_newer_version("0.4.0", "0.4.0"));
    assert!(!is_newer_version("0.3.9", "0.4.0"));
  }
}
