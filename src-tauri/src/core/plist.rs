use std::path::Path;

use plist::{Dictionary, Value};

use crate::core::errors::AppError;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PointF32 {
    pub x: f32,
    pub y: f32,
}

pub fn parse_pair(input: &str) -> Result<PointF32, AppError> {
    let trimmed = input.trim().trim_start_matches('{').trim_end_matches('}');
    let mut parts = trimmed.split(',');

    let x_raw = parts
        .next()
        .ok_or_else(|| AppError::ParseError(format!("missing x value in '{input}'")))?;
    let y_raw = parts
        .next()
        .ok_or_else(|| AppError::ParseError(format!("missing y value in '{input}'")))?;

    if parts.next().is_some() {
        return Err(AppError::ParseError(format!(
            "too many values in pair '{input}'"
        )));
    }

    let x = x_raw
        .trim()
        .parse::<f32>()
        .map_err(|_| AppError::ParseError(format!("invalid x value '{x_raw}'")))?;
    let y = y_raw
        .trim()
        .parse::<f32>()
        .map_err(|_| AppError::ParseError(format!("invalid y value '{y_raw}'")))?;

    Ok(PointF32 { x, y })
}

pub fn format_pair(value: PointF32) -> String {
    format!("{{{:.3},{:.3}}}", value.x, value.y)
}

pub fn scale_pair_floor(value: PointF32, divisor: f32) -> Result<PointF32, AppError> {
    if divisor <= 0.0 {
        return Err(AppError::InvalidOperation("divisor must be greater than 0"));
    }

    Ok(PointF32 {
        x: (value.x / divisor).floor(),
        y: (value.y / divisor).floor(),
    })
}

/// Returns the number of entries in the plist's top-level `frames` dictionary.
pub fn count_frames_in_plist(plist_path: &Path) -> Result<usize, AppError> {
    let root = Value::from_file(plist_path)
        .map_err(|err| AppError::ParseError(format!("failed to parse plist: {err}")))?;
    let dict = root
        .as_dictionary()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let frames = dict
        .get("frames")
        .and_then(Value::as_dictionary)
        .ok_or_else(|| {
            AppError::ParseError("plist missing top-level `frames` dictionary".to_string())
        })?;
    Ok(frames.len())
}

pub fn scale_pair_ceil(value: PointF32, divisor: f32) -> Result<PointF32, AppError> {
    if divisor <= 0.0 {
        return Err(AppError::InvalidOperation("divisor must be greater than 0"));
    }

    Ok(PointF32 {
        x: (value.x / divisor).ceil(),
        y: (value.y / divisor).ceil(),
    })
}

fn parse_numbers(input: &str) -> Result<Vec<f32>, AppError> {
    if input.trim().is_empty() {
        return Err(AppError::ParseError(format!(
            "empty numeric value '{input}'"
        )));
    }

    let mut cleaned = String::with_capacity(input.len());
    for ch in input.chars() {
        if matches!(ch, '{' | '}') {
            continue;
        }
        cleaned.push(ch);
    }
    if cleaned.trim().is_empty() {
        return Err(AppError::ParseError(format!(
            "empty numeric value '{input}'"
        )));
    }

    let mut numbers: Vec<f32> = Vec::new();
    for part in cleaned.split(',') {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        let parsed = trimmed.parse::<f32>().map_err(|_| {
            AppError::ParseError(format!("invalid numeric value `{trimmed}` in '{input}'"))
        })?;
        numbers.push(parsed);
    }
    if numbers.is_empty() {
        return Err(AppError::ParseError(format!(
            "empty numeric value '{input}'"
        )));
    }
    Ok(numbers)
}

