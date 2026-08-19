//! Post-AI sprite finish: isolated-pixel cleanup, edge sharpen, contour AA.
//!
//! Isolated-pixel cleanup lives in [`crate::core::image_alpha`] so Glow Maker
//! and other tools can reuse it. Contour smoothing stays here — it is icon-specific.

use std::fs;
use std::path::Path;

use image::{Rgba, RgbaImage};

use crate::core::errors::AppError;
use crate::core::image_alpha::clear_orthogonally_isolated_pixels;
use crate::core::image_io;

fn pixel_luma(pixel: [u8; 4]) -> u8 {
    ((u16::from(pixel[0]) + u16::from(pixel[1]) + u16::from(pixel[2])) / 3) as u8
}

fn pixel_chroma(pixel: [u8; 4]) -> u8 {
    let max_c = pixel[0].max(pixel[1]).max(pixel[2]);
    let min_c = pixel[0].min(pixel[1]).min(pixel[2]);
    max_c.saturating_sub(min_c)
}

pub(crate) fn is_ink_black(pixel: [u8; 4], min_alpha: u8) -> bool {
    if pixel[3] < min_alpha {
        return false;
    }
    pixel_luma(pixel) <= 24 && pixel_chroma(pixel) <= 16
}

/// Neutral white at any opacity — deblur must not crush or AA these.
pub(crate) fn is_white_rgb(pixel: [u8; 4]) -> bool {
    pixel_luma(pixel) >= 200 && pixel_chroma(pixel) <= 24
}

/// 0 = flat or smooth ramp (leave alone), 1 = bimodal step (safe to sharpen).
/// Neighborhoods that include true-black ink still count as hard edges so
/// outline-adjacent fill is sharpened even when the dark side is near-black.
fn hard_edge_weight(image: &RgbaImage, x: u32, y: u32, min_alpha: u8) -> f32 {
    let w = image.width();
    let h = image.height();
    let mut lumas = [0u8; 9];
    let mut n = 0usize;
    let mut min_l = 255u8;
    let mut max_l = 0u8;
    let mut ink_n = 0u32;
    for dy in -1i32..=1 {
        for dx in -1i32..=1 {
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                continue;
            }
            let p = image.get_pixel(nx as u32, ny as u32).0;
            let ink = is_ink_black(p, min_alpha);
            if ink {
                ink_n = ink_n.saturating_add(1);
            }
            let l = if p[3] < min_alpha || ink {
                0
            } else {
                pixel_luma(p)
            };
            lumas[n] = l;
            n += 1;
            min_l = min_l.min(l);
            max_l = max_l.max(l);
        }
    }
    if n < 3 {
        return 0.0;
    }
    let range = max_l.saturating_sub(min_l);
    if range < 28 {
        return 0.0;
    }
    let lo = min_l.saturating_add(range / 3);
    let hi = max_l.saturating_sub(range / 3);
    let mut low_n = 0u32;
    let mut mid_n = 0u32;
    let mut high_n = 0u32;
    for l in lumas.iter().take(n) {
        if *l <= lo {
            low_n = low_n.saturating_add(1);
        } else if *l >= hi {
            high_n = high_n.saturating_add(1);
        } else {
            mid_n = mid_n.saturating_add(1);
        }
    }
    if mid_n.saturating_mul(2) >= n as u32 {
        return 0.0;
    }
    let weight = if low_n == 0 || high_n == 0 {
        0.12
    } else {
        (1.0 - (mid_n as f32 / n as f32) * 2.0).clamp(0.0, 1.0)
    };
    if ink_n > 0 && high_n > 0 {
        weight.max(0.5)
    } else {
        weight
    }
}

pub(crate) fn sharpen_amount_for_ai_sprite(is_icon: bool) -> f32 {
    if is_icon {
        0.4
    } else {
        1.0
    }
}

/// Two-pass RGB sharpen on hard edges only. Smooth ramps keep their tones so
/// unsharp does not posterize or ring gradients. True-black ink is never lifted
/// (darken-only), so outline cores stay solid.
pub(crate) fn sharpen_ai_upscaled(image: &RgbaImage, amount: f32) -> RgbaImage {
    const GAUSS_AMOUNT: f32 = 1.65;
    const GAUSS_SIGMA: f32 = 0.5;
    const LOCAL_AMOUNT: f32 = 0.7;
    const MIN_ALPHA: u8 = 8;
    let amount = amount.clamp(0.0, 1.0);

    if image.width() < 3 || image.height() < 3 || amount <= 0.0 {
        return image.clone();
    }

    let blurred = image::imageops::blur(image, GAUSS_SIGMA);
    let w = image.width();
    let h = image.height();
    let mut weights = vec![0f32; (w as usize).saturating_mul(h as usize)];
    for y in 0..h {
        for x in 0..w {
            if image.get_pixel(x, y).0[3] < MIN_ALPHA {
                continue;
            }
            weights[(y * w + x) as usize] = hard_edge_weight(image, x, y, MIN_ALPHA);
        }
    }

    let mut pass = image.clone();
    for (x, y, pixel) in pass.enumerate_pixels_mut() {
        let src = image.get_pixel(x, y).0;
        if src[3] < MIN_ALPHA {
            continue;
        }
        let weight = weights[(y * w + x) as usize];
        if weight <= 0.0 {
            continue;
        }
        let ink = is_ink_black(src, MIN_ALPHA);
        let b = blurred.get_pixel(x, y).0;
        for c in 0..3 {
            let mut v = f32::from(src[c])
                + (f32::from(src[c]) - f32::from(b[c])) * GAUSS_AMOUNT * amount * weight;
            if ink {
                v = v.min(f32::from(src[c]));
            }
            pixel.0[c] = v.round().clamp(0.0, 255.0) as u8;
        }
        pixel.0[3] = src[3];
    }

    let mut out = pass.clone();
    for y in 0..h {
        for x in 0..w {
            let src = pass.get_pixel(x, y).0;
            if src[3] < MIN_ALPHA {
                continue;
            }
            let weight = weights[(y * w + x) as usize];
            if weight <= 0.0 {
                continue;
            }
            let ink = is_ink_black(src, MIN_ALPHA);
            let mut acc = [0f32; 3];
            let mut n = 0f32;
            for dy in -1i32..=1 {
                for dx in -1i32..=1 {
                    if dx == 0 && dy == 0 {
                        continue;
                    }
                    let nx = x as i32 + dx;
                    let ny = y as i32 + dy;
                    if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                        continue;
                    }
                    let p = pass.get_pixel(nx as u32, ny as u32).0;
                    if p[3] < MIN_ALPHA {
                        continue;
                    }
                    for c in 0..3 {
                        acc[c] += f32::from(p[c]);
                    }
                    n += 1.0;
                }
            }
            if n < 1.0 {
                continue;
            }
            let pixel = out.get_pixel_mut(x, y);
            for c in 0..3 {
                let avg = acc[c] / n;
                let mut v =
                    f32::from(src[c]) + (f32::from(src[c]) - avg) * LOCAL_AMOUNT * amount * weight;
                if ink {
                    v = v.min(f32::from(src[c]));
                }
                pixel.0[c] = v.round().clamp(0.0, 255.0) as u8;
            }
            pixel.0[3] = src[3];
        }
    }
    out
}

pub(crate) fn is_icon_extra_frame(frame_name: &str) -> bool {
    let file = frame_name.rsplit(['/', '\\']).next().unwrap_or(frame_name);
    let lower = file.to_ascii_lowercase();
    let stem = lower.strip_suffix(".png").unwrap_or(&lower);
    stem.ends_with("_extra_001")
}

/// Corner-preserving contour smooth + uniform 1px AA on existing coverage only.
/// Extra frames use occupancy (any hard pixel) so white/light extras get the
/// same secondary-hole treatment as black ink. The first pass never invents
/// coverage. A follow-up pass only raises existing silhouette fringe alpha.
pub(crate) fn smooth_ink_contour(image: &RgbaImage) -> RgbaImage {
    smooth_ink_contour_with_mode(image, false)
}

