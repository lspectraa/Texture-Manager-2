use image::{Rgba, RgbaImage};

use crate::core::contracts::GlowMakerOptions;

fn idx(x: u32, y: u32, width: u32) -> usize {
    (y as usize)
        .saturating_mul(width as usize)
        .saturating_add(x as usize)
}

/// Resolve `*_glow_001.png` frame names back to a primary sprite frame.
pub fn glow_primary_name_for(glow_frame_name: &str) -> Option<String> {
    if let Some(prefix) = glow_frame_name.strip_suffix("_glow_001.png") {
        return Some(format!("{prefix}_001.png"));
    }
    glow_frame_name.find("_glow_").map(|pos| {
        format!(
            "{}{}",
            &glow_frame_name[..pos],
            &glow_frame_name[(pos + 5)..]
        )
    })
}

fn disk_offsets(radius: u32) -> Vec<(i32, i32)> {
    if radius == 0 {
        return vec![(0, 0)];
    }
    let r = radius as i32;
    let rr = r.saturating_mul(r);
    let mut out: Vec<(i32, i32)> = Vec::new();
    for dy in -r..=r {
        for dx in -r..=r {
            let d2 = dx.saturating_mul(dx).saturating_add(dy.saturating_mul(dy));
            if d2 <= rr {
                out.push((dx, dy));
            }
        }
    }
    out
}

/// Box blur for alpha channels (3×3).
fn blur_alpha_box3(alpha: &[u8], width: u32, height: u32) -> Vec<u8> {
    let mut out = vec![0_u8; alpha.len()];
    for y in 0..height {
        for x in 0..width {
            let mut sum = 0_u32;
            let mut n = 0_u32;
            let x0 = x.saturating_sub(1);
            let y0 = y.saturating_sub(1);
            let x1 = x.saturating_add(1).min(width.saturating_sub(1));
            let y1 = y.saturating_add(1).min(height.saturating_sub(1));
            for ny in y0..=y1 {
                for nx in x0..=x1 {
                    sum = sum.saturating_add(alpha[idx(nx, ny, width)] as u32);
                    n = n.saturating_add(1);
                }
            }
            out[idx(x, y, width)] = if n == 0 { 0 } else { (sum / n) as u8 };
        }
    }
    out
}

/// Box blur for alpha channels (5×5).
fn blur_alpha_box5(alpha: &[u8], width: u32, height: u32) -> Vec<u8> {
    let mut out = vec![0_u8; alpha.len()];
    for y in 0..height {
        for x in 0..width {
            let mut sum = 0_u32;
            let mut n = 0_u32;
            let x0 = x.saturating_sub(2);
            let y0 = y.saturating_sub(2);
            let x1 = x.saturating_add(2).min(width.saturating_sub(1));
            let y1 = y.saturating_add(2).min(height.saturating_sub(1));
            for ny in y0..=y1 {
                for nx in x0..=x1 {
                    sum = sum.saturating_add(alpha[idx(nx, ny, width)] as u32);
                    n = n.saturating_add(1);
                }
            }
            out[idx(x, y, width)] = if n == 0 { 0 } else { (sum / n) as u8 };
        }
    }
    out
}

/// Alpha used when whitening the primary interior: any visible pixel qualifies.
fn primary_whitening_alpha([r, g, b, a]: [u8; 4]) -> u8 {
    if a > 0 {
        return a;
    }
    r.max(g).max(b)
}

fn build_alpha_field(
    primary: &RgbaImage,
    out_w: u32,
    out_h: u32,
    offset_x: u32,
    offset_y: u32,
    min_alpha: u8,
) -> Vec<u8> {
    let mut alpha = vec![0_u8; (out_w as usize).saturating_mul(out_h as usize)];
    for y in 0..primary.height() {
        for x in 0..primary.width() {
            let a = primary_whitening_alpha(primary.get_pixel(x, y).0);
            if a == 0 {
                continue;
            }
            if min_alpha > 0 && a < min_alpha {
                continue;
            }
            let ox = x.saturating_add(offset_x);
            let oy = y.saturating_add(offset_y);
            if ox >= out_w || oy >= out_h {
                continue;
            }
            let i = idx(ox, oy, out_w);
            alpha[i] = alpha[i].max(a);
        }
    }
    alpha
}

