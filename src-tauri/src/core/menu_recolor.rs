//! Menu Recolor: discover sprites, tag them, apply a hue-band recipe, write changed PNGs.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Instant, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use image::{imageops::FilterType, ImageFormat, RgbaImage};
use plist::Value;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

use crate::core::color::{apply_color_recipe, ColorRecipe};
use crate::core::contracts::{phase_defaults, MenuRecolorOptions, MenuRecolorRuleSet, SpriteOverride};
use crate::core::discovery::{discover_sheet_pairs, discover_unpaired_png_keys, SheetCandidate};
use crate::core::errors::AppError;
use crate::core::game_files::{
    ensure_sheet_split_cached, find_current_sheet_for_input, GameFilesLayout,
};
use crate::core::image_io::save_rgba_png_fast;
use crate::core::plist::normalize_plist_frames_to_format3;
use crate::core::report::{OperationProgress, OperationReport, ReportIssue, ReportLevel};
use crate::core::safe_fs::path_from_slashes;
use crate::core::splitter::split_sheet_candidate_memory;

const THUMB_MAX_EDGE: u32 = 72;
const THUMB_BATCH_LIMIT: usize = 160;

/// Menu chrome gamesheets. High (`-uhd`) is preferred, then medium (`-hd`), then low.
const MENU_SHEET_BASES: &[&str] = &[
    "GJ_GameSheet03",
    "GJ_GameSheet04",
    "GJ_LaunchSheet",
    "GauntletSheet",
    "GJ_ShopSheet",
    "GJ_ShopSheet01",
    "GJ_ShopSheet02",
    "GJ_ShopSheet03",
];

const GEODE_LOADER_SHEET_BASES: &[&str] = &["BlankSheet", "APISheet", "LogoSheet"];

/// Loose vanilla PNGs menu packs recolor outside a gamesheet.
const MENU_LOOSE_PNG_BASES: &[&str] = &[
    "GJ_button_01",
    "GJ_button_02",
    "GJ_button_03",
    "GJ_button_04",
    "GJ_button_05",
    "GJ_button_06",
    "GJ_square01",
    "GJ_square02",
    "GJ_square03",
    "GJ_square04",
    "GJ_square05",
    "GJ_square06",
    "GJ_squareB_01",
    "GJ_gradientBG",
    "GJ_moveBtn",
    "GJ_moveSBtn",
    "GJ_progressBar_001",
    "bigFont",
    "chatFont",
    "goldFont",
    "edit_barBG_001",
    "square01_001",
    "sliderBar",
    "sliderBar2",
    "slidergroove",
    "slidergroove_02",
    "slidergroove2",
    "sliderthumb",
    "sliderthumbsel",
    "loadingCircle",
    "smallDot",
    "GE_button_01",
    "GE_button_02",
    "GE_button_03",
    "GE_button_04",
    "dragIcon",
    "tab-gradient-mask",
];

const DEFAULT_INPUT_DIR_NAME: &str = "menu-recolor-default";
const STAGE_MANIFEST_NAME: &str = "manifest.json";
const STAGE_MANIFEST_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MenuRecolorDefaultInput {
    pub input_dir: String,
    pub sheet_stem: String,
}

struct ThumbSession {
    input_dir: PathBuf,
    sources_by_id: HashMap<String, SpriteSource>,
    sheets: Vec<SheetCandidate>,
    decoded: BTreeMap<usize, Arc<BTreeMap<String, RgbaImage>>>,
}