pub(crate) fn smooth_ink_contour_with_mode(image: &RgbaImage, occupancy: bool) -> RgbaImage {
    const HARD_ALPHA: u8 = 128;
    const MIN_CONTOUR: usize = 8;
    const LOCK_ANGLE_DEG: f32 = 55.0;
    const LAPLACE_ITERS: u32 = 2;
    const LAPLACE_LAMBDA: f32 = 0.35;
    const SUBSAMPLES: u32 = 4;
    const DROP_COVERAGE: f32 = 0.04;

    let w = image.width();
    let h = image.height();
    if w < 3 || h < 3 {
        return image.clone();
    }

    let mut mask = vec![false; (w as usize).saturating_mul(h as usize)];
    for y in 0..h {
        for x in 0..w {
            let p = image.get_pixel(x, y).0;
            let hard = if occupancy {
                p[3] >= HARD_ALPHA
            } else {
                is_ink_black(p, HARD_ALPHA)
            };
            if hard {
                mask[(y * w + x) as usize] = true;
            }
        }
    }

    let contours = extract_ink_contours(&mask, w, h, MIN_CONTOUR);
    let holes = extract_secondary_holes(image, &mask, w, h, MIN_CONTOUR);
    if contours.is_empty() && holes.is_empty() {
        let haze = clear_soft_ink_haze(image, HARD_ALPHA);
        if occupancy {
            return refine_outline_boundary_aa(&haze, true);
        }
        let solid = close_nearly_opaque_ink_cores(&haze);
        return refine_outline_boundary_aa(&solid, false);
    }

    let smoothed_outers: Vec<Vec<(f32, f32)>> = contours
        .into_iter()
        .map(|c| smooth_contour_laplacian_locked(c, LOCK_ANGLE_DEG, LAPLACE_ITERS, LAPLACE_LAMBDA))
        .collect();
    let smoothed_holes: Vec<Vec<(f32, f32)>> = holes
        .into_iter()
        .map(|c| smooth_contour_laplacian_locked(c, LOCK_ANGLE_DEG, LAPLACE_ITERS, LAPLACE_LAMBDA))
        .collect();

    let mut coverage = vec![0f32; mask.len()];
    rasterize_polygons_max(&smoothed_outers, w, h, SUBSAMPLES, &mut coverage);
    // Secondaries are enclosed transparent windows. Punch them so inner
    // black-to-clear edges get the same 1px AA as the outer silhouette.
    for poly in &smoothed_holes {
        if poly.len() < 3 {
            continue;
        }
        let (min_x, max_x, min_y, max_y) = polygon_bounds(poly, w, h);
        for y in min_y..=max_y {
            for x in min_x..=max_x {
                let hole_cov = polygon_coverage(poly, x, y, SUBSAMPLES);
                let idx = (y * w + x) as usize;
                coverage[idx] = (coverage[idx] - hole_cov).clamp(0.0, 1.0);
            }
        }
    }

    let mut out = image.clone();
    for y in 0..h {
        for x in 0..w {
            let src = image.get_pixel(x, y).0;
            let idx = (y * w + x) as usize;
            let hard = mask[idx];
            let soft = src[3] > 0 && src[3] < HARD_ALPHA && (occupancy || is_ink_black(src, 1));
            let skip_fill = !occupancy && src[3] > 0 && !is_ink_black(src, 1);

            if skip_fill || src[3] == 0 || is_white_rgb(src) {
                // Never invent coverage, and never touch white at any opacity.
                continue;
            }

            // Deep interior hard coverage: leave RGB/alpha as-is (already solid).
            if hard && !is_mask_boundary(&mask, w, h, x, y) {
                continue;
            }

            let cov = coverage[idx];
            if cov <= DROP_COVERAGE {
                if soft {
                    out.put_pixel(x, y, Rgba([src[0], src[1], src[2], 0]));
                }
                continue;
            }

            // Only reduce alpha for a 1px AA ring. Never raise it.
            let a_cov = (cov * 255.0).round().clamp(0.0, 255.0) as u8;
            let a = a_cov.min(src[3]);
            if a != src[3] {
                out.put_pixel(x, y, Rgba([src[0], src[1], src[2], a]));
            }
        }
    }
    if occupancy {
        refine_outline_boundary_aa(&out, true)
    } else {
        let solid = close_nearly_opaque_ink_cores(&out);
        refine_outline_boundary_aa(&solid, false)
    }
}

fn pixel_is_outside_background(p: [u8; 4]) -> bool {
    p[3] < 8
}

/// True when an ink pixel borders transparency (or the image edge) — the only
/// place fractional alpha is kept for silhouette AA.
fn ink_pixel_faces_outside(image: &RgbaImage, x: u32, y: u32) -> bool {
    let w = image.width();
    let h = image.height();
    for dy in -1i32..=1 {
        for dx in -1i32..=1 {
            if dx == 0 && dy == 0 {
                continue;
            }
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                return true;
            }
            if pixel_is_outside_background(image.get_pixel(nx as u32, ny as u32).0) {
                return true;
            }
        }
    }
    false
}

fn channel_max(pixel: [u8; 4]) -> u8 {
    pixel[0].max(pixel[1]).max(pixel[2])
}

/// Dark neutral ink above the AA band (α ≥ 200). Relaxed luma vs [`is_ink_black`]
/// so sharpened / premultiplied AI strokes still read as outline core.
fn is_opaque_ink_core(pixel: [u8; 4]) -> bool {
    const MIN_CORE_ALPHA: u8 = 200;
    if pixel[3] < MIN_CORE_ALPHA || is_white_rgb(pixel) {
        return false;
    }
    if pixel[3] == 255 {
        // Fully opaque: only true-black RGB (avoids crushing dark gray fill ramps).
        return channel_max(pixel) <= 12 && pixel_chroma(pixel) <= 12;
    }
    pixel_luma(pixel) <= 48 && pixel_chroma(pixel) <= 24
}

fn is_true_solid_core(pixel: [u8; 4], occupancy: bool) -> bool {
    if pixel[3] < 255 || is_white_rgb(pixel) {
        return false;
    }
    if occupancy {
        true
    } else {
        channel_max(pixel) <= 12 && pixel_chroma(pixel) <= 12
    }
}

fn mask_neighbor_count(mask: &[bool], w: u32, h: u32, x: u32, y: u32) -> u32 {
    let mut n = 0u32;
    for dy in -1i32..=1 {
        for dx in -1i32..=1 {
            if dx == 0 && dy == 0 {
                continue;
            }
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                continue;
            }
            if mask[(ny as u32 * w + nx as u32) as usize] {
                n = n.saturating_add(1);
            }
        }
    }
    n
}

/// Raise existing AA-band alpha toward opaque without flattening the ramp.
fn boost_existing_aa_alpha(alpha: u8) -> u8 {
    const GAMMA: f32 = 0.38;
    const MAX_AA_ALPHA: u8 = 230;
    if alpha == 0 || alpha >= MAX_AA_ALPHA {
        return alpha;
    }
    let t = f32::from(alpha) / 255.0;
    let lifted = (t.powf(GAMMA) * 255.0).round() as u8;
    lifted.max(alpha).min(MAX_AA_ALPHA)
}

/// Second pass: make the existing silhouette fringe more opaque.
/// Never writes empty pixels, so the outline cannot grow.
fn refine_outline_boundary_aa(image: &RgbaImage, occupancy: bool) -> RgbaImage {
    const MAX_AA_ALPHA: u8 = 230;
    const MAX_CORE_DIST_SQ: u32 = 8;
    const DEEP_CONCAVE: u32 = 5;

    let w = image.width();
    let h = image.height();
    if w < 3 || h < 3 {
        return image.clone();
    }

    let mut mask = vec![false; (w as usize).saturating_mul(h as usize)];
    for y in 0..h {
        for x in 0..w {
            if is_true_solid_core(image.get_pixel(x, y).0, occupancy) {
                mask[(y * w + x) as usize] = true;
            }
        }
    }
    let dist = dist_sq_to_solid_core(&mask, w, h);

    let mut out = image.clone();
    for y in 0..h {
        for x in 0..w {
            let src = image.get_pixel(x, y).0;
            if src[3] == 0 || src[3] >= MAX_AA_ALPHA {
                continue;
            }
            if is_white_rgb(src) {
                continue;
            }
            if !occupancy && !is_ink_black(src, 1) {
                continue;
            }
            if !ink_pixel_faces_outside(image, x, y) {
                continue;
            }

            let idx = (y * w + x) as usize;
            if dist[idx] == 0 || dist[idx] > MAX_CORE_DIST_SQ {
                continue;
            }
            if mask_neighbor_count(&mask, w, h, x, y) >= DEEP_CONCAVE {
                continue;
            }

            let a = boost_existing_aa_alpha(src[3]);
            if a == src[3] {
                continue;
            }
            let rgb = if occupancy {
                [src[0], src[1], src[2]]
            } else {
                [0, 0, 0]
            };
            out.put_pixel(x, y, Rgba([rgb[0], rgb[1], rgb[2], a]));
        }
    }
    enforce_outline_aa_falloff(&out, occupancy)
}

