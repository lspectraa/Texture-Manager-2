use std::path::Path;

use plist::Value;

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
        .ok_or_else(|| AppError::ParseError(
            "plist missing top-level `frames` dictionary".to_string(),
        ))?;
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

#[cfg(test)]
mod tests {
    use super::{format_pair, parse_pair, scale_pair_floor, PointF32};

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
}
