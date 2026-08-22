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
  granted: bool,
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
    #[cfg(target_os = "android")]
    {
      let response: CheckAllFilesAccessResponse = self
        .handle
        .run_mobile_plugin("checkAllFilesAccess", ())
        .map_err(|err| err.to_string())?;
      return Ok(response.granted);
    }
    #[cfg(not(target_os = "android"))]
    {
      Ok(true)
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