fn is_outline_aa_fringe(pixel: [u8; 4], occupancy: bool) -> bool {
    if pixel[3] == 0 || pixel[3] == 255 || is_white_rgb(pixel) {
        return false;
    }
    if occupancy {
        true
    } else {
        is_ink_black(pixel, 1)
    }
}

fn dist_sq_to_solid_core(mask: &[bool], w: u32, h: u32) -> Vec<u32> {
    const INF: u32 = u32::MAX / 4;
    const RADIUS: i32 = 4;
    let mut dist = vec![INF; mask.len()];
    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) as usize;
            if mask[idx] {
                dist[idx] = 0;
                continue;
            }
            let mut best = INF;
            for dy in -RADIUS..=RADIUS {
                for dx in -RADIUS..=RADIUS {
                    let nx = x as i32 + dx;
                    let ny = y as i32 + dy;
                    if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                        continue;
                    }
                    if mask[(ny as u32 * w + nx as u32) as usize] {
                        let d = (dx * dx + dy * dy) as u32;
                        if d < best {
                            best = d;
                        }
                    }
                }
            }
            dist[idx] = best;
        }
    }
    dist
}

fn put_fringe_alpha(out: &mut RgbaImage, occupancy: bool, x: u32, y: u32, src: [u8; 4], alpha: u8) {
    let rgb = if occupancy {
        [src[0], src[1], src[2]]
    } else {
        [0, 0, 0]
    };
    out.put_pixel(x, y, Rgba([rgb[0], rgb[1], rgb[2], alpha]));
}

/// Make AA opacity decrease with distance from the solid outline.
/// Existing pixels only: raise too-transparent inner fringe, lower too-opaque outer fringe.
fn enforce_outline_aa_falloff(image: &RgbaImage, occupancy: bool) -> RgbaImage {
    const MAX_AA_ALPHA: u8 = 230;
    const FALLOFF: f32 = 0.68;
    const INF: u32 = u32::MAX / 4;

    let w = image.width();
    let h = image.height();
    if w < 3 || h < 3 {
        return image.clone();
    }

    let mut mask = vec![false; (w as usize).saturating_mul(h as usize)];
    for y in 0..h {
        for x in 0..w {
            if is_true_solid_core(image.get_pixel(x, y).0, occupancy) {
                mask[(y * w + x) as usize] = true;
            }
        }
    }

    let dist = dist_sq_to_solid_core(&mask, w, h);
    let mut fringe = Vec::new();
    for y in 0..h {
        for x in 0..w {
            let src = image.get_pixel(x, y).0;
            if !is_outline_aa_fringe(src, occupancy) {
                continue;
            }
            if !ink_pixel_faces_outside(image, x, y) {
                continue;
            }
            let idx = (y * w + x) as usize;
            if dist[idx] == 0 || dist[idx] >= INF {
                continue;
            }
            fringe.push((dist[idx], x, y, idx));
        }
    }

    let mut out = image.clone();

    // Outside-in: an inner pixel must not be more transparent than a further neighbor.
    fringe.sort_unstable_by(|a, b| b.0.cmp(&a.0).then(a.3.cmp(&b.3)));
    for &(_, x, y, idx) in &fringe {
        let src = out.get_pixel(x, y).0;
        let mut a = src[3];
        for dy in -1i32..=1 {
            for dx in -1i32..=1 {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let nx = x as i32 + dx;
                let ny = y as i32 + dy;
                if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                    continue;
                }
                let nidx = (ny as u32 * w + nx as u32) as usize;
                if dist[nidx] <= dist[idx] {
                    continue;
                }
                let q = out.get_pixel(nx as u32, ny as u32).0;
                if is_outline_aa_fringe(q, occupancy) {
                    a = a.max(q[3]);
                }
            }
        }
        a = a.min(MAX_AA_ALPHA);
        if a != src[3] {
            put_fringe_alpha(&mut out, occupancy, x, y, src, a);
        }
    }

    // Inside-out: a further pixel must be lighter than closer AA (not the solid core).
    fringe.sort_unstable_by(|a, b| a.0.cmp(&b.0).then(a.3.cmp(&b.3)));
    for &(_, x, y, idx) in &fringe {
        let src = out.get_pixel(x, y).0;
        let mut cap = u8::MAX;
        let mut has_aa_inner = false;
        for dy in -1i32..=1 {
            for dx in -1i32..=1 {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let nx = x as i32 + dx;
                let ny = y as i32 + dy;
                if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                    continue;
                }
                let nidx = (ny as u32 * w + nx as u32) as usize;
                if dist[nidx] >= dist[idx] || mask[nidx] {
                    continue;
                }
                let q = out.get_pixel(nx as u32, ny as u32).0;
                if is_outline_aa_fringe(q, occupancy) {
                    has_aa_inner = true;
                    let inner_cap = (f32::from(q[3]) * FALLOFF).round() as u8;
                    cap = cap.min(inner_cap);
                }
            }
        }
        if !has_aa_inner {
            continue;
        }
        let a = src[3].min(cap).max(1);
        if a != src[3] {
            put_fringe_alpha(&mut out, occupancy, x, y, src, a);
        }
    }
    out
}

/// Close leftover holes in already-solid black ink. Does not raise a wide
/// semi-transparent AI smear to opaque — that thickens strokes and kills AA.
fn close_nearly_opaque_ink_cores(image: &RgbaImage) -> RgbaImage {
    let w = image.width();
    let h = image.height();
    let mut out = image.clone();
    for y in 0..h {
        for x in 0..w {
            let src = image.get_pixel(x, y).0;
            if !is_opaque_ink_core(src) {
                continue;
            }
            if src == [0, 0, 0, 255] {
                continue;
            }
            out.put_pixel(x, y, Rgba([0, 0, 0, 255]));
        }
    }
    out
}

fn clear_soft_ink_haze(image: &RgbaImage, hard_alpha: u8) -> RgbaImage {
    let mut out = image.clone();
    for (x, y, pixel) in image.enumerate_pixels() {
        let src = pixel.0;
        if is_white_rgb(src) {
            continue;
        }
        if is_ink_black(src, 1) && src[3] < hard_alpha && ink_pixel_faces_outside(image, x, y) {
            out.put_pixel(x, y, Rgba([0, 0, 0, 0]));
        }
    }
    out
}

fn is_mask_boundary(mask: &[bool], w: u32, h: u32, x: u32, y: u32) -> bool {
    let idx = (y * w + x) as usize;
    if !mask[idx] {
        return false;
    }
    for dy in -1i32..=1 {
        for dx in -1i32..=1 {
            if dx == 0 && dy == 0 {
                continue;
            }
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                return true;
            }
            if !mask[(ny as u32 * w + nx as u32) as usize] {
                return true;
            }
        }
    }
    false
}

fn rasterize_polygons_max(
    polys: &[Vec<(f32, f32)>],
    w: u32,
    h: u32,
    samples: u32,
    coverage: &mut [f32],
) {
    for poly in polys {
        if poly.len() < 3 {
            continue;
        }
        let (min_x, max_x, min_y, max_y) = polygon_bounds(poly, w, h);
        for y in min_y..=max_y {
            for x in min_x..=max_x {
                let cov = polygon_coverage(poly, x, y, samples);
                let idx = (y * w + x) as usize;
                if cov > coverage[idx] {
                    coverage[idx] = cov;
                }
            }
        }
    }
}

