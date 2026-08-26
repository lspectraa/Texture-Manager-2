//! Android all-files access + SAF folder/file pickers.

use serde::Deserialize;
use tauri::{
  plugin::{Builder as PluginBuilder, TauriPlugin},
  Manager, Runtime,
};

#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;

#[cfg(target_os = "android")]
const ANDROID_PLUGIN_PACKAGE: &str = "com.spectra.texturemanager2";
#[cfg(target_os = "android")]
const ANDROID_PLUGIN_CLASS: &str = "StorageAccessPlugin";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckAllFilesAccessResponse {
  #[serde(default)]
  all_files_granted: bool,
  #[serde(default)]
  geode_readable: bool,
  #[serde(default)]
  geode_path: Option<String>,
  /// Legacy key from older Kotlin plugin builds (`{ "granted": bool }`).
  #[serde(default)]
  granted: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidStorageStatus {
  pub all_files_granted: bool,
  pub geode_readable: bool,
  pub geode_path: Option<String>,
}

impl AndroidStorageStatus {
  pub fn ready(&self) -> bool {
    self.all_files_granted && self.geode_readable
  }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PickPathResponse {
  path: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PickFolderRequest {
  import_to_sandbox: bool,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PickFileRequest {
  extensions: Option<Vec<String>>,
}

pub struct AndroidStorageAccess<R: Runtime> {
  #[cfg(target_os = "android")]
  handle: PluginHandle<R>,
  #[cfg(not(target_os = "android"))]
  _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> AndroidStorageAccess<R> {
  pub fn check_all_files_access(&self) -> Result<bool, String> {
    Ok(self.get_storage_status()?.all_files_granted)
  }

  pub fn get_storage_status(&self) -> Result<AndroidStorageStatus, String> {
    #[cfg(target_os = "android")]
    {
      let response: CheckAllFilesAccessResponse = self
        .handle
        .run_mobile_plugin("checkAllFilesAccess", ())
        .map_err(|err| err.to_string())?;
      // Prefer the camelCase contract; fall back to legacy `granted`.
      let all_files_granted = response.all_files_granted || response.granted;

      let mut geode_readable = response.geode_readable;
      let mut geode_path = response
        .geode_path
        .filter(|path| !path.trim().is_empty());

      // If the plugin only reported permission, finish the probe in Rust so
      // Pixel / Samsung share the same Geode path logic as settings redetect.
      if all_files_granted && (!geode_readable || geode_path.is_none()) {
        if let Some(game) = crate::core::game_files::detect_android_geometry_dash_dir() {
          geode_path = Some(game.to_string_lossy().to_string());
          geode_readable = crate::core::game_files::android_geode_storage_readable(&game);
        } else if !geode_readable {
          geode_readable = false;
        }
      }

      return Ok(AndroidStorageStatus {
        all_files_granted,
        geode_readable,
        geode_path,
      });
    }
    #[cfg(not(target_os = "android"))]
    {
      Ok(AndroidStorageStatus {
        all_files_granted: true,
        geode_readable: true,
        geode_path: None,
      })
    }
  }

  pub fn request_all_files_access(&self) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
      // Explicit `()` Ok-type avoids never-type fallback under rustc 2024 lints on Android.
      let _: () = self
        .handle
        .run_mobile_plugin("requestAllFilesAccess", ())
        .map_err(|err| err.to_string())?;
      return Ok(());
    }
    #[cfg(not(target_os = "android"))]
    {
      Ok(())
    }
  }

  pub fn pick_folder(&self, import_to_sandbox: bool) -> Result<Option<String>, String> {
    #[cfg(target_os = "android")]
    {
      let response: PickPathResponse = self
        .handle
        .run_mobile_plugin(
          "pickFolder",
          PickFolderRequest {
            import_to_sandbox,
          },
        )
        .map_err(|err| err.to_string())?;
      return Ok(response.path.filter(|path| !path.trim().is_empty()));
    }
    #[cfg(not(target_os = "android"))]
    {
      let _ = import_to_sandbox;
      Err("Android folder picker is only available on Android.".to_string())
    }
  }

  pub fn pick_file(&self, extensions: Option<Vec<String>>) -> Result<Option<String>, String> {
    #[cfg(target_os = "android")]
    {
      let response: PickPathResponse = self
        .handle
        .run_mobile_plugin("pickFile", PickFileRequest { extensions })
        .map_err(|err| err.to_string())?;
      return Ok(response.path.filter(|path| !path.trim().is_empty()));
    }
    #[cfg(not(target_os = "android"))]
    {
      let _ = extensions;
      Err("Android file picker is only available on Android.".to_string())
    }
  }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  PluginBuilder::new("android-storage")
    .setup(|app, api| {
      #[cfg(target_os = "android")]
      {
        let handle = api.register_android_plugin(ANDROID_PLUGIN_PACKAGE, ANDROID_PLUGIN_CLASS)?;
        app.manage(AndroidStorageAccess::<R> { handle });
      }
      #[cfg(not(target_os = "android"))]
      {
        let _ = api;
        app.manage(AndroidStorageAccess::<R> {
          _marker: std::marker::PhantomData,
        });
      }
      Ok(())
    })
    .build()
}
