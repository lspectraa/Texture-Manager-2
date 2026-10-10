//! Shared HSV converters used by Create Geode Buttons and Menu Recolor.
//!
//! [`apply_hsv_delta`] is the Geode Buttons whole-sprite delta. Menu Recolor uses
//! [`apply_color_recipe`], a weighted hue-band mixer that finishes Value with
//! [`apply_value_delta_rgb`].

use std::collections::BTreeMap;

use image::RgbaImage;
use serde::{Deserialize, Serialize};

/// Saturation at or below this is Neutral. Low-S hue is unstable.
pub const NEUTRAL_SAT_MAX: f32 = 0.12;
/// Saturation required before a pixel can belong to the gold/amber band.
pub const GOLD_SAT_MIN: f32 = 0.28;
pub const GOLD_CENTER_DEG: f32 = 42.0;
pub const GOLD_RADIUS_DEG: f32 = 22.0;
/// Overlaps neighboring Lightroom-style bands so every hue has a weight.
pub const CHROMATIC_RADIUS_DEG: f32 = 40.0;
/// Green sits in a wider gap between yellow (60°) and aqua (180°), so its falloff is wider.
pub const GREEN_RADIUS_DEG: f32 = 56.0;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(rename_all = "camelCase")]
pub enum BandId {
    Red,
    Orange,
    Yellow,
    Green,
    Aqua,
    Blue,
    Purple,
    Magenta,
    Neutral,
    Gold,
}

/// Lightroom Color Mixer hue centers (degrees). Keep in sync with `menuRecolorColor.ts`.
pub const CHROMATIC_BANDS: [(BandId, f32); 8] = [
    (BandId::Red, 0.0),
    (BandId::Orange, 30.0),
    (BandId::Yellow, 60.0),
    (BandId::Green, 120.0),
    (BandId::Aqua, 180.0),
    (BandId::Blue, 225.0),
    (BandId::Purple, 285.0),
    (BandId::Magenta, 330.0),
];

pub const ALL_BANDS: [BandId; 10] = [
    BandId::Red,
    BandId::Orange,
    BandId::Yellow,
    BandId::Green,
    BandId::Aqua,
    BandId::Blue,
    BandId::Purple,
    BandId::Magenta,
    BandId::Neutral,
    BandId::Gold,
];

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BandDelta {
    pub hue_deg: f32,
    pub sat_delta: f32,
    pub val_delta: f32,
    /// Symmetric falloff used when a side is unset. `0` uses the built-in width.
    #[serde(default)]
    pub radius_deg: f32,
    /// Falloff toward lower hues. `0` uses `radius_deg`.
    #[serde(default)]
    pub radius_low_deg: f32,
    /// Falloff toward higher hues. `0` uses `radius_deg`.
    #[serde(default)]
    pub radius_high_deg: f32,
}

impl BandDelta {
    pub const ZERO: Self = Self {
        hue_deg: 0.0,
        sat_delta: 0.0,
        val_delta: 0.0,
        radius_deg: 0.0,
        radius_low_deg: 0.0,
        radius_high_deg: 0.0,
    };

    fn is_noop(self) -> bool {
        self.hue_deg.abs() < 1e-6 && self.sat_delta.abs() < 1e-6 && self.val_delta.abs() < 1e-6
    }
}