fn extract_ink_contours(mask: &[bool], w: u32, h: u32, min_len: usize) -> Vec<Vec<(f32, f32)>> {
    let mut visited = vec![false; mask.len()];
    let mut contours = Vec::new();
    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) as usize;
            if !mask[idx] || visited[idx] {
                continue;
            }
            let mut stack = vec![(x, y)];
            visited[idx] = true;
            let mut cells = Vec::new();
            let mut start = (x, y);
            while let Some((cx, cy)) = stack.pop() {
                cells.push((cx, cy));
                if cy < start.1 || (cy == start.1 && cx < start.0) {
                    start = (cx, cy);
                }
                for dy in -1i32..=1 {
                    for dx in -1i32..=1 {
                        if dx == 0 && dy == 0 {
                            continue;
                        }
                        let nx = cx as i32 + dx;
                        let ny = cy as i32 + dy;
                        if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                            continue;
                        }
                        let nidx = (ny as u32 * w + nx as u32) as usize;
                        if mask[nidx] && !visited[nidx] {
                            visited[nidx] = true;
                            stack.push((nx as u32, ny as u32));
                        }
                    }
                }
            }
            if cells.len() < min_len {
                continue;
            }
            // Prefer a true boundary pixel as Moore start.
            let boundary_start = cells
                .iter()
                .copied()
                .filter(|(cx, cy)| is_mask_boundary(mask, w, h, *cx, *cy))
                .min_by_key(|(cx, cy)| (*cy, *cx))
                .unwrap_or(start);
            if let Some(contour) = moore_trace_contour(mask, w, h, boundary_start, 4) {
                if contour.len() >= min_len {
                    contours.push(contour);
                }
            }
        }
    }
    contours
}

/// Enclosed transparent windows (secondaries). 8-connected ink often merges
/// neighboring strokes, so these inner channels never appear on an outer contour.
fn extract_secondary_holes(
    image: &RgbaImage,
    ink: &[bool],
    w: u32,
    h: u32,
    min_len: usize,
) -> Vec<Vec<(f32, f32)>> {
    let n = ink.len();
    let mut exterior = vec![false; n];
    let mut stack = Vec::new();
    for x in 0..w {
        for y in [0, h.saturating_sub(1)] {
            let idx = (y * w + x) as usize;
            if !ink[idx] && !exterior[idx] {
                exterior[idx] = true;
                stack.push((x, y));
            }
        }
    }
    for y in 0..h {
        for x in [0, w.saturating_sub(1)] {
            let idx = (y * w + x) as usize;
            if !ink[idx] && !exterior[idx] {
                exterior[idx] = true;
                stack.push((x, y));
            }
        }
    }
    // 4-connected so a diagonal ink pinch still encloses a secondary.
    while let Some((x, y)) = stack.pop() {
        for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                continue;
            }
            let nidx = (ny as u32 * w + nx as u32) as usize;
            if !ink[nidx] && !exterior[nidx] {
                exterior[nidx] = true;
                stack.push((nx as u32, ny as u32));
            }
        }
    }

    let mut seen = exterior.clone();
    let mut holes = Vec::new();
    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) as usize;
            if ink[idx] || seen[idx] {
                continue;
            }
            let mut queue = vec![(x, y)];
            seen[idx] = true;
            let mut cells = Vec::new();
            let mut has_fill = false;
            while let Some((cx, cy)) = queue.pop() {
                cells.push((cx, cy));
                let p = image.get_pixel(cx, cy).0;
                if p[3] >= 128 && !is_ink_black(p, 1) {
                    has_fill = true;
                }
                for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                    let nx = cx as i32 + dx;
                    let ny = cy as i32 + dy;
                    if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                        continue;
                    }
                    let nidx = (ny as u32 * w + nx as u32) as usize;
                    if !ink[nidx] && !seen[nidx] {
                        seen[nidx] = true;
                        queue.push((nx as u32, ny as u32));
                    }
                }
            }
            // Fill interiors are not secondaries (color lives in-sprite, not below).
            if has_fill || cells.len() < 4 {
                continue;
            }
            let mut hole_mask = vec![false; n];
            for &(hx, hy) in &cells {
                hole_mask[(hy * w + hx) as usize] = true;
            }
            let start = cells
                .iter()
                .copied()
                .min_by_key(|(hx, hy)| (*hy, *hx))
                .unwrap_or((x, y));
            // Trace the ink rim around the hole (not the hole pixels) so AA
            // lands on black-to-clear, matching outer-edge treatment.
            if let Some((ink_start, back)) = hole_ink_start(ink, w, h, start) {
                if let Some(contour) = moore_trace_contour(ink, w, h, ink_start, back) {
                    if contour.len() >= min_len && contour_hugs_mask(&contour, &hole_mask, w, h) {
                        holes.push(contour);
                    }
                }
            }
        }
    }
    holes
}

fn hole_ink_start(ink: &[bool], w: u32, h: u32, hole: (u32, u32)) -> Option<((u32, u32), usize)> {
    const DX: [i32; 8] = [1, 1, 0, -1, -1, -1, 0, 1];
    const DY: [i32; 8] = [0, 1, 1, 1, 0, -1, -1, -1];
    let (hx, hy) = hole;
    for d in 0..8 {
        let nx = hx as i32 + DX[d];
        let ny = hy as i32 + DY[d];
        if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
            continue;
        }
        if ink[(ny as u32 * w + nx as u32) as usize] {
            // Came from the hole onto this ink pixel.
            return Some(((nx as u32, ny as u32), (d + 4) % 8));
        }
    }
    None
}

fn contour_hugs_mask(contour: &[(f32, f32)], mask: &[bool], w: u32, h: u32) -> bool {
    if contour.is_empty() {
        return false;
    }
    let mut hugs = 0u32;
    for &(fx, fy) in contour {
        let x = fx.floor().clamp(0.0, (w.saturating_sub(1)) as f32) as u32;
        let y = fy.floor().clamp(0.0, (h.saturating_sub(1)) as f32) as u32;
        if touches_true_8(mask, w, h, x, y) {
            hugs = hugs.saturating_add(1);
        }
    }
    hugs.saturating_mul(2) >= contour.len() as u32
}

fn touches_true_8(mask: &[bool], w: u32, h: u32, x: u32, y: u32) -> bool {
    for dy in -1i32..=1 {
        for dx in -1i32..=1 {
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                continue;
            }
            if mask[(ny as u32 * w + nx as u32) as usize] {
                return true;
            }
        }
    }
    false
}

fn moore_trace_contour(
    mask: &[bool],
    w: u32,
    h: u32,
    start: (u32, u32),
    start_back: usize,
) -> Option<Vec<(f32, f32)>> {
    // Clockwise from east.
    const DX: [i32; 8] = [1, 1, 0, -1, -1, -1, 0, 1];
    const DY: [i32; 8] = [0, 1, 1, 1, 0, -1, -1, -1];

    let (sx, sy) = start;
    if !mask[(sy * w + sx) as usize] {
        return None;
    }

    let mut contour = Vec::new();
    let mut cx = sx as i32;
    let mut cy = sy as i32;
    let mut back = start_back % 8;
    let limit = (w as usize).saturating_mul(h as usize).saturating_mul(2);

    loop {
        contour.push((cx as f32 + 0.5, cy as f32 + 0.5));
        let mut found = None;
        for k in 0..8 {
            let d = (back + 1 + k) % 8;
            let nx = cx + DX[d];
            let ny = cy + DY[d];
            if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                continue;
            }
            if mask[(ny as u32 * w + nx as u32) as usize] {
                found = Some((nx, ny, d));
                break;
            }
        }
        let Some((nx, ny, d)) = found else {
            break;
        };
        back = (d + 4) % 8;
        cx = nx;
        cy = ny;
        if cx == sx as i32 && cy == sy as i32 {
            break;
        }
        if contour.len() >= limit {
            break;
        }
    }

    if contour.len() < 3 {
        None
    } else {
        Some(contour)
    }
}

fn turning_angle_deg(a: (f32, f32), b: (f32, f32), c: (f32, f32)) -> f32 {
    let v1x = b.0 - a.0;
    let v1y = b.1 - a.1;
    let v2x = c.0 - b.0;
    let v2y = c.1 - b.1;
    let n1 = (v1x * v1x + v1y * v1y).sqrt();
    let n2 = (v2x * v2x + v2y * v2y).sqrt();
    if n1 < 1e-6 || n2 < 1e-6 {
        return 0.0;
    }
    let cos = ((v1x * v2x + v1y * v2y) / (n1 * n2)).clamp(-1.0, 1.0);
    cos.acos().to_degrees()
}