fn optional_string_pair_ok(dict: &Dictionary, key: &str) -> bool {
    match dict.get(key) {
        None => true,
        Some(Value::String(raw)) => parse_pair(raw).is_ok(),
        Some(_) => false,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlistSpriteFormat {
    Format2,
    Format3,
}

fn metadata_format_integer(root: &Value) -> Option<i64> {
    match root
        .as_dictionary()
        .and_then(|dict| dict.get("metadata"))
        .and_then(Value::as_dictionary)
        .and_then(|metadata| metadata.get("format"))
    {
        Some(Value::Integer(value)) => value.as_signed(),
        _ => None,
    }
}

fn first_frame_dict(root: &Value) -> Option<&Dictionary> {
    let frames = root
        .as_dictionary()
        .and_then(|dict| dict.get("frames"))
        .and_then(Value::as_dictionary)?;
    frames.values().find_map(Value::as_dictionary)
}

pub fn detect_plist_sprite_format(root: &Value) -> PlistSpriteFormat {
    match metadata_format_integer(root) {
        Some(2) => return PlistSpriteFormat::Format2,
        Some(3) => return PlistSpriteFormat::Format3,
        _ => {}
    }
    let Some(frame) = first_frame_dict(root) else {
        return PlistSpriteFormat::Format3;
    };
    if frame.contains_key("frame") && !frame.contains_key("textureRect") {
        PlistSpriteFormat::Format2
    } else {
        PlistSpriteFormat::Format3
    }
}

fn ensure_metadata_format(root: &mut Value, format: i64) {
    let Some(dict) = root.as_dictionary_mut() else {
        return;
    };
    if !dict.contains_key("metadata") {
        dict.insert("metadata".to_string(), Value::Dictionary(Dictionary::new()));
    }
    let Some(metadata) = dict.get_mut("metadata").and_then(Value::as_dictionary_mut) else {
        return;
    };
    metadata.insert("format".to_string(), Value::Integer(format.into()));
}

fn parse_rect_4(raw: &str) -> Result<(u32, u32, u32, u32), AppError> {
    let numbers = parse_numbers(raw)?;
    if numbers.len() != 4 {
        return Err(AppError::ParseError(format!(
            "rect expected 4 numbers, got {} in `{raw}`",
            numbers.len()
        )));
    }
    Ok((
        numbers[0].ceil().max(0.0) as u32,
        numbers[1].ceil().max(0.0) as u32,
        numbers[2].floor().max(1.0) as u32,
        numbers[3].floor().max(1.0) as u32,
    ))
}

fn format_rect_4(x: u32, y: u32, w: u32, h: u32) -> String {
    format!("{{{{{},{}}},{{{},{}}}}}", x, y, w, h)
}

fn format_size_pair(w: u32, h: u32) -> String {
    format!("{{{},{}}}", w, h)
}

fn normalize_frame_dict_to_format3(frame: &mut Dictionary) {
    if frame.contains_key("textureRect") && frame.contains_key("spriteSize") {
        frame.remove("frame");
        frame.remove("offset");
        frame.remove("rotated");
        frame.remove("sourceColorRect");
        frame.remove("sourceSize");
        return;
    }

    if let Some(Value::String(frame_rect)) = frame.get("frame").cloned() {
        frame.insert("textureRect".to_string(), Value::String(frame_rect));
    }

    if let Some(Value::String(offset)) = frame.get("offset").cloned() {
        frame.insert("spriteOffset".to_string(), Value::String(offset));
    } else if !frame.contains_key("spriteOffset") {
        frame.insert(
            "spriteOffset".to_string(),
            Value::String("{0,0}".to_string()),
        );
    }

    if !frame.contains_key("textureRotated") {
        let rotated = frame
            .get("rotated")
            .and_then(Value::as_boolean)
            .unwrap_or(false);
        frame.insert("textureRotated".to_string(), Value::Boolean(rotated));
    }

    if !frame.contains_key("spriteSize") {
        let from_color_rect = frame
            .get("sourceColorRect")
            .and_then(Value::as_string)
            .and_then(|raw| parse_rect_4(raw).ok())
            .map(|(_, _, w, h)| format_size_pair(w, h));
        let from_frame = frame
            .get("frame")
            .and_then(Value::as_string)
            .and_then(|raw| parse_rect_4(raw).ok())
            .map(|(_, _, w, h)| format_size_pair(w, h));
        if let Some(size) = from_color_rect.or(from_frame) {
            frame.insert("spriteSize".to_string(), Value::String(size));
        }
    }

    if let Some(Value::String(source)) = frame.get("sourceSize").cloned() {
        frame.insert("spriteSourceSize".to_string(), Value::String(source));
    } else if !frame.contains_key("spriteSourceSize") {
        if let Some(size) = frame.get("spriteSize").cloned() {
            frame.insert("spriteSourceSize".to_string(), size);
        }
    }

    frame.remove("frame");
    frame.remove("offset");
    frame.remove("rotated");
    frame.remove("sourceColorRect");
    frame.remove("sourceSize");
}

fn denormalize_frame_dict_to_format2(frame: &mut Dictionary) {
    let texture_rect = frame
        .get("textureRect")
        .and_then(Value::as_string)
        .map(ToOwned::to_owned);
    let sprite_offset = frame
        .get("spriteOffset")
        .and_then(Value::as_string)
        .unwrap_or("{0,0}")
        .to_string();
    let texture_rotated = frame
        .get("textureRotated")
        .and_then(Value::as_boolean)
        .unwrap_or(false);
    let sprite_size = frame
        .get("spriteSize")
        .and_then(Value::as_string)
        .map(ToOwned::to_owned);
    let sprite_source_size = frame
        .get("spriteSourceSize")
        .and_then(Value::as_string)
        .map(ToOwned::to_owned);

    if let Some(rect) = texture_rect {
        frame.insert("frame".to_string(), Value::String(rect));
    }
    frame.insert("offset".to_string(), Value::String(sprite_offset.clone()));
    frame.insert("rotated".to_string(), Value::Boolean(texture_rotated));

    let source_size = sprite_source_size
        .clone()
        .or_else(|| sprite_size.clone())
        .unwrap_or_else(|| "{0,0}".to_string());
    frame.insert("sourceSize".to_string(), Value::String(source_size.clone()));

    if let (Some(sprite), Ok(source), Ok(offset)) = (
        sprite_size.as_deref().and_then(|raw| parse_pair(raw).ok()),
        parse_pair(&source_size),
        parse_pair(&sprite_offset),
    ) {
        let x = offset.x + source.x / 2.0 - sprite.x / 2.0;
        let y = source.y / 2.0 - offset.y - sprite.y / 2.0;
        frame.insert(
            "sourceColorRect".to_string(),
            Value::String(format_rect_4(
                x.round().max(0.0) as u32,
                y.round().max(0.0) as u32,
                sprite.x.round().max(1.0) as u32,
                sprite.y.round().max(1.0) as u32,
            )),
        );
    }

    frame.remove("textureRect");
    frame.remove("spriteOffset");
    frame.remove("spriteSize");
    frame.remove("spriteSourceSize");
    frame.remove("textureRotated");
}

fn for_each_frame_dict_mut(root: &mut Value, mut visit: impl FnMut(&mut Dictionary)) {
    let Some(frames) = root
        .as_dictionary_mut()
        .and_then(|dict| dict.get_mut("frames"))
        .and_then(Value::as_dictionary_mut)
    else {
        return;
    };
    for (_name, value) in frames.iter_mut() {
        if let Some(frame) = value.as_dictionary_mut() {
            visit(frame);
        }
    }
}

/// Rewrite format-2 frame keys to format 3. Leaves `metadata.format` unchanged so in-place
/// remakes can write the original format back.
pub fn normalize_plist_frames_to_format3(root: &mut Value) {
    for_each_frame_dict_mut(root, normalize_frame_dict_to_format3);
}

/// Rewrite format-3 frame keys to format 2 and set `metadata.format` to 2.
pub fn denormalize_plist_frames_to_format2(root: &mut Value) {
    ensure_metadata_format(root, 2);
    for_each_frame_dict_mut(root, denormalize_frame_dict_to_format2);
}

/// If `metadata.format` is 2, write format-2 keys. Used for in-place remakes.
pub fn denormalize_plist_if_format2(root: &mut Value) {
    if metadata_format_integer(root) == Some(2) {
        denormalize_plist_frames_to_format2(root);
    }
}

/// Convert-to-latest always writes modern format 3 keys.
pub fn force_plist_frames_to_format3(root: &mut Value) {
    normalize_plist_frames_to_format3(root);
    ensure_metadata_format(root, 3);
}

/// TexturePacker / Cocos icon-frame dict: `textureRect` + `spriteSize`, and any present
/// `spriteOffset` / `spriteSourceSize` must be real pairs (empty strings are incompatible).
pub fn frame_matches_icon_plist_format(value: &Value) -> bool {
    let Some(dict) = value.as_dictionary() else {
        return false;
    };
    let Some(texture_rect) = dict.get("textureRect").and_then(Value::as_string) else {
        return false;
    };
    match parse_numbers(texture_rect) {
        Ok(nums) if nums.len() == 4 => {}
        _ => return false,
    }
    let Some(sprite_size) = dict.get("spriteSize").and_then(Value::as_string) else {
        return false;
    };
    if parse_pair(sprite_size).is_err() {
        return false;
    }
    optional_string_pair_ok(dict, "spriteOffset")
        && optional_string_pair_ok(dict, "spriteSourceSize")
}

/// Drop `frames` entries that are not valid icon/sprite dicts. Returns removed keys.
pub fn strip_incompatible_icon_plist_frames(
    plist_root: &mut Value,
) -> Result<Vec<String>, AppError> {
    let root = plist_root
        .as_dictionary_mut()
        .ok_or_else(|| AppError::ParseError("plist root must be a dictionary".to_string()))?;
    let frames = root
        .get_mut("frames")
        .and_then(Value::as_dictionary_mut)
        .ok_or_else(|| {
            AppError::ParseError("plist missing top-level `frames` dictionary".to_string())
        })?;
    let mut removed = Vec::new();
    let names: Vec<String> = frames.keys().cloned().collect();
    for name in names {
        let keep = frames
            .get(&name)
            .is_some_and(frame_matches_icon_plist_format);
        if !keep {
            frames.remove(&name);
            removed.push(name);
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::{
        denormalize_plist_frames_to_format2, detect_plist_sprite_format,
        force_plist_frames_to_format3, format_pair, frame_matches_icon_plist_format,
        normalize_plist_frames_to_format3, parse_pair, scale_pair_floor,
        strip_incompatible_icon_plist_frames, PlistSpriteFormat, PointF32,
    };
    use plist::{Dictionary, Value};

    #[test]
    fn parse_pair_accepts_standard_format() {
        let parsed = parse_pair("{12.5,-3.0}").expect("should parse valid pair");
        assert_eq!(parsed, PointF32 { x: 12.5, y: -3.0 });
    }

    #[test]
    fn format_pair_keeps_stable_precision() {
        let value = PointF32 { x: 2.0, y: 4.125 };
        assert_eq!(format_pair(value), "{2.000,4.125}");
    }

    #[test]
    fn scale_floor_rejects_invalid_divisor() {
        let value = PointF32 { x: 2.0, y: 3.0 };
        let scaled = scale_pair_floor(value, 0.0);
        assert!(scaled.is_err());
    }

    fn valid_icon_frame_dict() -> Dictionary {
        let mut frame = Dictionary::new();
        frame.insert("aliases".to_string(), Value::Array(Vec::new()));
        frame.insert(
            "spriteOffset".to_string(),
            Value::String("{0,0}".to_string()),
        );
        frame.insert(
            "spriteSize".to_string(),
            Value::String("{12,12}".to_string()),
        );
        frame.insert(
            "spriteSourceSize".to_string(),
            Value::String("{12,12}".to_string()),
        );
        frame.insert(
            "textureRect".to_string(),
            Value::String("{{0,0},{12,12}}".to_string()),
        );
        frame.insert("textureRotated".to_string(), Value::Boolean(false));
        frame
    }

    fn watermark_frame_dict() -> Dictionary {
        let mut frame = Dictionary::new();
        frame.insert("aliases".to_string(), Value::Array(Vec::new()));
        frame.insert("spriteOffset".to_string(), Value::String(String::new()));
        frame.insert(
            "spriteSize".to_string(),
            Value::String("{342,166}".to_string()),
        );
        frame.insert("spriteSourceSize".to_string(), Value::String(String::new()));
        frame.insert(
            "textureRect".to_string(),
            Value::String("{{1,1},{342,166}}".to_string()),
        );
        frame.insert("textureRotated".to_string(), Value::Boolean(false));
        frame
    }

    #[test]
    fn frame_format_accepts_complete_icon_dict() {
        assert!(frame_matches_icon_plist_format(&Value::Dictionary(
            valid_icon_frame_dict()
        )));
    }

    #[test]
    fn frame_format_rejects_empty_offset_and_source_size() {
        assert!(!frame_matches_icon_plist_format(&Value::Dictionary(
            watermark_frame_dict()
        )));
    }

    #[test]
    fn frame_format_allows_missing_optional_pairs() {
        let mut frame = valid_icon_frame_dict();
        frame.remove("spriteOffset");
        frame.remove("spriteSourceSize");
        assert!(frame_matches_icon_plist_format(&Value::Dictionary(frame)));
    }

    #[test]
    fn strip_incompatible_frames_removes_watermark_dict() {
        let mut frames = Dictionary::new();
        frames.insert(
            "player_01_001.png".to_string(),
            Value::Dictionary(valid_icon_frame_dict()),
        );
        frames.insert(
            "Viper_WaterMark.png".to_string(),
            Value::Dictionary(watermark_frame_dict()),
        );
        let mut root = Dictionary::new();
        root.insert("frames".to_string(), Value::Dictionary(frames));
        let mut plist_root = Value::Dictionary(root);

        let removed = strip_incompatible_icon_plist_frames(&mut plist_root).expect("strip");
        assert_eq!(removed, vec!["Viper_WaterMark.png".to_string()]);

        let frames = plist_root
            .as_dictionary()
            .and_then(|dict| dict.get("frames"))
            .and_then(Value::as_dictionary)
            .expect("frames");
        assert!(frames.contains_key("player_01_001.png"));
        assert!(!frames.contains_key("Viper_WaterMark.png"));
    }

    fn format2_ship_23_2_frame() -> Dictionary {
        let mut frame = Dictionary::new();
        frame.insert(
            "frame".to_string(),
            Value::String("{{1412,315},{70,42}}".to_string()),
        );
        frame.insert("offset".to_string(), Value::String("{4,9}".to_string()));
        frame.insert("rotated".to_string(), Value::Boolean(false));
        frame.insert(
            "sourceColorRect".to_string(),
            Value::String("{{8,0},{70,42}}".to_string()),
        );
        frame.insert(
            "sourceSize".to_string(),
            Value::String("{78,60}".to_string()),
        );
        frame
    }

    fn plist_with_format2_frame(frame: Dictionary) -> Value {
        let mut frames = Dictionary::new();
        frames.insert("ship_23_2_001.png".to_string(), Value::Dictionary(frame));
        let mut metadata = Dictionary::new();
        metadata.insert("format".to_string(), Value::Integer(2.into()));
        let mut root = Dictionary::new();
        root.insert("frames".to_string(), Value::Dictionary(frames));
        root.insert("metadata".to_string(), Value::Dictionary(metadata));
        Value::Dictionary(root)
    }

    #[test]
    fn detect_format2_from_metadata_and_frame_keys() {
        let root = plist_with_format2_frame(format2_ship_23_2_frame());
        assert_eq!(
            detect_plist_sprite_format(&root),
            PlistSpriteFormat::Format2
        );

        let mut no_meta = plist_with_format2_frame(format2_ship_23_2_frame());
        no_meta
            .as_dictionary_mut()
            .expect("root")
            .remove("metadata");
        assert_eq!(
            detect_plist_sprite_format(&no_meta),
            PlistSpriteFormat::Format2
        );
    }

    #[test]
    fn normalize_format2_ship_frame_to_format3_keys() {
        let mut root = plist_with_format2_frame(format2_ship_23_2_frame());
        normalize_plist_frames_to_format3(&mut root);
        assert_eq!(
            detect_plist_sprite_format(&root),
            PlistSpriteFormat::Format2
        );

        let frame = root
            .as_dictionary()
            .and_then(|dict| dict.get("frames"))
            .and_then(Value::as_dictionary)
            .and_then(|frames| frames.get("ship_23_2_001.png"))
            .and_then(Value::as_dictionary)
            .expect("frame");
        assert_eq!(
            frame.get("textureRect").and_then(Value::as_string),
            Some("{{1412,315},{70,42}}")
        );
        assert_eq!(
            frame.get("spriteOffset").and_then(Value::as_string),
            Some("{4,9}")
        );
        assert_eq!(
            frame.get("spriteSize").and_then(Value::as_string),
            Some("{70,42}")
        );
        assert_eq!(
            frame.get("spriteSourceSize").and_then(Value::as_string),
            Some("{78,60}")
        );
        assert_eq!(
            frame.get("textureRotated").and_then(Value::as_boolean),
            Some(false)
        );
        assert!(!frame.contains_key("frame"));
        assert!(!frame.contains_key("offset"));
        assert!(!frame.contains_key("sourceColorRect"));
        assert!(!frame.contains_key("sourceSize"));
    }

    #[test]
    fn denormalize_round_trips_format2_ship_frame() {
        let mut root = plist_with_format2_frame(format2_ship_23_2_frame());
        normalize_plist_frames_to_format3(&mut root);
        denormalize_plist_frames_to_format2(&mut root);

        let frame = root
            .as_dictionary()
            .and_then(|dict| dict.get("frames"))
            .and_then(Value::as_dictionary)
            .and_then(|frames| frames.get("ship_23_2_001.png"))
            .and_then(Value::as_dictionary)
            .expect("frame");
        assert_eq!(
            frame.get("frame").and_then(Value::as_string),
            Some("{{1412,315},{70,42}}")
        );
        assert_eq!(
            frame.get("offset").and_then(Value::as_string),
            Some("{4,9}")
        );
        assert_eq!(
            frame.get("rotated").and_then(Value::as_boolean),
            Some(false)
        );
        assert_eq!(
            frame.get("sourceColorRect").and_then(Value::as_string),
            Some("{{8,0},{70,42}}")
        );
        assert_eq!(
            frame.get("sourceSize").and_then(Value::as_string),
            Some("{78,60}")
        );
        assert!(!frame.contains_key("textureRect"));
        assert_eq!(
            root.as_dictionary()
                .and_then(|dict| dict.get("metadata"))
                .and_then(Value::as_dictionary)
                .and_then(|metadata| metadata.get("format"))
                .and_then(|value| match value {
                    Value::Integer(integer) => integer.as_signed(),
                    _ => None,
                }),
            Some(2)
        );
    }

    #[test]
    fn force_format3_overrides_legacy_metadata() {
        let mut root = plist_with_format2_frame(format2_ship_23_2_frame());
        force_plist_frames_to_format3(&mut root);
        assert_eq!(
            detect_plist_sprite_format(&root),
            PlistSpriteFormat::Format3
        );
        let frame = root
            .as_dictionary()
            .and_then(|dict| dict.get("frames"))
            .and_then(Value::as_dictionary)
            .and_then(|frames| frames.get("ship_23_2_001.png"))
            .and_then(Value::as_dictionary)
            .expect("frame");
        assert!(frame.contains_key("textureRect"));
        assert!(!frame.contains_key("frame"));
    }
}