impl Default for BandDelta {
    fn default() -> Self {
        Self::ZERO
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ColorLocks {
    pub neutral: bool,
    pub gold: bool,
}

impl Default for ColorLocks {
    fn default() -> Self {
        Self {
            neutral: true,
            gold: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ColorRecipe {
    pub bands: BTreeMap<BandId, BandDelta>,
    pub locks: ColorLocks,
    /// Point Color hook. This pass never reads the entries.
    #[serde(default)]
    pub points: Vec<serde_json::Value>,
}

impl Default for ColorRecipe {
    fn default() -> Self {
        Self::identity()
    }
}

impl ColorRecipe {
    pub fn identity() -> Self {
        let mut bands = BTreeMap::new();
        for band in ALL_BANDS {
            bands.insert(band, BandDelta::ZERO);
        }
        Self {
            bands,
            locks: ColorLocks::default(),
            points: Vec::new(),
        }
    }

    pub fn normalized(mut self) -> Self {
        let existing = std::mem::take(&mut self.bands);
        let mut bands = BTreeMap::new();
        for band in ALL_BANDS {
            let mut delta = existing.get(&band).copied().unwrap_or(BandDelta::ZERO);
            delta.radius_low_deg = effective_radius_side(band, delta, delta.radius_low_deg);
            delta.radius_high_deg = effective_radius_side(band, delta, delta.radius_high_deg);
            delta.radius_deg = effective_radius_deg(band, delta);
            bands.insert(band, delta);
        }
        self.bands = bands;
        self.points.clear();
        self
    }
}

pub fn rgb_to_hsv(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let max = r.max(g.max(b));
    let min = r.min(g.min(b));
    let delta = max - min;
    let v = max;
    let s = if max <= 1e-6 { 0.0 } else { delta / max };
    let mut h = if delta <= 1e-6 {
        0.0
    } else if max == r {
        ((g - b) / delta) % 6.0
    } else if max == g {
        ((b - r) / delta) + 2.0
    } else {
        ((r - g) / delta) + 4.0
    };
    h /= 6.0;
    if h < 0.0 {
        h += 1.0;
    }
    (h, s, v)
}

pub fn hsv_to_rgb(h: f32, s: f32, v: f32) -> (f32, f32, f32) {
    let h6 = (h.fract() * 6.0).max(0.0);
    let i = h6.floor();
    let f = h6 - i;
    let p = v * (1.0 - s);
    let q = v * (1.0 - f * s);
    let t = v * (1.0 - (1.0 - f) * s);
    match i as i32 {
        0 => (v, t, p),
        1 => (q, v, p),
        2 => (p, v, t),
        3 => (p, q, v),
        4 => (t, p, v),
        _ => (v, p, q),
    }
}

pub fn clamp01(v: f32) -> f32 {
    v.max(0.0).min(1.0)
}

pub fn apply_value_delta_rgb(r: f32, g: f32, b: f32, val_delta: f32) -> (f32, f32, f32) {
    let d = clamp01(val_delta.abs());
    if val_delta >= 0.0 {
        // Photoshop-like brightness: +1.0 pushes every channel to white.
        (r + (1.0 - r) * d, g + (1.0 - g) * d, b + (1.0 - b) * d)
    } else {
        // -1.0 pushes every channel to black.
        (r * (1.0 - d), g * (1.0 - d), b * (1.0 - d))
    }
}

/// Whole-sprite HSV delta used by Create Geode Buttons.
pub fn apply_hsv_delta(img: &mut RgbaImage, hue_deg: f32, sat_delta: f32, val_delta: f32) {
    if hue_deg.abs() < 1e-6 && sat_delta.abs() < 1e-6 && val_delta.abs() < 1e-6 {
        return;
    }
    let hue_delta = hue_deg / 360.0;
    for pixel in img.pixels_mut() {
        let a = pixel[3];
        if a == 0 {
            continue;
        }
        let r = pixel[0] as f32 / 255.0;
        let g = pixel[1] as f32 / 255.0;
        let b = pixel[2] as f32 / 255.0;
        let (mut h, mut s, mut v) = rgb_to_hsv(r, g, b);
        h = (h + hue_delta).rem_euclid(1.0);
        // Do not introduce saturation into fully desaturated pixels (white/black/gray).
        if s <= 1e-6 && sat_delta > 0.0 {
            s = 0.0;
        } else {
            s = clamp01(s + sat_delta);
        }
        v = clamp01(v);
        let (nr, ng, nb) = hsv_to_rgb(h, s, v);
        let (vr, vg, vb) = apply_value_delta_rgb(clamp01(nr), clamp01(ng), clamp01(nb), val_delta);
        pixel[0] = (clamp01(vr) * 255.0).round() as u8;
        pixel[1] = (clamp01(vg) * 255.0).round() as u8;
        pixel[2] = (clamp01(vb) * 255.0).round() as u8;
    }
}

fn smoothstep01(t: f32) -> f32 {
    let t = clamp01(t);
    t * t * (3.0 - 2.0 * t)
}

fn circular_dist(a: f32, b: f32) -> f32 {
    let d = (a - b).abs();
    d.min(1.0 - d)
}

fn signed_hue_delta(hue: f32, center: f32) -> f32 {
    let mut delta = hue - center;
    delta -= delta.round();
    delta
}

fn hue_weight(hue: f32, center: f32, radius_low: f32, radius_high: f32) -> f32 {
    let delta = signed_hue_delta(hue, center);
    let radius = if delta < 0.0 { radius_low } else { radius_high };
    if radius <= 1e-6 {
        return 0.0;
    }
    let dist = delta.abs();
    if dist >= radius {
        return 0.0;
    }
    smoothstep01(1.0 - dist / radius)
}

fn band_delta(recipe: &ColorRecipe, id: BandId) -> BandDelta {
    recipe.bands.get(&id).copied().unwrap_or(BandDelta::ZERO)
}

fn chromatic_radius_deg(id: BandId) -> f32 {
    if id == BandId::Green {
        GREEN_RADIUS_DEG
    } else {
        CHROMATIC_RADIUS_DEG
    }
}

fn effective_radius_deg(id: BandId, delta: BandDelta) -> f32 {
    if delta.radius_deg.is_finite() && delta.radius_deg >= 8.0 {
        delta.radius_deg.clamp(8.0, 90.0)
    } else {
        chromatic_radius_deg(id)
    }
}

fn effective_radius_side(id: BandId, delta: BandDelta, side: f32) -> f32 {
    if side.is_finite() && side >= 8.0 {
        side.clamp(8.0, 90.0)
    } else {
        effective_radius_deg(id, delta)
    }
}

fn weighted_chromatic(hue: f32, recipe: &ColorRecipe) -> (f32, f32, f32) {
    let mut hue_deg = 0.0;
    let mut sat_delta = 0.0;
    let mut val_delta = 0.0;
    let mut sum = 0.0;
    for (id, center_deg) in CHROMATIC_BANDS {
        let delta = band_delta(recipe, id);
        let low = effective_radius_side(id, delta, delta.radius_low_deg) / 360.0;
        let high = effective_radius_side(id, delta, delta.radius_high_deg) / 360.0;
        let weight = hue_weight(hue, center_deg / 360.0, low, high);
        if weight <= 0.0 {
            continue;
        }
        hue_deg += weight * delta.hue_deg;
        sat_delta += weight * delta.sat_delta;
        val_delta += weight * delta.val_delta;
        sum += weight;
    }
    if sum <= 1e-6 {
        return (0.0, 0.0, 0.0);
    }
    (hue_deg / sum, sat_delta / sum, val_delta / sum)
}

fn mixed_deltas(r: f32, g: f32, b: f32, recipe: &ColorRecipe, strength: f32) -> Option<(f32, f32, f32)> {
    let (h, s, _v) = rgb_to_hsv(r, g, b);
    let (hue_deg, sat_delta, val_delta) = if s <= NEUTRAL_SAT_MAX {
        let neutral = band_delta(recipe, BandId::Neutral);
        if recipe.locks.neutral {
            (0.0, 0.0, neutral.val_delta)
        } else {
            (neutral.hue_deg, neutral.sat_delta, neutral.val_delta)
        }
    } else {
        let (ch, cs, cv) = weighted_chromatic(h, recipe);
        let gold_m = if s >= GOLD_SAT_MIN {
            hue_weight(
                h,
                GOLD_CENTER_DEG / 360.0,
                GOLD_RADIUS_DEG / 360.0,
                GOLD_RADIUS_DEG / 360.0,
            )
        } else {
            0.0
        };
        if recipe.locks.gold {
            let scale = 1.0 - gold_m;
            (ch * scale, cs * scale, cv * scale)
        } else {
            let gold = band_delta(recipe, BandId::Gold);
            let keep = 1.0 - gold_m;
            (
                ch * keep + gold.hue_deg * gold_m,
                cs * keep + gold.sat_delta * gold_m,
                cv * keep + gold.val_delta * gold_m,
            )
        }
    };
    let hue_deg = hue_deg * strength;
    let sat_delta = sat_delta * strength;
    let val_delta = val_delta * strength;
    if hue_deg.abs() < 1e-6 && sat_delta.abs() < 1e-6 && val_delta.abs() < 1e-6 {
        return None;
    }
    Some((hue_deg, sat_delta, val_delta))
}

/// Weighted hue-band mixer. `strength` is 0..1 and scales every delta.
/// Original alpha is kept. Fully transparent pixels are left untouched.
pub fn apply_color_recipe(img: &mut RgbaImage, recipe: &ColorRecipe, strength: f32) {
    let strength = clamp01(strength);
    if strength <= 1e-6 || recipe.bands.values().all(|delta| delta.is_noop()) {
        return;
    }
    for pixel in img.pixels_mut() {
        let a = pixel[3];
        if a == 0 {
            continue;
        }
        let r = pixel[0] as f32 / 255.0;
        let g = pixel[1] as f32 / 255.0;
        let b = pixel[2] as f32 / 255.0;
        let Some((hue_deg, sat_delta, val_delta)) = mixed_deltas(r, g, b, recipe, strength) else {
            continue;
        };
        let (h, s, v) = rgb_to_hsv(r, g, b);
        let h = (h + hue_deg / 360.0).rem_euclid(1.0);
        let s = clamp01(s + sat_delta);
        let v = clamp01(v);
        let (nr, ng, nb) = hsv_to_rgb(h, s, v);
        let (vr, vg, vb) = apply_value_delta_rgb(clamp01(nr), clamp01(ng), clamp01(nb), val_delta);
        pixel[0] = (clamp01(vr) * 255.0).round() as u8;
        pixel[1] = (clamp01(vg) * 255.0).round() as u8;
        pixel[2] = (clamp01(vb) * 255.0).round() as u8;
    }
}

fn set_all_chromatic(recipe: &mut ColorRecipe, hue_deg: f32, sat_delta: f32, val_delta: f32) {
    for (id, _) in CHROMATIC_BANDS {
        recipe.bands.insert(
            id,
            BandDelta {
                hue_deg,
                sat_delta,
                val_delta,
                radius_deg: 0.0,
                radius_low_deg: 0.0,
                radius_high_deg: 0.0,
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    fn pixel(r: u8, g: u8, b: u8, a: u8) -> RgbaImage {
        RgbaImage::from_pixel(1, 1, Rgba([r, g, b, a]))
    }

    fn channels(img: &RgbaImage) -> [u8; 4] {
        img.get_pixel(0, 0).0
    }

    fn gold_pixel() -> [u8; 4] {
        let (r, g, b) = hsv_to_rgb(GOLD_CENTER_DEG / 360.0, 0.9, 0.95);
        [
            (clamp01(r) * 255.0).round() as u8,
            (clamp01(g) * 255.0).round() as u8,
            (clamp01(b) * 255.0).round() as u8,
            255,
        ]
    }

    #[test]
    fn lightroom_chromatic_band_centers() {
        assert_eq!(
            CHROMATIC_BANDS.map(|(_, deg)| deg),
            [0.0, 30.0, 60.0, 120.0, 180.0, 225.0, 285.0, 330.0]
        );
    }

    #[test]
    fn green_band_reaches_hues_outside_the_shared_radius() {
        let (r, g, b) = hsv_to_rgb(165.0 / 360.0, 1.0, 1.0);
        let rgba = [
            (clamp01(r) * 255.0).round() as u8,
            (clamp01(g) * 255.0).round() as u8,
            (clamp01(b) * 255.0).round() as u8,
            255,
        ];
        let mut img = pixel(rgba[0], rgba[1], rgba[2], 255);
        let mut recipe = ColorRecipe::identity();
        recipe.bands.insert(
            BandId::Green,
            BandDelta {
                hue_deg: 40.0,
                sat_delta: 0.0,
                val_delta: 0.0,
                radius_deg: 0.0,
                radius_low_deg: 0.0,
                radius_high_deg: 0.0,
            },
        );
        recipe.locks.gold = true;
        apply_color_recipe(&mut img, &recipe, 1.0);
        assert_ne!(channels(&img), rgba);

        let (yr, yg, yb) = hsv_to_rgb(60.0 / 360.0, 1.0, 1.0);
        let yellow = [
            (clamp01(yr) * 255.0).round() as u8,
            (clamp01(yg) * 255.0).round() as u8,
            (clamp01(yb) * 255.0).round() as u8,
            255,
        ];
        let mut yellow_img = pixel(yellow[0], yellow[1], yellow[2], 255);
        apply_color_recipe(&mut yellow_img, &recipe, 1.0);
        assert_eq!(channels(&yellow_img), yellow);
    }

    #[test]
    fn narrower_green_radius_stops_before_hue_165() {
        let (r, g, b) = hsv_to_rgb(165.0 / 360.0, 1.0, 1.0);
        let rgba = [
            (clamp01(r) * 255.0).round() as u8,
            (clamp01(g) * 255.0).round() as u8,
            (clamp01(b) * 255.0).round() as u8,
            255,
        ];
        let mut img = pixel(rgba[0], rgba[1], rgba[2], 255);
        let mut recipe = ColorRecipe::identity();
        recipe.bands.insert(
            BandId::Green,
            BandDelta {
                hue_deg: 40.0,
                sat_delta: 0.0,
                val_delta: 0.0,
                radius_deg: 20.0,
                radius_low_deg: 0.0,
                radius_high_deg: 0.0,
            },
        );
        recipe.locks.gold = true;
        apply_color_recipe(&mut img, &recipe, 1.0);
        assert_eq!(channels(&img), rgba);
    }

    #[test]
    fn high_side_radius_does_not_shrink_the_low_side() {
        let mut recipe = ColorRecipe::identity();
        recipe.locks.gold = true;
        recipe.bands.insert(
            BandId::Green,
            BandDelta {
                hue_deg: 40.0,
                sat_delta: 0.0,
                val_delta: 0.0,
                radius_deg: 0.0,
                radius_low_deg: 56.0,
                radius_high_deg: 20.0,
            },
        );
        let (r, g, b) = hsv_to_rgb(165.0 / 360.0, 1.0, 1.0);
        let high = [
            (clamp01(r) * 255.0).round() as u8,
            (clamp01(g) * 255.0).round() as u8,
            (clamp01(b) * 255.0).round() as u8,
            255,
        ];
        let mut high_img = pixel(high[0], high[1], high[2], 255);
        apply_color_recipe(&mut high_img, &recipe, 1.0);
        assert_eq!(channels(&high_img), high);

        let (lr, lg, lb) = hsv_to_rgb(80.0 / 360.0, 1.0, 1.0);
        let low = [
            (clamp01(lr) * 255.0).round() as u8,
            (clamp01(lg) * 255.0).round() as u8,
            (clamp01(lb) * 255.0).round() as u8,
            255,
        ];
        let mut low_img = pixel(low[0], low[1], low[2], 255);
        apply_color_recipe(&mut low_img, &recipe, 1.0);
        assert_ne!(channels(&low_img), low);
    }

    #[test]
    fn gray_lock_does_not_take_a_random_hue() {
        let mut img = pixel(180, 180, 180, 255);
        let mut recipe = ColorRecipe::identity();
        set_all_chromatic(&mut recipe, 120.0, 1.0, 0.0);
        recipe.locks.neutral = true;
        apply_color_recipe(&mut img, &recipe, 1.0);
        assert_eq!(channels(&img), [180, 180, 180, 255]);
    }

    #[test]
    fn gold_lock_freezes_amber_pixel() {
        let rgba = gold_pixel();
        let mut img = pixel(rgba[0], rgba[1], rgba[2], rgba[3]);
        let mut recipe = ColorRecipe::identity();
        set_all_chromatic(&mut recipe, 80.0, 0.4, 0.2);
        recipe.locks.gold = true;
        apply_color_recipe(&mut img, &recipe, 1.0);
        assert_eq!(channels(&img), rgba);
    }

    #[test]
    fn gold_unlock_applies_gold_band_hue() {
        let rgba = gold_pixel();
        let mut img = pixel(rgba[0], rgba[1], rgba[2], rgba[3]);
        let mut recipe = ColorRecipe::identity();
        recipe.locks.gold = false;
        recipe.bands.insert(
            BandId::Gold,
            BandDelta {
                hue_deg: 30.0,
                sat_delta: 0.0,
                val_delta: 0.0,
                radius_deg: 0.0,
                radius_low_deg: 0.0,
                radius_high_deg: 0.0,
            },
        );
        apply_color_recipe(&mut img, &recipe, 1.0);
        let out = channels(&img);
        let (h, _, _) = rgb_to_hsv(out[0] as f32 / 255.0, out[1] as f32 / 255.0, out[2] as f32 / 255.0);
        let expected = (GOLD_CENTER_DEG + 30.0) / 360.0;
        let dist = circular_dist(h, expected);
        assert!(dist < 2.0 / 360.0, "hue {h} expected near {expected}");
    }

    #[test]
    fn hue_wraps_past_zero() {
        let mut img = pixel(255, 0, 0, 255);
        let mut recipe = ColorRecipe::identity();
        set_all_chromatic(&mut recipe, -30.0, 0.0, 0.0);
        recipe.locks.gold = true;
        apply_color_recipe(&mut img, &recipe, 1.0);
        let out = channels(&img);
        let (h, s, _) = rgb_to_hsv(out[0] as f32 / 255.0, out[1] as f32 / 255.0, out[2] as f32 / 255.0);
        assert!(s > 0.5, "saturation collapsed: {s}");
        let expected = 330.0 / 360.0;
        assert!(
            circular_dist(h, expected) < 0.02,
            "hue {h} did not wrap toward {expected}"
        );
    }

    #[test]
    fn alpha_is_preserved_and_transparent_pixels_stay() {
        let mut clear = pixel(255, 0, 0, 0);
        let mut partial = pixel(255, 0, 0, 200);
        let mut recipe = ColorRecipe::identity();
        set_all_chromatic(&mut recipe, 90.0, 0.0, 0.0);
        apply_color_recipe(&mut clear, &recipe, 1.0);
        apply_color_recipe(&mut partial, &recipe, 1.0);
        assert_eq!(channels(&clear), [255, 0, 0, 0]);
        assert_eq!(channels(&partial)[3], 200);
        assert_ne!(channels(&partial)[0..3], [255, 0, 0]);
    }

    #[test]
    fn geode_hsv_delta_does_not_saturate_true_gray() {
        let mut img = pixel(140, 140, 140, 255);
        apply_hsv_delta(&mut img, 40.0, 0.8, 0.0);
        let out = channels(&img);
        assert_eq!(out[0], out[1]);
        assert_eq!(out[1], out[2]);
        assert_eq!(out[3], 255);
    }
}