fn smooth_contour_laplacian_locked(
    mut pts: Vec<(f32, f32)>,
    lock_angle_deg: f32,
    iters: u32,
    lambda: f32,
) -> Vec<(f32, f32)> {
    let n = pts.len();
    if n < 3 {
        return pts;
    }
    let mut locked = vec![false; n];
    for i in 0..n {
        let a = pts[(i + n - 1) % n];
        let b = pts[i];
        let c = pts[(i + 1) % n];
        if turning_angle_deg(a, b, c) >= lock_angle_deg {
            locked[i] = true;
        }
    }
    for _ in 0..iters {
        let mut next = pts.clone();
        for i in 0..n {
            if locked[i] {
                continue;
            }
            let prev = pts[(i + n - 1) % n];
            let cur = pts[i];
            let nxt = pts[(i + 1) % n];
            let mid = ((prev.0 + nxt.0) * 0.5, (prev.1 + nxt.1) * 0.5);
            next[i] = (
                cur.0 + lambda * (mid.0 - cur.0),
                cur.1 + lambda * (mid.1 - cur.1),
            );
        }
        pts = next;
    }
    pts
}

fn polygon_bounds(poly: &[(f32, f32)], w: u32, h: u32) -> (u32, u32, u32, u32) {
    let mut min_x = f32::MAX;
    let mut max_x = f32::MIN;
    let mut min_y = f32::MAX;
    let mut max_y = f32::MIN;
    for &(x, y) in poly {
        min_x = min_x.min(x);
        max_x = max_x.max(x);
        min_y = min_y.min(y);
        max_y = max_y.max(y);
    }
    let x0 = min_x.floor().max(0.0) as u32;
    let y0 = min_y.floor().max(0.0) as u32;
    let x1 = (max_x.ceil() as u32).min(w.saturating_sub(1));
    let y1 = (max_y.ceil() as u32).min(h.saturating_sub(1));
    // Expand one pixel so the outer AA ring is included.
    (
        x0.saturating_sub(1),
        (x1 + 1).min(w.saturating_sub(1)),
        y0.saturating_sub(1),
        (y1 + 1).min(h.saturating_sub(1)),
    )
}

fn point_in_polygon(x: f32, y: f32, poly: &[(f32, f32)]) -> bool {
    let n = poly.len();
    if n < 3 {
        return false;
    }
    let mut inside = false;
    let mut j = n - 1;
    for i in 0..n {
        let (xi, yi) = poly[i];
        let (xj, yj) = poly[j];
        let intersect =
            ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + f32::EPSILON) + xi);
        if intersect {
            inside = !inside;
        }
        j = i;
    }
    inside
}

fn polygon_coverage(poly: &[(f32, f32)], x: u32, y: u32, samples: u32) -> f32 {
    let mut hit = 0u32;
    let inv = 1.0 / samples as f32;
    for sy in 0..samples {
        for sx in 0..samples {
            let px = x as f32 + (sx as f32 + 0.5) * inv;
            let py = y as f32 + (sy as f32 + 0.5) * inv;
            if point_in_polygon(px, py, poly) {
                hit = hit.saturating_add(1);
            }
        }
    }
    hit as f32 / (samples * samples) as f32
}

