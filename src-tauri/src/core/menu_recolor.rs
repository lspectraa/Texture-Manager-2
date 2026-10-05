//! Menu Recolor: discover sprites, tag them, apply a hue-band recipe, write changed PNGs.

use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use image::{imageops::FilterType, ImageFormat, RgbaImage};
use plist::Value;
use serde::{Deserialize, Serialize};

use crate::core::color::{apply_color_recipe, ColorRecipe};
use crate::core::contracts::{phase_defaults, MenuRecolorOptions, MenuRecolorRuleSet, SpriteOverride};
use crate::core::discovery::{discover_sheet_pairs, discover_unpaired_png_keys, SheetCandidate};
use crate::core::errors::AppError;
use crate::core::image_io::save_rgba_png_fast;
use crate::core::plist::normalize_plist_frames_to_format3;
use crate::core::report::{OperationProgress, OperationReport, ReportIssue, ReportLevel};
use crate::core::safe_fs::{ensure_user_absolute_path, parse_user_absolute_path, path_from_slashes};
use crate::core::splitter::split_sheet_candidate_memory;

const THUMB_MAX_EDGE: u32 = 72;
const THUMB_BATCH_LIMIT: usize = 64;

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MenuRecolorRecipeFile {
    pub rule_set_id: MenuRecolorRuleSet,
    pub recipe: ColorRecipe,
    #[serde(default)]
    pub overrides: BTreeMap<String, SpriteOverride>,
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
    if path_has_icons_segment(relative_path) {
        tags.push("icons".to_string());
    }
    if is_face_name(file_name) {
        tags.push("faces".to_string());
    }
    if is_geode_name(file_name) {
        tags.push("geode".to_string());
    }
    if is_font_name(file_name) {
        tags.push("font".to_string());
    }
    if let Some(stem) = sheet_stem.map(str::trim).filter(|stem| !stem.is_empty()) {
        tags.push(format!("sheet:{stem}"));
    }
    tags
}

pub fn rule_set_includes(tags: &[String], rule: MenuRecolorRuleSet) -> bool {
    let has = |name: &str| tags.iter().any(|tag| tag == name);
    match rule {
        MenuRecolorRuleSet::MenuChrome => !has("faces") && !has("icons"),
        MenuRecolorRuleSet::ExceptIcons => !has("icons"),
        MenuRecolorRuleSet::FacesOnly => has("faces"),
    }
}