fn thumb_session_lock() -> &'static Mutex<Option<ThumbSession>> {
    static LOCK: OnceLock<Mutex<Option<ThumbSession>>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(None))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredSprite {
    pub id: String,
    pub name: String,
    pub relative_path: String,
    pub tags: Vec<String>,
    pub sheet_stem: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MenuRecolorThumb {
    pub id: String,
    pub data_url: String,
}

#[derive(Debug, Clone)]
struct SpriteSource {
    sprite: DiscoveredSprite,
    kind: SpriteKind,
}

#[derive(Debug, Clone)]
enum SpriteKind {
    SheetFrame {
        candidate_index: usize,
        frame_name: String,
    },
    LoosePng {
        path: PathBuf,
    },
}

pub fn tag_sprite(relative_path: &str, file_name: &str, sheet_stem: Option<&str>) -> Vec<String> {
    let mut tags = Vec::new();
    let raw_stem = file_stem(file_name);
    let stem = raw_stem.to_ascii_lowercase();
    let flat = squashed(&stem);
    let sheet = sheet_base(sheet_stem);
    if sheet == "blanksheet" {
        tags.push("chrome".to_string());
        if let Some(stem) = sheet_stem.map(str::trim).filter(|stem| !stem.is_empty()) {
            tags.push(format!("sheet:{stem}"));
        }
        return tags;
    }
    if path_has_icons_segment(relative_path) || is_player_icon_name(&stem, &flat) {
        tags.push("icons".to_string());
    }
    if is_face_name(file_name) {
        tags.push("faces".to_string());
    }
    if is_font_name(file_name) {
        tags.push("font".to_string());
    }
    if is_effect_name(&flat) && !is_button_name(&stem) {
        tags.push("fx".to_string());
    }
    if is_symbol_name(raw_stem, &stem, &flat) {
        tags.push("symbols".to_string());
    }
    if is_editor_name(&stem, &flat) && !is_pause_menu_editor_button(&stem) {
        tags.push("editor".to_string());
    }
    if is_shop_name(&flat) || sheet.starts_with("gj_shopsheet") {
        tags.push("shop".to_string());
    }
    if (is_gauntlet_name(&flat) || sheet == "gauntletsheet") && !flat.contains("lostgauntletslabel") {
        tags.push("gauntlet".to_string());
    }
    if is_chrome_name(&stem, &flat) {
        tags.push("chrome".to_string());
    }
    if is_geode_source(&stem, &flat, &sheet) && !is_api_menu_chrome(&flat) {
        tags.push("geode".to_string());
    }
    if is_logo_name(&flat, &sheet) {
        tags.push("logos".to_string());
    }
    let tagged_elsewhere = tags.iter().any(|tag| {
        matches!(
            tag.as_str(),
            "chrome" | "symbols" | "faces" | "font" | "fx" | "editor" | "icons"
        )
    });
    if is_gameplay_sheet(&sheet) && !tagged_elsewhere {
        tags.push("objects".to_string());
    }
    if let Some(stem) = sheet_stem.map(str::trim).filter(|stem| !stem.is_empty()) {
        tags.push(format!("sheet:{stem}"));
    }
    tags
}

pub fn rule_set_includes(tags: &[String], rule: MenuRecolorRuleSet) -> bool {
    let has = |name: &str| tags.iter().any(|tag| tag == name);
    match rule {
        MenuRecolorRuleSet::MenuChrome => {
            has("chrome")
                && !has("symbols")
                && !has("faces")
                && !has("font")
                && !has("fx")
                && !has("editor")
                && !has("icons")
                && !has("objects")
                && !has("geode")
                && !has("shop")
                && !has("gauntlet")
                && !has("logos")
        }
        MenuRecolorRuleSet::Symbols => has("symbols") && !has("faces"),
        MenuRecolorRuleSet::FacesOnly => has("faces"),
        MenuRecolorRuleSet::Fonts => has("font"),
        MenuRecolorRuleSet::Editor => has("editor"),
        MenuRecolorRuleSet::Shop => has("shop"),
        MenuRecolorRuleSet::Gauntlets => has("gauntlet"),
        MenuRecolorRuleSet::Objects => has("objects"),
        MenuRecolorRuleSet::Effects => has("fx"),
        MenuRecolorRuleSet::Icons => has("icons"),
        MenuRecolorRuleSet::Geode => has("geode"),
        MenuRecolorRuleSet::Logos => has("logos"),
        MenuRecolorRuleSet::ExceptIcons => !has("icons"),
    }
}

pub fn effective_recolor(
    included: bool,
    global: &ColorRecipe,
    ov: &SpriteOverride,
) -> Option<(ColorRecipe, f32)> {
    if !included {
        return None;
    }
    match ov {
        SpriteOverride::Off => None,
        SpriteOverride::Inherit => Some((global.clone(), 1.0)),
        SpriteOverride::Strength { amount } => Some((global.clone(), amount.clamp(0.0, 1.0))),
        SpriteOverride::Custom { recipe } => Some((recipe.clone().normalized(), 1.0)),
    }
}

fn sprite_included(sprite: &DiscoveredSprite, options: &MenuRecolorOptions) -> bool {
    if let Some(bit) = options.includes.get(&sprite.id) {
        return *bit;
    }
    rule_set_includes(&sprite.tags, options.rule_set)
}

pub fn discover_menu_sprites(input_dir: &Path) -> Result<Vec<DiscoveredSprite>, AppError> {
    Ok(discover_sources(input_dir)?
        .into_iter()
        .map(|source| source.sprite)
        .collect())
}

fn preferred_tier_stems(base: &str) -> [String; 3] {
    [format!("{base}-uhd"), format!("{base}-hd"), base.to_string()]
}

fn resolve_first_sheet(
    layout: &GameFilesLayout,
    relative_dir: &Path,
    base: &str,
) -> Result<Option<SheetCandidate>, AppError> {
    for stem in preferred_tier_stems(base) {
        if let Some(pair) = find_current_sheet_for_input(layout, relative_dir, &stem)? {
            return Ok(Some(pair));
        }
    }
    Ok(None)
}

fn resolve_menu_sheets(layout: &GameFilesLayout) -> Result<Vec<SheetCandidate>, AppError> {
    let mut pairs = Vec::new();
    for base in MENU_SHEET_BASES {
        if let Some(pair) = resolve_first_sheet(layout, Path::new(""), base)? {
            pairs.push(pair);
        }
    }
    for base in GEODE_LOADER_SHEET_BASES {
        if let Some(pair) = resolve_first_sheet(layout, Path::new("geode.loader"), base)? {
            pairs.push(pair);
        }
    }
    Ok(pairs)
}

fn resolve_loose_png(layout: &GameFilesLayout, base: &str) -> Option<PathBuf> {
    for relative in [Path::new(""), Path::new("geode.loader")] {
        let dir = crate::core::game_files::resolve_current_source_dir(layout, relative);
        for stem in preferred_tier_stems(base) {
            let path = dir.join(format!("{stem}.png"));
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

fn link_or_copy(src: &Path, dest: &Path) -> Result<(), AppError> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    if fs::hard_link(src, dest).is_err() {
        fs::copy(src, dest)?;
    }
    Ok(())
}

fn mirror_dir_hardlink(src: &Path, dest: &Path) -> Result<(), AppError> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let target = dest.join(entry.file_name());
        if path.is_dir() {
            mirror_dir_hardlink(&path, &target)?;
        } else {
            link_or_copy(&path, &target)?;
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct DefaultStageManifest {
    version: u32,
    sheets: Vec<DefaultStageSheet>,
    loose: Vec<DefaultStageFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct DefaultStageSheet {
    stem: String,
    plist_len: u64,
    plist_modified_secs: u64,
    png_len: u64,
    png_modified_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct DefaultStageFile {
    name: String,
    len: u64,
    modified_secs: u64,
}

fn file_stamp(path: &Path) -> Result<(u64, u64), AppError> {
    let meta = fs::metadata(path)?;
    let modified = meta.modified().unwrap_or(UNIX_EPOCH);
    let secs = modified.duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    Ok((meta.len(), secs))
}

fn sheet_record(pair: &SheetCandidate) -> Result<DefaultStageSheet, AppError> {
    let (plist_len, plist_modified_secs) = file_stamp(&pair.plist_path)?;
    let (png_len, png_modified_secs) = file_stamp(&pair.png_path)?;
    Ok(DefaultStageSheet {
        stem: pair.stem.clone(),
        plist_len,
        plist_modified_secs,
        png_len,
        png_modified_secs,
    })
}

fn loose_record(path: &Path) -> Result<Option<DefaultStageFile>, AppError> {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return Ok(None);
    };
    let (len, modified_secs) = file_stamp(path)?;
    Ok(Some(DefaultStageFile {
        name: name.to_string(),
        len,
        modified_secs,
    }))
}

fn read_stage_manifest(stage: &Path) -> Option<DefaultStageManifest> {
    let text = fs::read_to_string(stage.join(STAGE_MANIFEST_NAME)).ok()?;
    serde_json::from_str(&text).ok()
}

fn stage_matches(
    stage: &Path,
    manifest: &DefaultStageManifest,
    sheets: &[DefaultStageSheet],
    loose: &[DefaultStageFile],
) -> bool {
    if manifest.version != STAGE_MANIFEST_VERSION || manifest.sheets != sheets || manifest.loose != loose {
        return false;
    }
    sheets.iter().all(|sheet| {
        stage
            .join(&sheet.stem)
            .join(format!("{}.plist", sheet.stem))
            .is_file()
    }) && loose.iter().all(|file| stage.join(&file.name).is_file())
}

fn write_stage_manifest(
    stage: &Path,
    sheets: Vec<DefaultStageSheet>,
    loose: Vec<DefaultStageFile>,
) -> Result<(), AppError> {
    let manifest = DefaultStageManifest {
        version: STAGE_MANIFEST_VERSION,
        sheets,
        loose,
    };
    let text = serde_json::to_string_pretty(&manifest)
        .map_err(|err| AppError::ParseError(format!("menu recolor cache: {err}")))?;
    fs::write(stage.join(STAGE_MANIFEST_NAME), text)?;
    Ok(())
}

fn clear_stale_stage_entries(
    stage: &Path,
    sheets: &[DefaultStageSheet],
    loose: &[DefaultStageFile],
) -> Result<(), AppError> {
    if !stage.is_dir() {
        return Ok(());
    }
    let keep_dirs: HashSet<&str> = sheets.iter().map(|sheet| sheet.stem.as_str()).collect();
    let keep_files: HashSet<&str> = loose.iter().map(|file| file.name.as_str()).collect();
    for entry in fs::read_dir(stage)? {
        let entry = entry?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name == STAGE_MANIFEST_NAME {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            if !keep_dirs.contains(name.as_ref()) {
                fs::remove_dir_all(path)?;
            }
        } else if !keep_files.contains(name.as_ref()) {
            fs::remove_file(path)?;
        }
    }
    Ok(())
}

fn ready_cached_stage(stage: &Path) -> Option<MenuRecolorDefaultInput> {
    let manifest = read_stage_manifest(stage)?;
    if manifest.version != STAGE_MANIFEST_VERSION {
        return None;
    }
    let sheets_ready = manifest.sheets.iter().all(|sheet| {
        stage
            .join(&sheet.stem)
            .join(format!("{}.plist", sheet.stem))
            .is_file()
    });
    let loose_ready = manifest.loose.iter().all(|file| stage.join(&file.name).is_file());
    if !sheets_ready || !loose_ready {
        return None;
    }
    let sheet_stem = manifest
        .sheets
        .iter()
        .map(|sheet| sheet.stem.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    Some(MenuRecolorDefaultInput {
        input_dir: stage.to_string_lossy().to_string(),
        sheet_stem,
    })
}

/// Split-cache the default menu gamesheets and standalone PNGs into one folder.
/// A later open reuses that folder when the vanilla files have not changed.
/// Custom input folders are not copied into this cache.
pub fn ensure_menu_recolor_default_input(
    layout: &GameFilesLayout,
) -> Result<Option<MenuRecolorDefaultInput>, AppError> {
    let stage = layout.current_split.join(DEFAULT_INPUT_DIR_NAME);
    if !layout.geometry_dash_found() {
        return Ok(ready_cached_stage(&stage));
    }
    let pairs = resolve_menu_sheets(layout)?;
    let loose_paths: Vec<PathBuf> = MENU_LOOSE_PNG_BASES
        .iter()
        .filter_map(|base| resolve_loose_png(layout, base))
        .collect();
    if pairs.is_empty() && loose_paths.is_empty() {
        return Ok(ready_cached_stage(&stage));
    }

    let mut sheets = Vec::with_capacity(pairs.len());
    for pair in &pairs {
        sheets.push(sheet_record(pair)?);
    }
    let mut loose = Vec::with_capacity(loose_paths.len());
    for png in &loose_paths {
        if let Some(record) = loose_record(png)? {
            loose.push(record);
        }
    }

    let sheet_stem = sheets
        .iter()
        .map(|sheet| sheet.stem.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    if let Some(existing) = read_stage_manifest(&stage) {
        if stage_matches(&stage, &existing, &sheets, &loose) {
            return Ok(Some(MenuRecolorDefaultInput {
                input_dir: stage.to_string_lossy().to_string(),
                sheet_stem,
            }));
        }
    }

    fs::create_dir_all(&stage)?;
    let previous = read_stage_manifest(&stage);
    let splitter_opts = phase_defaults().splitter;
    for pair in &pairs {
        let Some(record) = sheets.iter().find(|sheet| sheet.stem == pair.stem) else {
            continue;
        };
        let dest = stage.join(&pair.stem);
        let unchanged = previous.as_ref().is_some_and(|manifest| {
            manifest.sheets.iter().any(|sheet| sheet == record)
                && dest.join(format!("{}.plist", pair.stem)).is_file()
        });
        if unchanged {
            continue;
        }
        let split_dir = ensure_sheet_split_cached(layout, pair, &splitter_opts)?;
        if dest.exists() {
            fs::remove_dir_all(&dest)?;
        }
        mirror_dir_hardlink(&split_dir, &dest)?;
    }
    for png in &loose_paths {
        let Some(name) = png.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        let Some(record) = loose.iter().find(|file| file.name == name) else {
            continue;
        };
        let dest = stage.join(name);
        let unchanged = previous.as_ref().is_some_and(|manifest| {
            manifest.loose.iter().any(|file| file == record) && dest.is_file()
        });
        if unchanged {
            continue;
        }
        if dest.exists() {
            fs::remove_file(&dest)?;
        }
        link_or_copy(png, &dest)?;
    }
    clear_stale_stage_entries(&stage, &sheets, &loose)?;
    write_stage_manifest(&stage, sheets, loose)?;

    Ok(Some(MenuRecolorDefaultInput {
        input_dir: stage.to_string_lossy().to_string(),
        sheet_stem,
    }))
}

fn discover_sources(input_dir: &Path) -> Result<Vec<SpriteSource>, AppError> {
    let sheets = discover_sheet_pairs(input_dir)?;
    let mut paired_pngs = HashSet::new();
    for sheet in &sheets {
        paired_pngs.insert(sheet.png_path.clone());
    }
    let orphan_stems = orphan_plist_stems_by_dir(input_dir, &sheets)?;
    let mut sources = Vec::new();
    for (index, sheet) in sheets.iter().enumerate() {
        if is_exempt_gamesheet_stem(&sheet.stem) {
            continue;
        }
        let frame_names = frame_names_in_plist(&sheet.plist_path)?;
        for frame_name in frame_names {
            let name = file_name_only(&frame_name);
            let relative_path = sheet_frame_relative(sheet, &name);
            let id = format!("sheet:{relative_path}");
            let tags = tag_sprite(&sheet_relative_for_tags(sheet, &name), &name, Some(&sheet.stem));
            sources.push(SpriteSource {
                sprite: DiscoveredSprite {
                    id,
                    name,
                    relative_path,
                    tags,
                    sheet_stem: Some(sheet.stem.clone()),
                },
                kind: SpriteKind::SheetFrame {
                    candidate_index: index,
                    frame_name,
                },
            });
        }
    }
    let loose = discover_unpaired_png_keys(input_dir, &paired_pngs)?;
    for png in loose {
        let relative = loose_relative(input_dir, &png.png_path)?;
        let name = format!("{}.png", png.stem);
        let id = format!("png:{relative}");
        let parent = png
            .png_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_default();
        let sheet_stem = orphan_stems.get(&parent).cloned();
        if is_exempt_gamesheet_reference(sheet_stem.as_deref(), &relative, &name) {
            continue;
        }
        let tags = tag_sprite(&relative, &name, sheet_stem.as_deref());
        sources.push(SpriteSource {
            sprite: DiscoveredSprite {
                id,
                name,
                relative_path: relative,
                tags,
                sheet_stem,
            },
            kind: SpriteKind::LoosePng { path: png.png_path },
        });
    }
    sources.sort_by(|left, right| left.sprite.id.cmp(&right.sprite.id));
    Ok(sources)
}

/// Split-cache folders keep a plist without the atlas PNG. Attach that stem to loose frames.
fn orphan_plist_stems_by_dir(
    input_dir: &Path,
    sheets: &[SheetCandidate],
) -> Result<HashMap<PathBuf, String>, AppError> {
    let paired_plist: HashSet<PathBuf> = sheets.iter().map(|sheet| sheet.plist_path.clone()).collect();
    let mut stems = HashMap::new();
    let mut stack = vec![input_dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let is_plist = path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("plist"))
                .unwrap_or(false);
            if !is_plist || paired_plist.contains(&path) {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
                continue;
            };
            let Some(parent) = path.parent() else {
                continue;
            };
            stems
                .entry(parent.to_path_buf())
                .or_insert_with(|| stem.to_string());
        }
    }
    Ok(stems)
}

pub fn menu_recolor_thumbs(
    input_dir: &Path,
    sprite_ids: &[String],
) -> Result<Vec<MenuRecolorThumb>, AppError> {
    let ids: Vec<String> = sprite_ids.iter().take(THUMB_BATCH_LIMIT).cloned().collect();
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut guard = thumb_session_lock()
        .lock()
        .map_err(|_| AppError::InvalidOperation("menu recolor thumb cache lock poisoned"))?;
    if guard
        .as_ref()
        .map(|session| session.input_dir != input_dir)
        .unwrap_or(true)
    {
        let sources = discover_sources(input_dir)?;
        let sheets = discover_sheet_pairs(input_dir)?;
        let mut sources_by_id = HashMap::with_capacity(sources.len());
        for source in sources {
            sources_by_id.insert(source.sprite.id.clone(), source);
        }
        *guard = Some(ThumbSession {
            input_dir: input_dir.to_path_buf(),
            sources_by_id,
            sheets,
            decoded: BTreeMap::new(),
        });
    }
    let session = guard
        .as_mut()
        .ok_or_else(|| AppError::InvalidOperation("menu recolor thumb session missing"))?;

    let mut pending: Vec<(String, RgbaImage)> = Vec::new();
    for id in &ids {
        let Some(source) = session.sources_by_id.get(id) else {
            continue;
        };
        let image = match &source.kind {
            SpriteKind::LoosePng { path } => image::open(path)
                .map_err(|err| AppError::ParseError(format!("failed to open png: {err}")))?
                .to_rgba8(),
            SpriteKind::SheetFrame {
                candidate_index,
                frame_name,
            } => {
                if !session.decoded.contains_key(candidate_index) {
                    let sprites = load_sheet_sprites(&session.sheets[*candidate_index])?;
                    session
                        .decoded
                        .insert(*candidate_index, Arc::new(sprites));
                }
                let Some(frame) = session
                    .decoded
                    .get(candidate_index)
                    .and_then(|map| map.get(frame_name))
                else {
                    continue;
                };
                frame.clone()
            }
        };
        pending.push((id.clone(), downscale_thumb(&image)));
    }
    drop(guard);

    let thumbs: Result<Vec<MenuRecolorThumb>, AppError> = pending
        .into_par_iter()
        .map(|(id, thumb)| {
            Ok(MenuRecolorThumb {
                id,
                data_url: rgba_to_data_url(&thumb)?,
            })
        })
        .collect();
    thumbs
}

pub fn normalize_menu_recolor_options(mut options: MenuRecolorOptions) -> MenuRecolorOptions {
    options.recipe = options.recipe.normalized();
    for ov in options.overrides.values_mut() {
        normalize_override(ov);
    }
    options
}

fn normalize_override(ov: &mut SpriteOverride) {
    match ov {
        SpriteOverride::Strength { amount } => {
            *amount = if amount.is_finite() {
                amount.clamp(0.0, 1.0)
            } else {
                0.0
            };
        }
        SpriteOverride::Custom { recipe } => {
            *recipe = recipe.clone().normalized();
        }
        SpriteOverride::Inherit | SpriteOverride::Off => {}
    }
}

pub fn run_menu_recolor<F>(
    input_dir: &Path,
    output_dir: &Path,
    options: &MenuRecolorOptions,
    started_at: Instant,
    mut on_progress: F,
    cancel: Arc<AtomicBool>,
) -> Result<OperationReport, AppError>
where
    F: FnMut(OperationProgress),
{
    let options = normalize_menu_recolor_options(options.clone());
    let sources = discover_sources(input_dir)?;
    let sheets = discover_sheet_pairs(input_dir)?;
    let files_seen = sources.len();
    let mut files_processed = 0usize;
    let mut issues = Vec::new();
    let total = files_seen as u32;
    let mut completed = 0u32;
    let mut decoded: BTreeMap<usize, BTreeMap<String, RgbaImage>> = BTreeMap::new();

    for source in &sources {
        if cancel.load(Ordering::Relaxed) {
            return Err(AppError::Cancelled);
        }
        let label = source.sprite.sheet_stem.clone().unwrap_or_else(|| source.sprite.name.clone());
        on_progress(OperationProgress {
            gamesheet_name: label,
            sprites_completed: completed,
            sprites_total: total,
            plists_completed: 0,
            plists_total: 0,
        });
        let included = sprite_included(&source.sprite, &options);
        let ov = options
            .overrides
            .get(&source.sprite.id)
            .cloned()
            .unwrap_or(SpriteOverride::Inherit);
        if let Some((recipe, strength)) = effective_recolor(included, &options.recipe, &ov) {
            match load_sprite_image(source, &sheets, &mut decoded) {
                Ok(mut image) => {
                    let before = image.clone();
                    apply_color_recipe(&mut image, &recipe, strength);
                    if image.as_raw() != before.as_raw() {
                        match write_sprite(output_dir, &source.sprite, &image) {
                            Ok(()) => files_processed += 1,
                            Err(err) => issues.push(ReportIssue {
                                level: ReportLevel::Warning,
                                message: err.to_string(),
                                file: Some(source.sprite.relative_path.clone()),
                            }),
                        }
                    }
                }
                Err(err) => issues.push(ReportIssue {
                    level: ReportLevel::Warning,
                    message: err.to_string(),
                    file: Some(source.sprite.name.clone()),
                }),
            }
        }
        completed = completed.saturating_add(1);
    }

    on_progress(OperationProgress {
        gamesheet_name: String::new(),
        sprites_completed: completed,
        sprites_total: total,
        plists_completed: 0,
        plists_total: 0,
    });

    Ok(OperationReport {
        operation: "menuRecolor".to_string(),
        files_seen,
        files_processed,
        output_dir: output_dir.to_string_lossy().to_string(),
        elapsed_ms: started_at.elapsed().as_millis(),
        issues,
        ..Default::default()
    })
}

fn load_sprite_image(
    source: &SpriteSource,
    sheets: &[SheetCandidate],
    decoded: &mut BTreeMap<usize, BTreeMap<String, RgbaImage>>,
) -> Result<RgbaImage, AppError> {
    match &source.kind {
        SpriteKind::LoosePng { path } => image::open(path)
            .map(|img| img.to_rgba8())
            .map_err(|err| AppError::ParseError(format!("failed to open png: {err}"))),
        SpriteKind::SheetFrame {
            candidate_index,
            frame_name,
        } => {
            if !decoded.contains_key(candidate_index) {
                let sprites = load_sheet_sprites(&sheets[*candidate_index])?;
                decoded.insert(*candidate_index, sprites);
            }
            decoded
                .get(candidate_index)
                .and_then(|map| map.get(frame_name))
                .cloned()
                .ok_or_else(|| AppError::ParseError(format!("missing frame `{frame_name}`")))
        }
    }
}

fn load_sheet_sprites(candidate: &SheetCandidate) -> Result<BTreeMap<String, RgbaImage>, AppError> {
    let options = phase_defaults().splitter;
    let split = split_sheet_candidate_memory(candidate, &options, || {})?;
    Ok(split.sprites)
}

fn write_sprite(output_dir: &Path, sprite: &DiscoveredSprite, image: &RgbaImage) -> Result<(), AppError> {
    let relative = path_from_slashes(&sprite.relative_path)?;
    let path = output_dir.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    save_rgba_png_fast(&path, image)
}

fn frame_names_in_plist(path: &Path) -> Result<Vec<String>, AppError> {
    let mut root = Value::from_file(path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;
    normalize_plist_frames_to_format3(&mut root);
    let frames = root
        .as_dictionary()
        .and_then(|root| root.get("frames"))
        .and_then(Value::as_dictionary)
        .ok_or_else(|| AppError::ParseError("plist missing top-level `frames` dictionary".to_string()))?;
    let mut names: Vec<String> = frames.keys().cloned().collect();
    names.sort();
    Ok(names)
}

fn sheet_frame_relative(sheet: &SheetCandidate, file_name: &str) -> String {
    let mut parts: Vec<String> = Vec::new();
    for component in sheet.relative_dir.components() {
        if let std::path::Component::Normal(name) = component {
            parts.push(name.to_string_lossy().into_owned());
        }
    }
    parts.push(sheet.stem.clone());
    parts.push(file_name.to_string());
    parts.join("/")
}

fn sheet_relative_for_tags(sheet: &SheetCandidate, file_name: &str) -> String {
    sheet_frame_relative(sheet, file_name)
}

fn loose_relative(input_dir: &Path, path: &Path) -> Result<String, AppError> {
    let relative = path
        .strip_prefix(input_dir)
        .map_err(|_| AppError::InvalidOperation("failed to compute relative file path"))?;
    Ok(relative
        .components()
        .filter_map(|component| match component {
            std::path::Component::Normal(name) => Some(name.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/"))
}

fn file_name_only(frame_name: &str) -> String {
    frame_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(frame_name)
        .to_string()
}

fn file_stem(file_name: &str) -> &str {
    let base = file_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(file_name);
    base.rsplit_once('.').map(|(stem, _)| stem).unwrap_or(base)
}

fn path_has_icons_segment(relative_path: &str) -> bool {
    relative_path
        .replace('\\', "/")
        .split('/')
        .any(|segment| segment.eq_ignore_ascii_case("icons"))
}

fn is_face_name(file_name: &str) -> bool {
    let stem = file_stem(file_name).to_ascii_lowercase();
    let squashed = stem.replace(['_', '-'], "");
    const PREFIXES: &[&str] = &[
        "difficon",
        "difficulty",
        "demon",
        "easydemon",
        "mediumdemon",
        "harddemon",
        "insanedemon",
        "extremedemon",
        "autodemon",
    ];
    if PREFIXES.iter().any(|prefix| squashed.starts_with(prefix)) {
        return true;
    }
    // Nearby auto-difficulty stems (`auto.png`, `auto_01.png`).
    stem == "auto" || stem.starts_with("auto_") || stem.starts_with("auto-")
}

fn is_font_name(file_name: &str) -> bool {
    let flat = squashed(&file_stem(file_name).to_ascii_lowercase());
    flat.contains("goldfont") || flat.contains("bigfont") || flat.contains("chatfont")
}

fn squashed(stem: &str) -> String {
    stem.replace(['_', '-'], "")
}

fn sheet_base(sheet_stem: Option<&str>) -> String {
    let stem = sheet_stem.unwrap_or("").trim().to_ascii_lowercase();
    if let Some(base) = stem.strip_suffix("-uhd") {
        return base.to_string();
    }
    if let Some(base) = stem.strip_suffix("-hd") {
        return base.to_string();
    }
    stem
}

fn is_gameplay_sheet(base: &str) -> bool {
    base == "gj_gamesheet" || base == "gj_gamesheet02"
}

/// Unnumbered `GJ_GameSheet` and `GJ_GameSheet02`, any graphics tier.
fn is_exempt_gamesheet_stem(stem: &str) -> bool {
    matches!(
        sheet_base(Some(file_stem(stem))).as_str(),
        "gj_gamesheet" | "gj_gamesheet02"
    )
}

fn is_exempt_gamesheet_reference(sheet_stem: Option<&str>, relative: &str, file_name: &str) -> bool {
    if sheet_stem.is_some_and(is_exempt_gamesheet_stem) || is_exempt_gamesheet_stem(file_name) {
        return true;
    }
    relative
        .split(['/', '\\'])
        .any(is_exempt_gamesheet_stem)
}

fn is_button_name(stem: &str) -> bool {
    stem.contains("btn") || stem.contains("button")
}

fn is_effect_name(flat: &str) -> bool {
    flat.contains("portalshine")
        || flat.contains("explosion")
        || flat.contains("fireball")
        || flat.contains("watersplash")
        || flat.contains("playerdash")
        || flat.contains("spiderdash")
        || flat.contains("shineburst")
        || flat.contains("staranim")
        || flat.contains("waterfallanim")
        || (flat.contains("shine") && !flat.contains("star"))
}

fn name_tokens(stem: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut previous_lower = false;
    for ch in stem.chars() {
        let is_letter = ch.is_ascii_alphabetic();
        if is_letter && previous_lower && ch.is_ascii_uppercase() && !current.is_empty() {
            tokens.push(current.to_ascii_lowercase());
            current.clear();
        }
        if is_letter {
            current.push(ch);
            previous_lower = ch.is_ascii_lowercase();
        } else if !current.is_empty() {
            tokens.push(current.to_ascii_lowercase());
            current.clear();
            previous_lower = false;
        }
    }
    if !current.is_empty() {
        tokens.push(current.to_ascii_lowercase());
    }
    tokens
}

fn is_symbol_token(token: &str) -> bool {
    matches!(
        token,
        "star"
            | "stars"
            | "coin"
            | "coins"
            | "diamond"
            | "diamonds"
            | "moon"
            | "moons"
            | "key"
            | "lock"
            | "arrow"
            | "crown"
            | "badge"
            | "currency"
            | "skull"
            | "shard"
            | "heart"
            | "icon"
            | "icons"
            | "check"
    )
}

fn is_symbol_name(raw_stem: &str, stem: &str, flat: &str) -> bool {
    if is_button_name(stem)
        || is_face_name(stem)
        || is_effect_name(flat)
        || flat.contains("label")
        || is_menu_arrow(flat)
        || flat.starts_with("gjinfoicon")
        || is_api_menu_chrome(flat)
    {
        return false;
    }
    if name_tokens(raw_stem).iter().any(|token| is_symbol_token(token)) {
        return true;
    }
    flat.contains("discord")
        || flat.contains("facebook")
        || flat.contains("fbicon")
        || flat.contains("twitter")
        || flat.contains("twitch")
        || flat.contains("youtube")
        || flat.contains("yticon")
        || flat.contains("insta")
        || flat.contains("tiktok")
        || flat.starts_with("exmark")
        || flat == "uidot"
}

fn is_editor_name(stem: &str, flat: &str) -> bool {
    stem.starts_with("edit_")
        || flat.starts_with("lightsquare")
        || flat.starts_with("gridline")
        || flat.starts_with("baseeditor")
}

fn is_shop_name(flat: &str) -> bool {
    flat.contains("chest")
        || flat.contains("shopkeeper")
        || flat.contains("shopsign")
        || flat.contains("storedesk")
        || flat.contains("plush")
}

fn is_gauntlet_name(flat: &str) -> bool {
    flat.starts_with("island")
        || flat.contains("gauntletcorner")
        || flat.contains("gauntletlock")
        || flat.contains("lostgauntlet")
}

fn is_player_icon_name(stem: &str, flat: &str) -> bool {
    if is_button_name(stem) || is_effect_name(flat) {
        return false;
    }
    flat.starts_with("playerspecial")
        || flat.starts_with("playersquare")
        || stem.starts_with("player_")
        || stem.starts_with("ship_")
        || stem.starts_with("ball_")
        || stem.starts_with("bird_")
        || stem.starts_with("robot_")
        || stem.starts_with("spider_")
        || stem.starts_with("swing_")
        || stem.starts_with("jetpack_")
        || stem.starts_with("dart_")
}

fn is_api_menu_chrome(flat: &str) -> bool {
    flat.contains("modslist") || flat.starts_with("updates")
}

fn is_controller_button(stem: &str) -> bool {
    stem.starts_with("controllerbtn")
}

fn is_shard_title(flat: &str) -> bool {
    flat.contains("shard") && flat.contains("label")
}

fn is_menu_chrome_excluded(stem: &str, flat: &str) -> bool {
    is_controller_button(stem)
        || is_shard_title(flat)
        || flat.contains("advideobtn")
        || flat.contains("ncslibrarybtn")
        || flat.contains("paintbtn")
        || flat.contains("pausebtnclean")
        || flat.contains("folderbtn")
        || flat.contains("foldericon")
        || flat.contains("levelleaderboard")
        || flat.contains("checkpointbtn")
        || flat.contains("removecheckbtn")
        || flat.contains("adrope")
        || flat.contains("achievementglow")
        || flat.contains("nametxt")
}

fn is_menu_arrow(flat: &str) -> bool {
    flat.starts_with("gjarrow01") || flat.starts_with("gjarrow02") || flat.starts_with("gjarrow03")
}

fn is_pause_menu_editor_button(stem: &str) -> bool {
    stem.starts_with("edit_buildbtn")
        || stem.starts_with("edit_buildsbtn")
        || stem.starts_with("edit_deletebtn")
        || stem.starts_with("edit_deletesbtn")
        || stem.starts_with("edit_editbtn")
        || stem.starts_with("edit_editsbtn")
}

fn is_chrome_name(stem: &str, flat: &str) -> bool {
    if is_menu_chrome_excluded(stem, flat) {
        return false;
    }
    if is_api_menu_chrome(flat) {
        return true;
    }
    if is_button_name(stem) || is_menu_arrow(flat) || flat.starts_with("gjinfoicon") || flat.contains("gjlogo") {
        return true;
    }
    stem.contains("square")
        || stem.contains("slider")
        || stem.contains("gradient")
        || stem.contains("progress")
        || stem.contains("groove")
        || flat.contains("topbar")
        || flat.contains("sideart")
        || flat.contains("comment")
        || stem.contains("table_")
        || flat.contains("tabon")
        || flat.contains("taboff")
        || flat.starts_with("tabgradient")
        || flat.starts_with("basecircle")
        || flat.starts_with("basetab")
        || flat.starts_with("baseaccount")
        || flat.starts_with("basecross")
        || flat.starts_with("basecategory")
        || flat.starts_with("baseleaderboard")
        || flat.starts_with("baseiconselect")
        || flat.contains("label")
        || flat.contains("rope")
        || flat.contains("corner")
        || flat.contains("levelcomplete")
        || flat.contains("practicecomplete")
        || flat.contains("newbest")
        || flat.starts_with("gjselect")
        || flat.contains("loadingcircle")
        || flat.contains("smalldot")
}

fn is_geode_source(stem: &str, flat: &str, sheet: &str) -> bool {
    sheet == "apisheet"
        || sheet == "logosheet"
        || stem.starts_with("ge_")
        || stem.starts_with("geode.")
        || flat.starts_with("geode")
        || flat.starts_with("dragicon")
}

fn is_logo_name(flat: &str, sheet: &str) -> bool {
    if flat.contains("gjlogo") {
        return false;
    }
    sheet == "logosheet"
        || flat.contains("robtoplogo")
        || flat.contains("fmod")
        || flat.contains("cocos")
        || flat.contains("subzerologo")
        || flat.contains("worldlogo")
}

fn downscale_thumb(image: &RgbaImage) -> RgbaImage {
    let (w, h) = image.dimensions();
    let edge = w.max(h).max(1);
    if edge <= THUMB_MAX_EDGE {
        return image.clone();
    }
    let scale = THUMB_MAX_EDGE as f32 / edge as f32;
    let nw = ((w as f32) * scale).round().max(1.0) as u32;
    let nh = ((h as f32) * scale).round().max(1.0) as u32;
    image::imageops::resize(image, nw, nh, FilterType::Triangle)
}

fn rgba_to_data_url(image: &RgbaImage) -> Result<String, AppError> {
    let mut bytes = Vec::new();
    {
        let mut cursor = std::io::Cursor::new(&mut bytes);
        image::DynamicImage::ImageRgba8(image.clone())
            .write_to(&mut cursor, ImageFormat::Png)
            .map_err(|err| AppError::ParseError(format!("failed to encode thumb: {err}")))?;
    }
    Ok(format!("data:image/png;base64,{}", BASE64_STANDARD.encode(bytes)))
}

/// Progress callback stored behind a mutex at the executor boundary.
pub fn run_menu_recolor_shared<F>(
    input_dir: &Path,
    output_dir: &Path,
    options: &MenuRecolorOptions,
    started_at: Instant,
    on_progress: &Arc<Mutex<F>>,
    cancel: Arc<AtomicBool>,
) -> Result<OperationReport, AppError>
where
    F: FnMut(OperationProgress),
{
    run_menu_recolor(
        input_dir,
        output_dir,
        options,
        started_at,
        |progress| {
            if let Ok(mut callback) = on_progress.lock() {
                callback(progress);
            }
        },
        cancel,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::color::{BandDelta, BandId, ColorRecipe};
    use crate::core::discovery::SheetCandidate;
    use crate::core::contracts::SpriteOverride;
    use crate::core::image_io::save_rgba_png_fast;
    use image::{Rgba, RgbaImage};
    use plist::{Dictionary, Value};
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn tags_for(path: &str) -> Vec<String> {
        let name = path.rsplit(['/', '\\']).next().unwrap_or(path);
        tag_sprite(path, name, None)
    }

    #[test]
    fn default_menu_sheets_prefer_high_and_include_launch_and_gauntlet() {
        assert!(!MENU_SHEET_BASES.contains(&"GJ_GameSheet"));
        assert!(!MENU_SHEET_BASES.contains(&"GJ_GameSheet02"));
        assert!(MENU_SHEET_BASES.contains(&"GJ_GameSheet04"));
        assert!(MENU_SHEET_BASES.contains(&"GJ_LaunchSheet"));
        assert!(MENU_SHEET_BASES.contains(&"GauntletSheet"));
        assert!(MENU_LOOSE_PNG_BASES.contains(&"GJ_button_01"));
        assert!(MENU_LOOSE_PNG_BASES.contains(&"edit_barBG_001"));
        assert!(MENU_LOOSE_PNG_BASES.contains(&"GJ_squareB_01"));
        assert!(MENU_LOOSE_PNG_BASES.contains(&"loadingCircle"));
        assert!(MENU_LOOSE_PNG_BASES.contains(&"smallDot"));
        let stems = preferred_tier_stems("GJ_GameSheet03");
        assert_eq!(stems[0], "GJ_GameSheet03-uhd");
        assert_eq!(stems[1], "GJ_GameSheet03-hd");
        assert_eq!(stems[2], "GJ_GameSheet03");
        assert!(is_exempt_gamesheet_stem("GJ_GameSheet-uhd"));
        assert!(is_exempt_gamesheet_stem("GJ_GameSheet-hd"));
        assert!(is_exempt_gamesheet_stem("GJ_GameSheet"));
        assert!(is_exempt_gamesheet_stem("GJ_GameSheet02-uhd"));
        assert!(is_exempt_gamesheet_stem("GJ_GameSheet02"));
        assert!(!is_exempt_gamesheet_stem("GJ_GameSheet03"));
    }

    #[test]
    fn plain_gamesheet_frames_are_not_discovered() {
        let dir = temp_dir("plain_gamesheet");
        write_split_frame(&dir.join("GJ_GameSheet-uhd"), "GJ_GameSheet-uhd", "block001_01_001.png");
        write_split_frame(&dir.join("GJ_GameSheet03-uhd"), "GJ_GameSheet03-uhd", "GJ_button_01.png");
        let discovered = discover_menu_sprites(&dir).expect("discover");
        assert!(
            discovered.iter().all(|sprite| sprite.sheet_stem.as_deref() != Some("GJ_GameSheet-uhd")),
            "{:?}",
            discovered.iter().map(|sprite| sprite.name.clone()).collect::<Vec<_>>()
        );
        assert!(discovered.iter().any(|sprite| sprite.name == "GJ_button_01.png"));
        let _ = fs::remove_dir_all(&dir);
    }

    fn write_split_frame(dir: &Path, stem: &str, frame_name: &str) {
        fs::create_dir_all(dir).expect("sheet dir");
        let mut frame = Dictionary::new();
        frame.insert("textureRect".to_string(), Value::String("{{0,0},{2,2}}".to_string()));
        frame.insert("spriteSize".to_string(), Value::String("{2,2}".to_string()));
        frame.insert("spriteOffset".to_string(), Value::String("{0,0}".to_string()));
        frame.insert("textureRotated".to_string(), Value::Boolean(false));
        let mut frames = Dictionary::new();
        frames.insert(frame_name.to_string(), Value::Dictionary(frame));
        let mut metadata = Dictionary::new();
        metadata.insert("format".to_string(), Value::Integer(3.into()));
        let mut root = Dictionary::new();
        root.insert("frames".to_string(), Value::Dictionary(frames));
        root.insert("metadata".to_string(), Value::Dictionary(metadata));
        Value::Dictionary(root)
            .to_file_xml(dir.join(format!("{stem}.plist")))
            .expect("plist");
        save_png(&dir.join(frame_name), Rgba([255, 0, 0, 255]));
    }

    #[test]
    fn gj_button_01_png_included() {
        let tags = tags_for("GJ_button_01.png");
        assert!(rule_set_includes(&tags, MenuRecolorRuleSet::MenuChrome));
        assert!(!tags.iter().any(|tag| tag == "faces" || tag == "icons" || tag == "font"));
    }

    #[test]
    #[allow(non_snake_case)]
    fn diffIcon_05_btn_001_uhd_png_faces() {
        let tags = tags_for("diffIcon_05_btn_001-uhd.png");
        assert!(tags.iter().any(|tag| tag == "faces"), "{tags:?}");
        assert!(!rule_set_includes(&tags, MenuRecolorRuleSet::MenuChrome));
        assert!(rule_set_includes(&tags, MenuRecolorRuleSet::FacesOnly));
    }

    #[test]
    fn icons_player_01_png_icons() {
        let tags = tags_for("icons/player_01.png");
        assert!(tags.iter().any(|tag| tag == "icons"), "{tags:?}");
        assert!(!rule_set_includes(&tags, MenuRecolorRuleSet::MenuChrome));
        assert!(!rule_set_includes(&tags, MenuRecolorRuleSet::ExceptIcons));
        assert!(rule_set_includes(
            &tags_for("GJ_button_01.png"),
            MenuRecolorRuleSet::ExceptIcons
        ));
    }

    #[test]
    fn fonts_and_symbols_leave_menu_chrome() {
        let font = tags_for("goldFont_01.png");
        assert!(font.iter().any(|tag| tag == "font"));
        assert!(!rule_set_includes(&font, MenuRecolorRuleSet::MenuChrome));
        assert!(rule_set_includes(&font, MenuRecolorRuleSet::Fonts));

        let star = tags_for("GJ_starsIcon_001.png");
        assert!(star.iter().any(|tag| tag == "symbols"), "{star:?}");
        assert!(!rule_set_includes(&star, MenuRecolorRuleSet::MenuChrome));
        assert!(rule_set_includes(&star, MenuRecolorRuleSet::Symbols));

        let button = tags_for("GJ_playBtn_001.png");
        assert!(rule_set_includes(&button, MenuRecolorRuleSet::MenuChrome), "{button:?}");

        for name in [
            "dailyLevelLabel_001.png",
            "shopRope_001.png",
            "garageRope_001.png",
            "dailyLevelCorner_001.png",
            "GJ_levelComplete_001.png",
            "GJ_newBest_001.png",
            "GJ_select_001.png",
            "loadingCircle-uhd.png",
            "smallDot-hd.png",
            "GJ_squareB_01-uhd.png",
            "gj_explosionBtn_off_001.png",
            "GJ_pauseBtn_001.png",
        ] {
            let tags = tags_for(name);
            assert!(
                rule_set_includes(&tags, MenuRecolorRuleSet::MenuChrome),
                "{name} {tags:?}"
            );
        }
        for name in [
            "bonusShardLabel_001.png",
            "fireShardLabel_001.png",
            "shard0201ShardLabel_001.png",
            "label_shards_001.png",
            "GJ_nameTxt_001.png",
            "achievementGlow_001.png",
            "GJ_adVideoBtn_001.png",
            "GJ_ncsLibraryBtn_001.png",
            "GJ_paintBtn_001.png",
            "GJ_pauseBtn_clean_001.png",
            "gj_folderBtn_001.png",
            "folderIcon_001.png",
            "levelLeaderboard_friendsBtn_001.png",
            "levelLeaderboard_globalBtn_001.png",
            "levelLeaderboard_globalWeeklyBtn_001.png",
            "levelLeaderboard_localBtn_001.png",
            "GJ_checkpointBtn_001.png",
            "GJ_removeCheckBtn_001.png",
            "adRope_001.png",
        ] {
            let tags = tags_for(name);
            assert!(
                !rule_set_includes(&tags, MenuRecolorRuleSet::MenuChrome),
                "{name} {tags:?}"
            );
        }
        let rope = tags_for("shopRope_001.png");
        assert!(!rope.iter().any(|tag| tag == "shop"), "{rope:?}");
        let shard_label = tags_for("bonusShardLabel_001.png");
        assert!(!shard_label.iter().any(|tag| tag == "symbols"), "{shard_label:?}");
        assert!(!shard_label.iter().any(|tag| tag == "chrome"), "{shard_label:?}");
        let gauntlet_corner = tags_for("gauntletCorner_001.png");
        assert!(!rule_set_includes(&gauntlet_corner, MenuRecolorRuleSet::MenuChrome));
        assert!(rule_set_includes(&gauntlet_corner, MenuRecolorRuleSet::Gauntlets));

        for name in ["GJ_arrow_01_001.png", "GJ_arrow_03_001.png", "GJ_infoIcon_001.png", "edit_buildBtn_001.png", "edit_editSBtn_001.png"] {
            let tags = tags_for(name);
            assert!(rule_set_includes(&tags, MenuRecolorRuleSet::MenuChrome), "{name} {tags:?}");
        }
        let achievement_button = tag_sprite(
            "GJ_GameSheet03-uhd/GJ_achBtn_001.png",
            "GJ_achBtn_001.png",
            Some("GJ_GameSheet03-uhd"),
        );
        assert!(
            rule_set_includes(&achievement_button, MenuRecolorRuleSet::MenuChrome),
            "{achievement_button:?}"
        );
        let editor_tool = tags_for("edit_delBtn_001.png");
        assert!(!rule_set_includes(&editor_tool, MenuRecolorRuleSet::MenuChrome));
        assert!(rule_set_includes(&editor_tool, MenuRecolorRuleSet::Editor));
        let controller = tags_for("controllerBtn_A_001.png");
        assert!(!rule_set_includes(&controller, MenuRecolorRuleSet::MenuChrome), "{controller:?}");
        let wordmark = tag_sprite("GJ_logo_001.png", "GJ_logo_001.png", Some("GJ_LaunchSheet-uhd"));
        assert!(rule_set_includes(&wordmark, MenuRecolorRuleSet::MenuChrome), "{wordmark:?}");
        assert!(!wordmark.iter().any(|tag| tag == "logos"));
        let robtop = tag_sprite("RobTopLogoBig_001.png", "RobTopLogoBig_001.png", Some("GJ_LaunchSheet-uhd"));
        assert!(rule_set_includes(&robtop, MenuRecolorRuleSet::Logos));
        assert!(!rule_set_includes(&robtop, MenuRecolorRuleSet::MenuChrome));
        let lost = tag_sprite(
            "theLostGauntletsLabel_001.png",
            "theLostGauntletsLabel_001.png",
            Some("GauntletSheet-uhd"),
        );
        assert!(rule_set_includes(&lost, MenuRecolorRuleSet::MenuChrome), "{lost:?}");
        assert!(!lost.iter().any(|tag| tag == "gauntlet"));
        let blank = tag_sprite("baseCircle_Big_Blue.png", "baseCircle_Big_Blue.png", Some("BlankSheet-uhd"));
        assert!(rule_set_includes(&blank, MenuRecolorRuleSet::MenuChrome), "{blank:?}");
        assert!(!blank.iter().any(|tag| tag == "geode"));
        for name in [
            "mods-list-top.png",
            "mods-list-side-gd.png",
            "mods-list-bottom-sapphire.png",
            "updates-available.png",
            "updates-deprecated.png",
            "updates-installed.png",
        ] {
            let tags = tag_sprite(name, name, Some("APISheet-uhd"));
            assert!(rule_set_includes(&tags, MenuRecolorRuleSet::MenuChrome), "{name} {tags:?}");
            assert!(!tags.iter().any(|tag| tag == "geode"), "{name} {tags:?}");
        }
        let api_icon = tag_sprite("github.png", "github.png", Some("APISheet-uhd"));
        assert!(!rule_set_includes(&api_icon, MenuRecolorRuleSet::MenuChrome), "{api_icon:?}");
        assert!(api_icon.iter().any(|tag| tag == "geode"), "{api_icon:?}");

        let block = tag_sprite("block001_01_001.png", "block001_01_001.png", Some("GJ_GameSheet-uhd"));
        assert!(block.iter().any(|tag| tag == "objects"), "{block:?}");
        assert!(!rule_set_includes(&block, MenuRecolorRuleSet::MenuChrome));
        assert!(rule_set_includes(&block, MenuRecolorRuleSet::Objects));
    }

    #[test]
    fn inherit_skips_rule_excluded_and_off_always_skips() {
        let global = ColorRecipe::identity();
        assert!(effective_recolor(false, &global, &SpriteOverride::Inherit).is_none());
        assert!(effective_recolor(true, &global, &SpriteOverride::Off).is_none());
        assert!(effective_recolor(true, &global, &SpriteOverride::Inherit).is_some());
        let custom = ColorRecipe::identity();
        assert!(effective_recolor(
            false,
            &global,
            &SpriteOverride::Custom { recipe: custom }
        )
        .is_none());
        assert!(effective_recolor(
            false,
            &global,
            &SpriteOverride::Strength { amount: 1.0 }
        )
        .is_none());
    }

    #[test]
    fn strength_scales_global_recipe() {
        let global = ColorRecipe::identity();
        let (_recipe, strength) = effective_recolor(
            true,
            &global,
            &SpriteOverride::Strength { amount: 0.25 },
        )
        .expect("strength");
        assert!((strength - 0.25).abs() < 1e-6);
    }

    #[test]
    fn cached_default_stage_matches_until_the_source_changes() {
        let dir = temp_dir("stage_cache");
        let source = dir.join("source");
        fs::create_dir_all(&source).expect("source");
        let plist = source.join("GJ_GameSheet03-uhd.plist");
        let png = source.join("GJ_GameSheet03-uhd.png");
        fs::write(&plist, b"plist").expect("plist");
        fs::write(&png, b"png").expect("png");
        let pair = SheetCandidate {
            stem: "GJ_GameSheet03-uhd".to_string(),
            relative_dir: PathBuf::new(),
            plist_path: plist,
            png_path: png.clone(),
        };
        let sheet = sheet_record(&pair).expect("sheet");
        let loose_path = source.join("GJ_button_01-uhd.png");
        fs::write(&loose_path, b"btn").expect("loose");
        let loose = loose_record(&loose_path).expect("loose record").expect("name");
        let stage = dir.join("stage");
        fs::create_dir_all(stage.join(&sheet.stem)).expect("sheet dir");
        fs::write(
            stage.join(&sheet.stem).join(format!("{}.plist", sheet.stem)),
            b"cached",
        )
        .expect("cached plist");
        fs::write(stage.join(&loose.name), b"btn").expect("cached loose");
        write_stage_manifest(&stage, vec![sheet.clone()], vec![loose.clone()]).expect("manifest");
        let manifest = read_stage_manifest(&stage).expect("read manifest");
        assert!(stage_matches(&stage, &manifest, &[sheet.clone()], &[loose.clone()]));
        fs::write(&png, b"png-changed").expect("change");
        let changed = sheet_record(&pair).expect("changed");
        assert!(!stage_matches(&stage, &manifest, &[changed], &[loose]));
        let _ = fs::remove_dir_all(&dir);
    }

    fn temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("tm_menu_recolor_{label}_{nanos}"));
        fs::create_dir_all(&dir).expect("temp");
        dir
    }

    fn save_png(path: &Path, rgba: Rgba<u8>) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("parent");
        }
        save_rgba_png_fast(path, &RgbaImage::from_pixel(2, 2, rgba)).expect("png");
    }

    fn write_button_sheet(dir: &Path) {
        save_png(&dir.join("GJ_GameSheet03.png"), Rgba([255, 0, 0, 255]));
        let mut frame = Dictionary::new();
        frame.insert(
            "textureRect".to_string(),
            Value::String("{{0,0},{2,2}}".to_string()),
        );
        frame.insert("spriteSize".to_string(), Value::String("{2,2}".to_string()));
        frame.insert("spriteOffset".to_string(), Value::String("{0,0}".to_string()));
        frame.insert("textureRotated".to_string(), Value::Boolean(false));
        let mut frames = Dictionary::new();
        frames.insert("GJ_button_01.png".to_string(), Value::Dictionary(frame));
        let mut metadata = Dictionary::new();
        metadata.insert("format".to_string(), Value::Integer(3.into()));
        let mut root = Dictionary::new();
        root.insert("frames".to_string(), Value::Dictionary(frames));
        root.insert("metadata".to_string(), Value::Dictionary(metadata));
        Value::Dictionary(root)
            .to_file_xml(dir.join("GJ_GameSheet03.plist"))
            .expect("plist");
    }

    #[test]
    fn orphan_plist_tags_split_cache_frames_with_sheet_stem() {
        let dir = temp_dir("split");
        let mut frame = Dictionary::new();
        frame.insert(
            "textureRect".to_string(),
            Value::String("{{0,0},{2,2}}".to_string()),
        );
        frame.insert("spriteSize".to_string(), Value::String("{2,2}".to_string()));
        frame.insert("spriteOffset".to_string(), Value::String("{0,0}".to_string()));
        frame.insert("textureRotated".to_string(), Value::Boolean(false));
        let mut frames = Dictionary::new();
        frames.insert("GJ_button_01.png".to_string(), Value::Dictionary(frame));
        let mut metadata = Dictionary::new();
        metadata.insert("format".to_string(), Value::Integer(3.into()));
        let mut root = Dictionary::new();
        root.insert("frames".to_string(), Value::Dictionary(frames));
        root.insert("metadata".to_string(), Value::Dictionary(metadata));
        Value::Dictionary(root)
            .to_file_xml(dir.join("GJ_GameSheet03-uhd.plist"))
            .expect("plist");
        save_png(&dir.join("GJ_button_01.png"), Rgba([255, 0, 0, 255]));

        let discovered = discover_menu_sprites(&dir).expect("discover");
        let button = discovered
            .iter()
            .find(|sprite| sprite.name == "GJ_button_01.png")
            .expect("button");
        assert_eq!(button.sheet_stem.as_deref(), Some("GJ_GameSheet03-uhd"));
        assert!(button.tags.iter().any(|tag| tag == "sheet:GJ_GameSheet03-uhd"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn batch_writes_only_included_sprites_that_change() {
        let input = temp_dir("in");
        let output = temp_dir("out");
        write_button_sheet(&input);
        save_png(
            &input.join("icons").join("player_01.png"),
            Rgba([255, 0, 0, 255]),
        );
        save_png(
            &input.join("diffIcon_05_btn_001-uhd.png"),
            Rgba([255, 0, 0, 255]),
        );
        save_png(&input.join("chatFont_01.png"), Rgba([0, 0, 255, 255]));
        save_png(&input.join("whiteShine.png"), Rgba([240, 240, 240, 255]));

        let discovered = discover_menu_sprites(&input).expect("discover");
        assert!(discovered.iter().any(|sprite| sprite.name == "GJ_button_01.png"));
        assert!(discovered
            .iter()
            .any(|sprite| sprite.name == "diffIcon_05_btn_001-uhd.png" && sprite.tags.iter().any(|t| t == "faces")));
        assert!(discovered
            .iter()
            .any(|sprite| sprite.relative_path.ends_with("icons/player_01.png")
                && sprite.tags.iter().any(|t| t == "icons")));

        let mut recipe = ColorRecipe::identity();
        for band in [
            BandId::Red,
            BandId::Orange,
            BandId::Yellow,
            BandId::Green,
            BandId::Aqua,
            BandId::Blue,
            BandId::Purple,
            BandId::Magenta,
        ] {
            recipe.bands.insert(
                band,
                BandDelta {
                    hue_deg: 90.0,
                    sat_delta: 0.0,
                    val_delta: 0.0,
                    radius_deg: 0.0,
                    radius_low_deg: 0.0,
                    radius_high_deg: 0.0,
                },
            );
        }
        let options = MenuRecolorOptions {
            rule_set: MenuRecolorRuleSet::MenuChrome,
            recipe,
            overrides: BTreeMap::new(),
            includes: BTreeMap::new(),
        };
        let report = run_menu_recolor(
            &input,
            &output,
            &options,
            Instant::now(),
            |_| {},
            Arc::new(AtomicBool::new(false)),
        )
        .expect("run");
        assert_eq!(report.files_processed, 1, "processed {}", report.files_processed);
        assert!(output.join("GJ_GameSheet03").join("GJ_button_01.png").is_file());
        assert!(!output.join("chatFont_01.png").exists());
        assert!(!output.join("diffIcon_05_btn_001-uhd.png").exists());
        assert!(!output.join("icons").join("player_01.png").exists());
        assert!(!output.join("whiteShine.png").exists());
        let _ = fs::remove_dir_all(&input);
        let _ = fs::remove_dir_all(&output);
    }

    #[test]
    fn cached_stage_loads_when_geometry_dash_is_not_detected() {
        let dir = temp_dir("cached_without_gd");
        let stage = dir.join("split-cache").join(DEFAULT_INPUT_DIR_NAME);
        let sheet_dir = stage.join("GJ_GameSheet-uhd");
        fs::create_dir_all(&sheet_dir).expect("sheet dir");
        fs::write(sheet_dir.join("GJ_GameSheet-uhd.plist"), b"plist").expect("plist");
        fs::write(stage.join("GJ_button_01-uhd.png"), b"png").expect("loose");
        let sheet = DefaultStageSheet {
            stem: "GJ_GameSheet-uhd".to_string(),
            plist_len: 1,
            plist_modified_secs: 1,
            png_len: 1,
            png_modified_secs: 1,
        };
        let loose = DefaultStageFile {
            name: "GJ_button_01-uhd.png".to_string(),
            len: 1,
            modified_secs: 1,
        };
        write_stage_manifest(&stage, vec![sheet], vec![loose]).expect("manifest");
        let layout = GameFilesLayout {
            root: dir.clone(),
            geometry_dash_dir: dir.join("missing-gd"),
            resources: dir.join("Resources"),
            geode_resources: dir.join("geode").join("resources"),
            geode_unzipped: dir.join("geode").join("unzipped"),
            current_split: dir.join("split-cache"),
            legacy: dir.join("legacy"),
        };
        let resolved = ensure_menu_recolor_default_input(&layout)
            .expect("resolve")
            .expect("cached stage");
        assert_eq!(resolved.input_dir, stage.to_string_lossy());
        assert!(resolved.sheet_stem.contains("GJ_GameSheet-uhd"));
        let _ = fs::remove_dir_all(&dir);
    }
}