pub(crate) struct FinishedIconLayers {
    pub composed: RgbaImage,
    pub ai: RgbaImage,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ContourMode {
    None,
    Ink,
    Occupancy,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct FinishPolicy {
    pub sharpen_amount: f32,
    pub contour: ContourMode,
}

impl FinishPolicy {
    pub(crate) fn for_upscaled_sprite(is_icon: bool, frame_name: &str) -> Self {
        if is_icon {
            Self {
                sharpen_amount: sharpen_amount_for_ai_sprite(true),
                contour: if is_icon_extra_frame(frame_name) {
                    ContourMode::Occupancy
                } else {
                    ContourMode::Ink
                },
            }
        } else {
            Self {
                sharpen_amount: sharpen_amount_for_ai_sprite(false),
                contour: ContourMode::None,
            }
        }
    }
}

/// Convenience finish for callers that only know `is_icon`. Extra frames need
/// [`FinishPolicy::for_upscaled_sprite`] so occupancy holes are AA'd.
pub(crate) fn finish_ai_upscaled_sprite(image: &RgbaImage, is_icon: bool) -> RgbaImage {
    finish_ai_upscaled_sprite_layers(image, FinishPolicy::for_upscaled_sprite(is_icon, "")).composed
}

pub(crate) fn finish_ai_upscaled_sprite_layers(
    image: &RgbaImage,
    policy: FinishPolicy,
) -> FinishedIconLayers {
    let trimmed = clear_orthogonally_isolated_pixels(image);
    let sharpened = sharpen_ai_upscaled(&trimmed, policy.sharpen_amount);
    let composed = match policy.contour {
        ContourMode::None => sharpened,
        ContourMode::Ink => smooth_ink_contour_with_mode(&sharpened, false),
        ContourMode::Occupancy => smooth_ink_contour_with_mode(&sharpened, true),
    };
    FinishedIconLayers {
        composed,
        ai: trimmed,
    }
}

pub(crate) fn save_icon_debug_layers(
    dir: &Path,
    stem: &str,
    layers: &FinishedIconLayers,
) -> Result<(), AppError> {
    fs::create_dir_all(dir)?;
    image_io::save_rgba_png_fast(&dir.join(format!("{stem}.ai.png")), &layers.ai)?;
    image_io::save_rgba_png_fast(&dir.join(format!("{stem}.composed.png")), &layers.composed)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sharpen_boosts_edge_contrast_and_keeps_alpha() {
        let mut img = RgbaImage::from_pixel(8, 8, Rgba([20, 20, 20, 255]));
        for y in 0..8 {
            for x in 4..8 {
                img.put_pixel(x, y, Rgba([200, 200, 200, 180]));
            }
        }
        img.put_pixel(0, 0, Rgba([40, 50, 60, 0]));
        let sharp = sharpen_ai_upscaled(&img, 1.0);
        assert_eq!(sharp.get_pixel(0, 0).0, [40, 50, 60, 0]);
        assert_eq!(sharp.get_pixel(7, 3).0[3], 180);
        assert!(sharp.get_pixel(4, 4).0[0] >= img.get_pixel(4, 4).0[0]);
        assert!(sharp.get_pixel(3, 4).0[0] <= img.get_pixel(3, 4).0[0]);
    }

    #[test]
    fn sharpen_does_not_posterize_luma_ramp() {
        let mut img = RgbaImage::new(12, 8);
        for y in 0..8 {
            for x in 0..12 {
                let v = (20 + x * 18) as u8;
                img.put_pixel(x, y, Rgba([v, v, v, 255]));
            }
        }
        let sharp = sharpen_ai_upscaled(&img, 1.0);
        let mid = sharp.get_pixel(6, 4).0[0];
        let src_mid = img.get_pixel(6, 4).0[0];
        assert!((i16::from(mid) - i16::from(src_mid)).unsigned_abs() <= 6);
        assert!(sharp.get_pixel(5, 4).0[0] < sharp.get_pixel(7, 4).0[0]);
    }

    #[test]
    fn sharpen_does_not_lift_black_ink_pixels() {
        let mut img = RgbaImage::from_pixel(8, 8, Rgba([0, 0, 0, 255]));
        for y in 0..8 {
            for x in 4..8 {
                img.put_pixel(x, y, Rgba([220, 220, 220, 255]));
            }
        }
        let full = sharpen_ai_upscaled(&img, 1.0);
        let icon = sharpen_ai_upscaled(&img, sharpen_amount_for_ai_sprite(true));
        assert_eq!(full.get_pixel(2, 4).0, [0, 0, 0, 255]);
        assert_eq!(icon.get_pixel(2, 4).0, [0, 0, 0, 255]);
        assert!(full.get_pixel(5, 4).0[0] >= img.get_pixel(5, 4).0[0]);
        assert!(icon.get_pixel(5, 4).0[0] >= img.get_pixel(5, 4).0[0]);
    }

    #[test]
    fn icon_sharpen_is_weaker_than_full_sharpen() {
        let mut img = RgbaImage::from_pixel(8, 8, Rgba([30, 30, 30, 255]));
        for y in 0..8 {
            for x in 4..8 {
                img.put_pixel(x, y, Rgba([200, 200, 200, 255]));
            }
        }
        let full = sharpen_ai_upscaled(&img, 1.0);
        let icon = sharpen_ai_upscaled(&img, sharpen_amount_for_ai_sprite(true));
        let src = img.get_pixel(4, 4).0[0];
        let full_d = i16::from(full.get_pixel(4, 4).0[0]) - i16::from(src);
        let icon_d = i16::from(icon.get_pixel(4, 4).0[0]) - i16::from(src);
        assert!(full_d >= icon_d, "full {full_d} icon {icon_d}");
        assert!(icon_d >= 0);
    }

    #[test]
    fn smooth_ink_contour_gives_mid_aa_on_diagonal() {
        // Stair-step diagonal ink edge should get fractional AA, not binary snap.
        let mut img = RgbaImage::from_pixel(16, 16, Rgba([0, 0, 0, 0]));
        for y in 2..14 {
            for x in 2..16 {
                if (x as i32) >= (y as i32) - 1 {
                    img.put_pixel(x, y, Rgba([0, 0, 0, 255]));
                }
            }
        }
        let out = smooth_ink_contour(&img);
        let mut mid_aa = 0u32;
        for y in 4..12 {
            for x in 2..14 {
                let a = out.get_pixel(x, y).0[3];
                if a > 20 && a < 235 {
                    mid_aa = mid_aa.saturating_add(1);
                }
            }
        }
        assert!(
            mid_aa >= 3,
            "diagonal must keep a mid-AA ring, found {mid_aa} mid pixels"
        );
    }

    #[test]
    fn smooth_ink_contour_does_not_thicken_past_ai() {
        let mut img = RgbaImage::from_pixel(12, 10, Rgba([0, 0, 0, 0]));
        for y in 2..8 {
            for x in 3..8 {
                img.put_pixel(x, y, Rgba([0, 0, 0, 255]));
            }
            img.put_pixel(2, y, Rgba([0, 0, 0, 90]));
            img.put_pixel(8, y, Rgba([0, 0, 0, 90]));
        }
        let out = smooth_ink_contour(&img);
        for y in 0..10 {
            for x in 0..12 {
                let src = img.get_pixel(x, y).0;
                let dst = out.get_pixel(x, y).0;
                if src[3] == 0 {
                    assert_eq!(dst[3], 0, "must not paint empty at {x},{y}");
                } else if is_ink_black(src, 1) && src[3] < 200 {
                    assert!(
                        dst[3] < 255,
                        "must not solidify AA fringe at {x},{y}: {} -> {}",
                        src[3],
                        dst[3]
                    );
                }
            }
        }
    }

    #[test]
    fn boundary_aa_pass_raises_existing_fringe_without_thickening() {
        let mut img = RgbaImage::from_pixel(16, 12, Rgba([0, 0, 0, 0]));
        for y in 3..9 {
            for x in 5..11 {
                img.put_pixel(x, y, Rgba([0, 0, 0, 255]));
            }
            img.put_pixel(4, y, Rgba([0, 0, 0, 90]));
        }
        let out = refine_outline_boundary_aa(&img, false);
        let fringe = out.get_pixel(4, 5).0[3];
        assert!(
            fringe > 90 && fringe < 255,
            "existing fringe must become more opaque AA, α={fringe}"
        );
        assert_eq!(out.get_pixel(7, 6).0, [0, 0, 0, 255], "interior stays solid");
        assert_eq!(out.get_pixel(3, 5).0[3], 0, "must not add outward pixels");
        for y in 0..12 {
            for x in 0..16 {
                if img.get_pixel(x, y).0[3] == 0 {
                    assert_eq!(
                        out.get_pixel(x, y).0[3],
                        0,
                        "empty must stay empty at {x},{y}"
                    );
                }
            }
        }
    }

    #[test]
    fn outline_aa_falloff_fixes_inverted_opacities() {
        let mut img = RgbaImage::from_pixel(12, 10, Rgba([0, 0, 0, 0]));
        for y in 2..8 {
            for x in 5..9 {
                img.put_pixel(x, y, Rgba([0, 0, 0, 255]));
            }
        }
        // Closer to the core but more transparent than the pixel further out.
        img.put_pixel(4, 5, Rgba([0, 0, 0, 50]));
        img.put_pixel(3, 5, Rgba([0, 0, 0, 170]));
        let out = refine_outline_boundary_aa(&img, false);
        let inner = out.get_pixel(4, 5).0[3];
        let outer = out.get_pixel(3, 5).0[3];
        assert!(inner > 0 && outer > 0, "existing fringe stays occupied");
        assert!(
            inner >= outer,
            "closer fringe must not be more transparent than further: inner={inner} outer={outer}"
        );
        assert!(inner < 255 && outer < 255, "must remain AA, not solid");
        assert_eq!(out.get_pixel(2, 5).0[3], 0, "must not add a third ring");
        assert_eq!(out.get_pixel(6, 5).0, [0, 0, 0, 255], "core stays solid");
    }

    #[test]
    fn close_nearly_opaque_ink_does_not_thicken_soft_smear() {
        let mut img = RgbaImage::from_pixel(14, 10, Rgba([0, 0, 0, 0]));
        for y in 3..7 {
            for x in 3..10 {
                img.put_pixel(x, y, Rgba([0, 0, 0, 110]));
            }
        }
        let out = close_nearly_opaque_ink_cores(&img);
        assert_eq!(out.get_pixel(6, 5).0[3], 110);
    }

    #[test]
    fn close_nearly_opaque_ink_fills_interior_holes() {
        let mut img = RgbaImage::from_pixel(14, 10, Rgba([0, 0, 0, 0]));
        for y in 3..7 {
            for x in 3..10 {
                img.put_pixel(x, y, Rgba([0, 0, 0, 255]));
            }
        }
        img.put_pixel(6, 5, Rgba([0, 0, 0, 210]));
        let out = close_nearly_opaque_ink_cores(&img);
        assert_eq!(out.get_pixel(6, 5).0, [0, 0, 0, 255]);
        assert_eq!(out.get_pixel(3, 5).0, [0, 0, 0, 255]);
    }

    #[test]
    fn close_nearly_opaque_ink_solidifies_high_alpha_on_silhouette() {
        let mut img = RgbaImage::from_pixel(10, 10, Rgba([0, 0, 0, 0]));
        for y in 3..7 {
            img.put_pixel(4, y, Rgba([18, 18, 18, 220]));
        }
        let out = close_nearly_opaque_ink_cores(&img);
        assert_eq!(out.get_pixel(4, 5).0, [0, 0, 0, 255]);
    }

    #[test]
    fn close_nearly_opaque_ink_normalizes_opaque_near_black_rgb() {
        let mut img = RgbaImage::from_pixel(8, 8, Rgba([0, 0, 0, 0]));
        img.put_pixel(3, 3, Rgba([8, 8, 8, 255]));
        let out = close_nearly_opaque_ink_cores(&img);
        assert_eq!(out.get_pixel(3, 3).0, [0, 0, 0, 255]);
    }

    #[test]
    fn occupancy_contour_keeps_gray_fill_and_white_rim() {
        let mut img = RgbaImage::from_pixel(16, 16, Rgba([0, 0, 0, 0]));
        for y in 3..13 {
            for x in 3..13 {
                img.put_pixel(x, y, Rgba([255, 255, 255, 255]));
            }
        }
        for y in 5..11 {
            for x in 5..11 {
                img.put_pixel(x, y, Rgba([90, 90, 90, 255]));
            }
        }
        let out = smooth_ink_contour_with_mode(&img, true);
        assert_eq!(out.get_pixel(7, 7).0, [90, 90, 90, 255], "gray fill");
        assert_eq!(out.get_pixel(4, 8).0, [255, 255, 255, 255], "white rim");
    }

    #[test]
    fn smooth_ink_contour_does_not_solidify_soft_stroke_into_thick_ink() {
        let mut img = RgbaImage::from_pixel(14, 10, Rgba([0, 0, 0, 0]));
        for y in 3..7 {
            for x in 3..10 {
                img.put_pixel(x, y, Rgba([0, 0, 0, 110]));
            }
        }
        let out = smooth_ink_contour(&img);
        assert!(
            out.get_pixel(6, 5).0[3] < 200,
            "soft smear must not become a thick opaque core, α={}",
            out.get_pixel(6, 5).0[3]
        );
    }

    #[test]
    fn smooth_ink_contour_keeps_locked_tip() {
        // Filled wedge pointing right — high-curvature tip must remain present.
        let mut img = RgbaImage::from_pixel(20, 14, Rgba([0, 0, 0, 0]));
        for y in 2..12 {
            let dist = (y as i32 - 6).unsigned_abs();
            let xmax = 14u32.saturating_sub(dist);
            for x in 2..=xmax.max(2) {
                img.put_pixel(x, y, Rgba([0, 0, 0, 255]));
            }
        }
        let out = smooth_ink_contour(&img);
        let tip_present = (11..16).any(|x| {
            (4..9).any(|y| {
                let p = out.get_pixel(x, y).0;
                is_ink_black(p, 64)
            })
        });
        assert!(tip_present, "locked tip must not be eroded away");
    }

    #[test]
    fn smooth_ink_contour_clears_concave_corner_mush() {
        let mut img = RgbaImage::from_pixel(10, 10, Rgba([0, 0, 0, 0]));
        for y in 2..8 {
            for x in 2..5 {
                img.put_pixel(x, y, Rgba([0, 0, 0, 255]));
            }
        }
        for y in 5..8 {
            for x in 5..8 {
                img.put_pixel(x, y, Rgba([0, 0, 0, 255]));
            }
        }
        img.put_pixel(4, 4, Rgba([0, 0, 0, 110]));
        let out = smooth_ink_contour(&img);
        assert!(
            out.get_pixel(4, 4).0[3] < 110,
            "concave mush must tighten: α={}",
            out.get_pixel(4, 4).0[3]
        );
        assert_eq!(out.get_pixel(3, 6).0, [0, 0, 0, 255], "interior ink stays");
    }

    #[test]
    fn smooth_ink_contour_treats_secondary_hole_like_outer_edge() {
        // Ink frame with a transparent window — inner black-to-clear is a secondary.
        let mut img = RgbaImage::from_pixel(16, 16, Rgba([0, 0, 0, 0]));
        for y in 2..14 {
            for x in 2..14 {
                img.put_pixel(x, y, Rgba([0, 0, 0, 255]));
            }
        }
        for y in 6..10 {
            for x in 6..10 {
                img.put_pixel(x, y, Rgba([0, 0, 0, 0]));
            }
        }
        img.put_pixel(6, 7, Rgba([0, 0, 0, 110]));
        let out = smooth_ink_contour(&img);
        assert_eq!(out.get_pixel(3, 3).0, [0, 0, 0, 255], "ring body stays");
        assert!(
            out.get_pixel(6, 7).0[3] < 110,
            "secondary haze must drop: α={}",
            out.get_pixel(6, 7).0[3]
        );
        let mut inner_mid = 0u32;
        for y in 5..11 {
            for x in 5..11 {
                let a = out.get_pixel(x, y).0[3];
                if a > 20 && a < 235 {
                    inner_mid = inner_mid.saturating_add(1);
                }
            }
        }
        assert!(
            inner_mid >= 2,
            "secondary hole edge must get mid-AA, found {inner_mid}"
        );
        assert_eq!(out.get_pixel(7, 7).0[3], 0, "secondary window stays empty");
    }

    #[test]
    fn extra_sprite_secondaries_get_occupancy_hole_aa() {
        // White extra body + black rim around a transparent window.
        let mut img = RgbaImage::from_pixel(16, 16, Rgba([0, 0, 0, 0]));
        for y in 2..14 {
            for x in 2..14 {
                img.put_pixel(x, y, Rgba([240, 240, 240, 255]));
            }
        }
        for y in 5..11 {
            for x in 5..11 {
                img.put_pixel(x, y, Rgba([0, 0, 0, 255]));
            }
        }
        for y in 6..10 {
            for x in 6..10 {
                img.put_pixel(x, y, Rgba([0, 0, 0, 0]));
            }
        }
        img.put_pixel(6, 7, Rgba([0, 0, 0, 110]));
        img.put_pixel(4, 4, Rgba([255, 255, 255, 80]));
        let out = finish_ai_upscaled_sprite_layers(
            &img,
            FinishPolicy::for_upscaled_sprite(true, "bird_15_extra_001.png"),
        )
        .composed;
        assert_eq!(
            out.get_pixel(3, 3).0,
            [240, 240, 240, 255],
            "white body stays"
        );
        assert_eq!(
            out.get_pixel(4, 4).0,
            [255, 255, 255, 80],
            "translucent white stays"
        );
        assert!(
            out.get_pixel(6, 7).0[3] < 110,
            "black extra secondary haze must drop: α={}",
            out.get_pixel(6, 7).0[3]
        );
        let mut inner_mid = 0u32;
        for y in 5..11 {
            for x in 5..11 {
                let p = out.get_pixel(x, y).0;
                if is_white_rgb(p) {
                    continue;
                }
                if p[3] > 20 && p[3] < 235 {
                    inner_mid = inner_mid.saturating_add(1);
                }
            }
        }
        assert!(
            inner_mid >= 2,
            "extra secondary hole must get mid-AA on non-white, found {inner_mid}"
        );
        assert_eq!(out.get_pixel(7, 7).0[3], 0, "extra window stays empty");
    }

    #[test]
    fn contour_deblur_leaves_white_pixels_at_any_opacity() {
        let mut img = RgbaImage::from_pixel(12, 10, Rgba([0, 0, 0, 0]));
        for y in 2..8 {
            for x in 2..8 {
                img.put_pixel(x, y, Rgba([0, 0, 0, 255]));
            }
        }
        img.put_pixel(1, 4, Rgba([255, 255, 255, 40]));
        img.put_pixel(2, 3, Rgba([250, 250, 248, 180]));
        img.put_pixel(8, 4, Rgba([255, 255, 255, 255]));
        let ink = smooth_ink_contour(&img);
        let extra = smooth_ink_contour_with_mode(&img, true);
        for (x, y) in [(1, 4), (2, 3), (8, 4)] {
            assert_eq!(ink.get_pixel(x, y).0, img.get_pixel(x, y).0);
            assert_eq!(extra.get_pixel(x, y).0, img.get_pixel(x, y).0);
        }
    }

    #[test]
    fn is_icon_extra_frame_matches_suffix() {
        assert!(is_icon_extra_frame("bird_15_extra_001.png"));
        assert!(is_icon_extra_frame("robot_01_01_extra_001"));
        assert!(is_icon_extra_frame(r"icons\bird_15_extra_001.png"));
        assert!(!is_icon_extra_frame("bird_15_001.png"));
        assert!(!is_icon_extra_frame("bird_15_2_001.png"));
        assert!(!is_icon_extra_frame("bird_15_glow_001.png"));
    }

    #[test]
    fn smooth_ink_contour_leaves_interior_ink_and_fill() {
        let mut img = RgbaImage::from_pixel(10, 8, Rgba([0, 0, 0, 0]));
        for y in 1..7 {
            for x in 1..5 {
                img.put_pixel(x, y, Rgba([0, 0, 0, 255]));
            }
            for x in 5..9 {
                img.put_pixel(x, y, Rgba([200, 200, 200, 255]));
            }
        }
        img.put_pixel(0, 3, Rgba([0, 0, 0, 100]));
        let out = smooth_ink_contour(&img);
        assert_eq!(out.get_pixel(2, 3).0, [0, 0, 0, 255], "interior ink stays");
        assert_eq!(
            out.get_pixel(6, 3).0,
            [200, 200, 200, 255],
            "light fill stays"
        );
        assert!(
            out.get_pixel(0, 3).0[3] < 100,
            "outer soft haze must drop: α={}",
            out.get_pixel(0, 3).0[3]
        );
    }

    #[test]
    fn finish_icon_applies_contour_smooth_non_icon_skips() {
        let mut img = RgbaImage::from_pixel(10, 8, Rgba([0, 0, 0, 0]));
        for y in 2..6 {
            for x in 2..6 {
                img.put_pixel(x, y, Rgba([0, 0, 0, 255]));
            }
        }
        img.put_pixel(1, 3, Rgba([0, 0, 0, 90]));
        let icon = finish_ai_upscaled_sprite(&img, true);
        let other = finish_ai_upscaled_sprite(&img, false);
        assert!(
            icon.get_pixel(1, 3).0[3] < 90,
            "icons run contour smooth: {:?}",
            icon.get_pixel(1, 3).0
        );
        assert_eq!(
            other.get_pixel(1, 3).0[3],
            90,
            "non-icons keep original fringe alpha"
        );
    }

    #[test]
    fn icon_trim_clears_pixels_without_orthogonal_neighbor() {
        let mut img = RgbaImage::from_pixel(10, 8, Rgba([0, 0, 0, 0]));
        for y in 2..6 {
            for x in 2..6 {
                img.put_pixel(x, y, Rgba([80, 80, 80, 255]));
            }
        }
        img.put_pixel(6, 3, Rgba([200, 40, 40, 255]));
        img.put_pixel(7, 1, Rgba([255, 255, 255, 255]));
        img.put_pixel(8, 6, Rgba([30, 30, 30, 90]));
        img.put_pixel(1, 1, Rgba([180, 180, 180, 200]));
        let trimmed = finish_ai_upscaled_sprite(&img, true);
        assert_eq!(
            trimmed.get_pixel(6, 3).0[3],
            255,
            "orthogonal edge must keep"
        );
        assert_eq!(trimmed.get_pixel(7, 1).0[3], 0, "isolated white must drop");
        assert_eq!(trimmed.get_pixel(8, 6).0[3], 0, "isolated dark must drop");
        assert_eq!(
            trimmed.get_pixel(1, 1).0[3],
            0,
            "diagonal-only touch must drop"
        );
        assert_eq!(trimmed.get_pixel(3, 3).0[3], 255);
    }

    #[test]
    fn icon_trim_clears_isolated_pure_white_specks() {
        let mut img = RgbaImage::from_pixel(10, 8, Rgba([0, 0, 0, 0]));
        for y in 2..6 {
            for x in 1..5 {
                img.put_pixel(x, y, Rgba([40, 40, 40, 255]));
            }
        }
        img.put_pixel(8, 1, Rgba([255, 255, 255, 255]));
        img.put_pixel(8, 6, Rgba([255, 255, 255, 180]));
        let trimmed = finish_ai_upscaled_sprite(&img, true);
        assert_eq!(trimmed.get_pixel(8, 1).0[3], 0);
        assert_eq!(trimmed.get_pixel(8, 6).0[3], 0);
        assert_eq!(trimmed.get_pixel(2, 3).0[3], 255);
    }

    #[test]
    fn icon_trim_keeps_white_attached_to_body() {
        let mut img = RgbaImage::from_pixel(10, 8, Rgba([0, 0, 0, 0]));
        for y in 2..6 {
            for x in 2..6 {
                img.put_pixel(x, y, Rgba([80, 80, 80, 255]));
            }
        }
        img.put_pixel(6, 3, Rgba([255, 255, 255, 255]));
        for y in 2..5 {
            for x in 7..10 {
                img.put_pixel(x, y, Rgba([255, 255, 255, 255]));
            }
        }
        let trimmed = finish_ai_upscaled_sprite(&img, true);
        assert_eq!(trimmed.get_pixel(6, 3).0, [255, 255, 255, 255]);
        assert_eq!(trimmed.get_pixel(8, 3).0, [255, 255, 255, 255]);
    }

    #[test]
    fn icon_trim_keeps_orthogonal_pair_even_if_floating() {
        let mut img = RgbaImage::from_pixel(8, 8, Rgba([0, 0, 0, 0]));
        img.put_pixel(1, 1, Rgba([10, 20, 30, 255]));
        img.put_pixel(2, 1, Rgba([40, 50, 60, 200]));
        let trimmed = finish_ai_upscaled_sprite(&img, true);
        assert_eq!(trimmed.get_pixel(1, 1).0[3], 255);
        assert_eq!(trimmed.get_pixel(2, 1).0[3], 200);
    }

    #[test]
    fn icon_trim_leaves_interior_luma_ramp() {
        let mut img = RgbaImage::new(12, 8);
        for y in 0..8 {
            for x in 0..12 {
                let v = (20 + x * 18) as u8;
                img.put_pixel(x, y, Rgba([v, v, v, 255]));
            }
        }
        let trimmed = finish_ai_upscaled_sprite(&img, true);
        for x in 0..12 {
            let src = img.get_pixel(x, 4).0[0];
            let out = trimmed.get_pixel(x, 4).0[0];
            assert!(
                (i16::from(out) - i16::from(src)).unsigned_abs() <= 8,
                "smooth ramp at x={x} drifted too far: {src} -> {out}"
            );
        }
        assert!(trimmed.get_pixel(5, 4).0[0] < trimmed.get_pixel(7, 4).0[0]);
    }

    #[test]
    fn finish_non_icon_sprite_also_trims_isolated_specks() {
        let mut img = RgbaImage::from_pixel(10, 8, Rgba([0, 0, 0, 0]));
        for y in 2..6 {
            for x in 1..5 {
                img.put_pixel(x, y, Rgba([40, 40, 40, 255]));
            }
        }
        img.put_pixel(8, 1, Rgba([255, 255, 255, 255]));
        img.put_pixel(8, 6, Rgba([12, 40, 90, 200]));
        let finished = finish_ai_upscaled_sprite(&img, false);
        assert_eq!(finished.get_pixel(8, 1).0[3], 0);
        assert_eq!(finished.get_pixel(8, 6).0[3], 0);
        assert_eq!(finished.get_pixel(2, 3).0[3], 255);
    }

    #[test]
    fn finish_icon_sprite_trims_then_weaker_sharpen() {
        let mut img = RgbaImage::from_pixel(10, 8, Rgba([0, 0, 0, 0]));
        for y in 2..6 {
            for x in 4..9 {
                img.put_pixel(x, y, Rgba([210, 210, 210, 255]));
            }
        }
        for y in 2..6 {
            img.put_pixel(2, y, Rgba([0, 0, 0, 255]));
            img.put_pixel(3, y, Rgba([80, 80, 80, 255]));
        }
        let finished = finish_ai_upscaled_sprite(&img, true);
        assert_eq!(finished.get_pixel(2, 3).0, [0, 0, 0, 255]);
        assert!(finished.get_pixel(6, 3).0[0] >= 200);
        let icon_amt = sharpen_amount_for_ai_sprite(true);
        let full_amt = sharpen_amount_for_ai_sprite(false);
        assert!(icon_amt > 0.0 && icon_amt < full_amt);
    }

    #[test]
    fn finish_keeps_ai_colors_without_ink_rebuild() {
        let mut ai = RgbaImage::from_pixel(16, 16, Rgba([0, 0, 0, 0]));
        for y in 2..14 {
            ai.put_pixel(4, y, Rgba([0, 0, 0, 255]));
            ai.put_pixel(5, y, Rgba([40, 40, 40, 200]));
            ai.put_pixel(6, y, Rgba([90, 90, 90, 255]));
            ai.put_pixel(7, y, Rgba([180, 200, 220, 255]));
        }
        let layers = finish_ai_upscaled_sprite_layers(
            &ai,
            FinishPolicy::for_upscaled_sprite(true, "bird_15_001.png"),
        );
        assert_eq!(layers.ai.get_pixel(4, 8).0, [0, 0, 0, 255]);
        assert_eq!(layers.composed.get_pixel(4, 8).0, [0, 0, 0, 255]);
        let fill = layers.composed.get_pixel(7, 8).0;
        assert!(
            fill[0] >= 160 && fill[2] >= 180,
            "AI fill must pass through finish unchanged aside from sharpen: {fill:?}"
        );
        assert_ne!(
            layers.composed.get_pixel(6, 8).0,
            [0, 0, 0, 255],
            "gray AI pixels must not be stamped solid black"
        );
    }

    #[test]
    fn finish_policy_selects_contour_mode() {
        assert_eq!(
            FinishPolicy::for_upscaled_sprite(true, "bird_15_extra_001.png").contour,
            ContourMode::Occupancy
        );
        assert_eq!(
            FinishPolicy::for_upscaled_sprite(true, "bird_15_001.png").contour,
            ContourMode::Ink
        );
        assert_eq!(
            FinishPolicy::for_upscaled_sprite(false, "GJ_square_001.png").contour,
            ContourMode::None
        );
    }
}