/// Grayscale morphological dilation: output = max(alpha in disk neighborhood).
/// Spreads partial edge alphas outward so the stroke connects to the sprite.
fn dilate_alpha_grayscale(alpha: &[u8], width: u32, height: u32, radius: u32) -> Vec<u8> {
    if radius == 0 {
        return alpha.to_vec();
    }
    let offsets = disk_offsets(radius);
    let mut out = vec![0_u8; alpha.len()];
    for y in 0..height {
        for x in 0..width {
            let mut max_a = alpha[idx(x, y, width)];
            for (dx, dy) in &offsets {
                let nx = x as i32 + dx;
                let ny = y as i32 + dy;
                if nx < 0 || ny < 0 {
                    continue;
                }
                let ux = nx as u32;
                let uy = ny as u32;
                if ux >= width || uy >= height {
                    continue;
                }
                max_a = max_a.max(alpha[idx(ux, uy, width)]);
            }
            out[idx(x, y, width)] = max_a;
        }
    }
    out
}

/// Photoshop-style outside stroke alpha from a soft alpha field.
///
/// `stroke = dilated − original` (clamped), then `final = original + stroke = dilated`.
/// Because dilation uses max-filter on partial edge alphas, the stroke meets the sprite
/// without a binary seam.
fn compose_outside_stroke_alpha(original: &[u8], dilated: &[u8]) -> Vec<u8> {
    let mut out = vec![0_u8; original.len()];
    for i in 0..out.len() {
        let orig_f = original[i] as f32 / 255.0;
        let dil_f = dilated[i] as f32 / 255.0;
        let stroke_f = (dil_f - orig_f).max(0.0);
        let final_f = (orig_f + stroke_f).min(1.0);
        out[i] = (final_f * 255.0).round().clamp(0.0, 255.0) as u8;
    }
    out
}

/// Soften only the exterior boundary of the stroke without re-opening an inner gap.
fn soften_exterior_alpha(original: &[u8], composed: &mut [u8], width: u32, height: u32) {
    let blurred = blur_alpha_box5(composed, width, height);
    let twice_blurred = blur_alpha_box3(&blurred, width, height);
    for i in 0..composed.len() {
        if original[i] > 0 {
            continue;
        }
        let base = composed[i];
        if base == 0 {
            continue;
        }
        let soft = ((base as f32 * 0.55 + blurred[i] as f32 * 0.30 + twice_blurred[i] as f32 * 0.15)
            .round()
            .clamp(0.0, 255.0)) as u8;
        composed[i] = base.max(soft);
    }
}