pub fn effective_recolor(
    included: bool,
    global: &ColorRecipe,
    ov: &SpriteOverride,
) -> Option<(ColorRecipe, f32)> {
    match ov {
        SpriteOverride::Off => None,
        SpriteOverride::Inherit => {
            if included {
                Some((global.clone(), 1.0))
            } else {
                None
            }
        }
        SpriteOverride::Strength { amount } => {
            Some((global.clone(), amount.clamp(0.0, 1.0)))
        }
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

fn discover_sources(input_dir: &Path) -> Result<Vec<SpriteSource>, AppError> {
    let sheets = discover_sheet_pairs(input_dir)?;
    let mut paired_pngs = HashSet::new();
    for sheet in &sheets {
        paired_pngs.insert(sheet.png_path.clone());
    }
    let mut sources = Vec::new();
    for (index, sheet) in sheets.iter().enumerate() {
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
        let tags = tag_sprite(&relative, &name, None);
        sources.push(SpriteSource {
            sprite: DiscoveredSprite {
                id,
                name,
                relative_path: relative,
                tags,
                sheet_stem: None,
            },
            kind: SpriteKind::LoosePng { path: png.png_path },
        });
    }
    sources.sort_by(|left, right| left.sprite.id.cmp(&right.sprite.id));
    Ok(sources)
}

pub fn menu_recolor_thumbs(
    input_dir: &Path,
    sprite_ids: &[String],
) -> Result<Vec<MenuRecolorThumb>, AppError> {
    let wanted: HashSet<&str> = sprite_ids.iter().take(THUMB_BATCH_LIMIT).map(String::as_str).collect();
    if wanted.is_empty() {
        return Ok(Vec::new());
    }
    let sources = discover_sources(input_dir)?;
    let sheets = discover_sheet_pairs(input_dir)?;
    let mut decoded: BTreeMap<usize, BTreeMap<String, RgbaImage>> = BTreeMap::new();
    let mut thumbs = Vec::new();
    for source in &sources {
        if !wanted.contains(source.sprite.id.as_str()) {
            continue;
        }
        let image = match &source.kind {
            SpriteKind::LoosePng { path } => image::open(path)
                .map_err(|err| AppError::ParseError(format!("failed to open png: {err}")))?
                .to_rgba8(),
            SpriteKind::SheetFrame {
                candidate_index,
                frame_name,
            } => {
                if !decoded.contains_key(candidate_index) {
                    let sprites = load_sheet_sprites(&sheets[*candidate_index])?;
                    decoded.insert(*candidate_index, sprites);
                }
                let Some(frame) = decoded.get(candidate_index).and_then(|map| map.get(frame_name)) else {
                    continue;
                };
                frame.clone()
            }
        };
        let thumb = downscale_thumb(&image);
        thumbs.push(MenuRecolorThumb {
            id: source.sprite.id.clone(),
            data_url: rgba_to_data_url(&thumb)?,
        });
    }
    Ok(thumbs)
}

pub fn read_recipe_file(path: &Path) -> Result<MenuRecolorRecipeFile, AppError> {
    ensure_user_absolute_path(path)?;
    let text = fs::read_to_string(path)?;
    let mut file: MenuRecolorRecipeFile = serde_json::from_str(&text)
        .map_err(|err| AppError::ParseError(format!("menu recolor recipe: {err}")))?;
    file.recipe = file.recipe.normalized();
    for ov in file.overrides.values_mut() {
        normalize_override(ov);
    }
    Ok(file)
}

pub fn write_recipe_file(path: &Path, mut file: MenuRecolorRecipeFile) -> Result<(), AppError> {
    ensure_user_absolute_path(path)?;
    file.recipe = file.recipe.normalized();
    for ov in file.overrides.values_mut() {
        normalize_override(ov);
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    let text = serde_json::to_string_pretty(&file)
        .map_err(|err| AppError::ParseError(format!("menu recolor recipe: {err}")))?;
    fs::write(path, text)?;
    Ok(())
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

fn is_geode_name(file_name: &str) -> bool {
    file_name.to_ascii_lowercase().starts_with("geode.")
}

fn is_font_name(file_name: &str) -> bool {
    let squashed = file_stem(file_name)
        .to_ascii_lowercase()
        .replace(['_', '-'], "");
    squashed.contains("goldfont") || squashed.contains("bigfont") || squashed.contains("chatfont")
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

pub fn read_recipe_file_str(path: &str) -> Result<MenuRecolorRecipeFile, AppError> {
    let path = parse_user_absolute_path(path)?;
    read_recipe_file(&path)
}

pub fn write_recipe_file_str(path: &str, file: MenuRecolorRecipeFile) -> Result<(), AppError> {
    let path = parse_user_absolute_path(path)?;
    write_recipe_file(&path, file)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::color::{BandDelta, BandId, ColorRecipe};
    use crate::core::contracts::SpriteOverride;
    use crate::core::image_io::save_rgba_png_fast;
    use image::{Rgba, RgbaImage};
    use plist::{Dictionary, Value};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn tags_for(path: &str) -> Vec<String> {
        let name = path.rsplit(['/', '\\']).next().unwrap_or(path);
        tag_sprite(path, name, None)
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
    fn menu_chrome_does_not_exclude_font() {
        let tags = tags_for("goldFont_01.png");
        assert!(tags.iter().any(|tag| tag == "font"));
        assert!(rule_set_includes(&tags, MenuRecolorRuleSet::MenuChrome));
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
        .is_some());
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
        assert!(report.files_processed >= 2, "processed {}", report.files_processed);
        assert!(output.join("GJ_GameSheet03").join("GJ_button_01.png").is_file());
        assert!(output.join("chatFont_01.png").is_file());
        assert!(!output.join("diffIcon_05_btn_001-uhd.png").exists());
        assert!(!output.join("icons").join("player_01.png").exists());
        assert!(!output.join("whiteShine.png").exists());
        let _ = fs::remove_dir_all(&input);
        let _ = fs::remove_dir_all(&output);
    }
}
