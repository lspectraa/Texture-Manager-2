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
    glow_frame_name
        .find("_glow_")
        .map(|pos| format!("{}{}", &glow_frame_name[..pos], &glow_frame_name[(pos + 5)..]))
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

/// Generate a white glow from a primary icon sprite.
///
/// Uses an outside-stroke style morphological dilation:
/// - seed mask from alpha > tolerance
/// - dilate with a circular kernel (`thickness` radius)
/// - outside stroke is `dilated - original`
/// - optional pure-glow mode clears icon interior
pub fn render_icon_glow_from_primary(primary: &RgbaImage, options: &GlowMakerOptions) -> RgbaImage {
    let radius = options.thickness.max(1);
    let threshold = options.tolerance;
    let pad = radius;
    let out_w = primary.width().saturating_add(pad.saturating_mul(2)).max(1);
    let out_h = primary.height().saturating_add(pad.saturating_mul(2)).max(1);

    let mut original_mask = vec![0_u8; (out_w as usize).saturating_mul(out_h as usize)];
    let mut dilated_mask = vec![0_u8; (out_w as usize).saturating_mul(out_h as usize)];
    let offsets = disk_offsets(radius);

    for y in 0..primary.height() {
        for x in 0..primary.width() {
            let a = primary.get_pixel(x, y).0[3];
            if a <= threshold {
                continue;
            }
            let cx = x.saturating_add(pad) as i32;
            let cy = y.saturating_add(pad) as i32;
            original_mask[idx(cx as u32, cy as u32, out_w)] = 255;

            for (dx, dy) in &offsets {
                let nx = cx.saturating_add(*dx);
                let ny = cy.saturating_add(*dy);
                if nx < 0 || ny < 0 {
                    continue;
                }
                let ux = nx as u32;
                let uy = ny as u32;
                if ux >= out_w || uy >= out_h {
                    continue;
                }
                dilated_mask[idx(ux, uy, out_w)] = 255;
            }
        }
    }

    let mut glow_alpha = vec![0_u8; (out_w as usize).saturating_mul(out_h as usize)];
    for i in 0..glow_alpha.len() {
        glow_alpha[i] = if dilated_mask[i] > 0 && original_mask[i] == 0 {
            255
        } else {
            0
        };
    }

    // Add anti-aliased edges while keeping core stroke solid.
    // Slight alpha boost keeps the softened edge from looking too faint.
    const AA_ALPHA_BOOST: f32 = 1.2;
    let blurred = blur_alpha_box3(&glow_alpha, out_w, out_h);
    for i in 0..glow_alpha.len() {
        let boosted = ((blurred[i] as f32) * AA_ALPHA_BOOST).round().clamp(0.0, 255.0) as u8;
        glow_alpha[i] = glow_alpha[i].max(boosted);
    }

    for y in 0..primary.height() {
        for x in 0..primary.width() {
            let a = primary.get_pixel(x, y).0[3];
            if a > threshold {
                let i = idx(x.saturating_add(pad), y.saturating_add(pad), out_w);
                glow_alpha[i] = 0;
            }
        }
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

    out
}