/// Generate a white glow from a primary icon sprite.
///
/// Alpha-aware outside stroke (Photoshop-style):
/// - build a soft alpha field from the primary (not binarized)
/// - grayscale max-filter dilation spreads edge coverage outward
/// - outside stroke = dilated − original; composite = original + stroke (no seam)
/// - exterior-only multi-pass blur for smoother outer AA
/// - outline seed uses `tolerance` as minimum alpha (ignores faint edge debris)
/// - interior fully whitened; rainbow mode recolors RGB only
///
/// The original glow texture is never read; output is generated entirely from primary.
pub fn render_icon_glow_from_primary(primary: &RgbaImage, options: &GlowMakerOptions) -> RgbaImage {
    let radius = options.thickness.max(1);
    let outline_min_alpha = options.tolerance;
    let pad = radius;
    let out_w = primary.width().saturating_add(pad.saturating_mul(2)).max(1);
    let out_h = primary
        .height()
        .saturating_add(pad.saturating_mul(2))
        .max(1);

    let mut interior_alpha = build_alpha_field(primary, out_w, out_h, pad, pad, 0);
    let closed_interior = dilate_alpha_grayscale(&interior_alpha, out_w, out_h, 1);
    for i in 0..interior_alpha.len() {
        interior_alpha[i] = interior_alpha[i].max(closed_interior[i]);
    }

    let outline_seed = build_alpha_field(primary, out_w, out_h, pad, pad, outline_min_alpha);
    let closed_outline = dilate_alpha_grayscale(&outline_seed, out_w, out_h, 1);
    let mut outline_source = outline_seed.clone();
    for i in 0..outline_source.len() {
        outline_source[i] = outline_source[i].max(closed_outline[i]);
    }

    let dilated_outline = dilate_alpha_grayscale(&outline_source, out_w, out_h, radius);
    let mut outline_glow = compose_outside_stroke_alpha(&outline_source, &dilated_outline);
    soften_exterior_alpha(&outline_source, &mut outline_glow, out_w, out_h);

    let mut glow_alpha = interior_alpha;
    for i in 0..glow_alpha.len() {
        glow_alpha[i] = glow_alpha[i].max(outline_glow[i]);
    }

    let mut out = RgbaImage::from_pixel(out_w, out_h, Rgba([0, 0, 0, 0]));
    for y in 0..out_h {
        for x in 0..out_w {
            let a = glow_alpha[idx(x, y, out_w)];
            if a > 0 {
                out.put_pixel(x, y, Rgba([255, 255, 255, a]));
            }
        }
    }

    if options.rainbow_glow {
        apply_rainbow_gradient(&mut out);
    }

    out
}

/// Extended rainbow with strong cyan, purple, and reddish-violet at the right end.
const RAINBOW_STOPS: [[u8; 3]; 10] = [
    [255, 0, 0],     // Red
    [255, 127, 0],   // Orange
    [255, 255, 0],   // Yellow
    [0, 255, 0],     // Green
    [0, 255, 255],   // Strong cyan
    [0, 200, 255],   // Azure
    [0, 0, 255],     // Blue
    [160, 0, 255],   // Strong purple
    [255, 0, 180],   // Reddish magenta
    [220, 0, 90],    // Deep reddish-violet (right end)
];

fn lerp_u8(a: u8, b: u8, t: f32) -> u8 {
    (a as f32 + (b as f32 - a as f32) * t).round().clamp(0.0, 255.0) as u8
}

fn rainbow_rgb_at(x: u32, width: u32) -> [u8; 3] {
    if width <= 1 {
        return RAINBOW_STOPS[0];
    }
    let segment_count = RAINBOW_STOPS.len().saturating_sub(1) as f32;
    let t = (x as f32) / ((width - 1) as f32);
    let scaled = t * segment_count;
    let segment = (scaled.floor() as usize).min(RAINBOW_STOPS.len().saturating_sub(2));
    let frac = scaled - segment as f32;
    let c0 = RAINBOW_STOPS[segment];
    let c1 = RAINBOW_STOPS[segment + 1];
    [
        lerp_u8(c0[0], c1[0], frac),
        lerp_u8(c0[1], c1[1], frac),
        lerp_u8(c0[2], c1[2], frac),
    ]
}

/// Recolor a white glow image with a horizontal rainbow gradient, preserving alpha.
fn apply_rainbow_gradient(image: &mut RgbaImage) {
    let width = image.width();
    let height = image.height();
    for y in 0..height {
        for x in 0..width {
            let pixel = image.get_pixel(x, y);
            if pixel.0[3] == 0 {
                continue;
            }
            let rgb = rainbow_rgb_at(x, width);
            image.put_pixel(x, y, Rgba([rgb[0], rgb[1], rgb[2], pixel.0[3]]));
        }
    }
}
