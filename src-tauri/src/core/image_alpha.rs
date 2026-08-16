//! Shared alpha occupancy helpers for sprite quality passes.
//!
//! Isolated-pixel cleanup is canvas-preserving (unlike merger bbox crop). Any
//! tool that writes sprites can call [`clear_orthogonally_isolated_pixels`]
//! without depending on the upscaler sidecar.

use image::RgbaImage;

#[inline]
pub fn is_occupied(pixel: [u8; 4]) -> bool {
    pixel[3] > 0
}

/// Clear pixels that have no orthogonal (4-connected) occupied neighbor.
///
/// Lone dots and diagonal-only specks are removed, RGB and alpha. A floating
/// 2-pixel pair that shares an edge is kept. Canvas size is unchanged — this
/// is not bbox trim. Zeroing RGB matters for tools (Glow Maker) that treat
/// colored fully-transparent pixels as occupied.
pub fn clear_orthogonally_isolated_pixels(image: &RgbaImage) -> RgbaImage {
    let w = image.width();
    let h = image.height();
    if w == 0 || h == 0 {
        return image.clone();
    }

    let mut out = image.clone();
    let src = image.as_raw();
    let dst = out.as_mut();
    let stride = (w as usize).saturating_mul(4);

    for y in 0..h {
        let row = (y as usize).saturating_mul(stride);
        for x in 0..w {
            let i = row.saturating_add((x as usize).saturating_mul(4));
            if src.get(i + 3).copied().unwrap_or(0) == 0 {
                continue;
            }
            // Neighbor alphas in the packed RGBA buffer: left at i-1, right at i+7.
            let left = x > 0 && src.get(i.saturating_sub(1)).copied().unwrap_or(0) > 0;
            let right = x + 1 < w && src.get(i + 7).copied().unwrap_or(0) > 0;
            let up = y > 0
                && src
                    .get(i.saturating_sub(stride).saturating_add(3))
                    .copied()
                    .unwrap_or(0)
                    > 0;
            let down = y + 1 < h
                && src
                    .get(i.saturating_add(stride).saturating_add(3))
                    .copied()
                    .unwrap_or(0)
                    > 0;
            if !(left || right || up || down) {
                if let Some(px) = dst.get_mut(i..i.saturating_add(4)) {
                    px.fill(0);
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::clear_orthogonally_isolated_pixels;
    use super::is_occupied;
    use image::{Rgba, RgbaImage};

    #[test]
    fn occupied_is_any_nonzero_alpha() {
        assert!(is_occupied([0, 0, 0, 1]));
        assert!(is_occupied([255, 255, 255, 40]));
        assert!(!is_occupied([255, 255, 255, 0]));
    }

    #[test]
    fn clears_pixels_without_orthogonal_neighbor() {
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
        let trimmed = clear_orthogonally_isolated_pixels(&img);
        assert_eq!(
            trimmed.get_pixel(6, 3).0[3],
            255,
            "orthogonal edge must keep"
        );
        assert_eq!(
            trimmed.get_pixel(7, 1).0,
            [0, 0, 0, 0],
            "isolated white must drop"
        );
        assert_eq!(
            trimmed.get_pixel(8, 6).0,
            [0, 0, 0, 0],
            "isolated dark must drop"
        );
        assert_eq!(
            trimmed.get_pixel(1, 1).0,
            [0, 0, 0, 0],
            "diagonal-only touch must drop"
        );
        assert_eq!(trimmed.get_pixel(3, 3).0[3], 255);
    }

    #[test]
    fn clears_isolated_pure_white_specks() {
        let mut img = RgbaImage::from_pixel(10, 8, Rgba([0, 0, 0, 0]));
        for y in 2..6 {
            for x in 1..5 {
                img.put_pixel(x, y, Rgba([40, 40, 40, 255]));
            }
        }
        img.put_pixel(8, 1, Rgba([255, 255, 255, 255]));
        img.put_pixel(8, 6, Rgba([255, 255, 255, 180]));
        let trimmed = clear_orthogonally_isolated_pixels(&img);
        assert_eq!(trimmed.get_pixel(8, 1).0, [0, 0, 0, 0]);
        assert_eq!(trimmed.get_pixel(8, 6).0, [0, 0, 0, 0]);
        assert_eq!(trimmed.get_pixel(2, 3).0[3], 255);
    }

    #[test]
    fn keeps_white_attached_to_body() {
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
        let trimmed = clear_orthogonally_isolated_pixels(&img);
        assert_eq!(trimmed.get_pixel(6, 3).0, [255, 255, 255, 255]);
        assert_eq!(trimmed.get_pixel(8, 3).0, [255, 255, 255, 255]);
    }

    #[test]
    fn keeps_orthogonal_pair_even_if_floating() {
        let mut img = RgbaImage::from_pixel(8, 8, Rgba([0, 0, 0, 0]));
        img.put_pixel(1, 1, Rgba([10, 20, 30, 255]));
        img.put_pixel(2, 1, Rgba([40, 50, 60, 200]));
        let trimmed = clear_orthogonally_isolated_pixels(&img);
        assert_eq!(trimmed.get_pixel(1, 1).0[3], 255);
        assert_eq!(trimmed.get_pixel(2, 1).0[3], 200);
    }

    #[test]
    fn does_not_change_canvas_size() {
        let img = RgbaImage::from_pixel(12, 9, Rgba([1, 2, 3, 255]));
        let trimmed = clear_orthogonally_isolated_pixels(&img);
        assert_eq!(trimmed.dimensions(), (12, 9));
    }
}
