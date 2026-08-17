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
        format_pair, frame_matches_icon_plist_format, parse_pair, scale_pair_floor,
        strip_incompatible_icon_plist_frames, PointF32,
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
}
