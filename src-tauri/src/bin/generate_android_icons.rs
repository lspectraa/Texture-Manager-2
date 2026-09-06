use image::{imageops, Rgba, RgbaImage};
use std::fs;
use std::path::Path;

struct DensityConfig {
    name: &'static str,
    legacy_size: u32,
    fg_size: u32,
    emblem_fg_size: u32,
    emblem_legacy_size: u32,
    corner_radius: f32,
}

fn main() {
    println!("Generating authentic Android app icons (Untouched emblem placed on Dark Mode UI background)...");

    let emblem_path = Path::new("../branding/extracted_emblem_1000.png");
    if !emblem_path.exists() {
        panic!("extracted_emblem_1000.png not found!");
    }
    // Load the authentic, untouched main emblem (original colors, no recoloring, no overlaid glow)
    let raw_emblem = image::open(emblem_path).unwrap().to_rgba8();

    let configs = [
        DensityConfig {
            name: "mipmap-mdpi",
            legacy_size: 48,
            fg_size: 108,
            emblem_fg_size: 50,
            emblem_legacy_size: 34,
            corner_radius: 8.0,
        },
        DensityConfig {
            name: "mipmap-hdpi",
            legacy_size: 72,
            fg_size: 162,
            emblem_fg_size: 75,
            emblem_legacy_size: 51,
            corner_radius: 12.0,
        },
        DensityConfig {
            name: "mipmap-xhdpi",
            legacy_size: 96,
            fg_size: 216,
            emblem_fg_size: 100,
            emblem_legacy_size: 68,
            corner_radius: 16.0,
        },
        DensityConfig {
            name: "mipmap-xxhdpi",
            legacy_size: 144,
            fg_size: 324,
            emblem_fg_size: 150,
            emblem_legacy_size: 102,
            corner_radius: 24.0,
        },
        DensityConfig {
            name: "mipmap-xxxhdpi",
            legacy_size: 192,
            fg_size: 432,
            emblem_fg_size: 200,
            emblem_legacy_size: 136,
            corner_radius: 32.0,
        },
    ];

    let base_out = Path::new("icons/android");

    for cfg in &configs {
        let dir = base_out.join(cfg.name);
        fs::create_dir_all(&dir).expect("create dir");

        // A. Adaptive Icon Background (108dp x 108dp, full-bleed separate layer)
        // Includes authentic Dark Mode UI palette: midnight navy base, electric blue, pink (--tm-orb-d), purple, cyan
        let bg = create_dark_mode_ui_background(cfg.fg_size);
        bg.save(dir.join("ic_launcher_background.png"))
            .expect("save background");

        // B. Adaptive Icon Foreground (108dp x 108dp, separate layer)
        // The main icon is placed on a completely transparent canvas, untouched with zero glow applied on top.
        let fg_emblem = imageops::resize(
            &raw_emblem,
            cfg.emblem_fg_size,
            cfg.emblem_fg_size,
            imageops::FilterType::Lanczos3,
        );
        let mut fg = RgbaImage::new(cfg.fg_size, cfg.fg_size);
        let fg_off_x = (cfg.fg_size - cfg.emblem_fg_size) / 2;
        let fg_off_y = (cfg.fg_size - cfg.emblem_fg_size) / 2;
        imageops::overlay(&mut fg, &fg_emblem, fg_off_x as i64, fg_off_y as i64);
        fg.save(dir.join("ic_launcher_foreground.png"))
            .expect("save foreground");

        // C. Legacy Square Icon (rounded rect: clean emblem placed on top of background)
        let leg_emblem = imageops::resize(
            &raw_emblem,
            cfg.emblem_legacy_size,
            cfg.emblem_legacy_size,
            imageops::FilterType::Lanczos3,
        );
        let legacy_bg = create_dark_mode_ui_background(cfg.legacy_size);
        let legacy_sq = create_legacy_squircle(
            &legacy_bg,
            &leg_emblem,
            cfg.legacy_size,
            cfg.emblem_legacy_size,
            cfg.corner_radius,
        );
        legacy_sq
            .save(dir.join("ic_launcher.png"))
            .expect("save legacy square");

        // D. Legacy Round Icon (circle: clean emblem placed on top of background)
        let legacy_round = create_legacy_round(
            &legacy_bg,
            &leg_emblem,
            cfg.legacy_size,
            cfg.emblem_legacy_size,
        );
        legacy_round
            .save(dir.join("ic_launcher_round.png"))
            .expect("save legacy round");

        println!("Generated all icon variants for {}", cfg.name);
    }

    // 2. Write adaptive icon XMLs (API 26+)
    let anydpi_dir = base_out.join("mipmap-anydpi-v26");
    fs::create_dir_all(&anydpi_dir).expect("create anydpi dir");
    let adaptive_xml = r#"<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@mipmap/ic_launcher_background"/>
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
"#;
    fs::write(anydpi_dir.join("ic_launcher.xml"), adaptive_xml).expect("write ic_launcher.xml");
    fs::write(anydpi_dir.join("ic_launcher_round.xml"), adaptive_xml)
        .expect("write ic_launcher_round.xml");

    // 3. Write background color XML fallback (#1d1834: dark theme purple)
    let values_dir = base_out.join("values");
    fs::create_dir_all(&values_dir).expect("create values dir");
    let color_xml = r#"<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="ic_launcher_background">#1d1834</color>
</resources>
"#;
    fs::write(values_dir.join("ic_launcher_background.xml"), color_xml)
        .expect("write ic_launcher_background.xml");

    println!("All Android app icons generated successfully!");
}

/// Creates the authentic Dark Mode UI background:
/// Base: Deep midnight navy (--tm-bg-0: #070a17 to --tm-bg-1: #0d1832)
/// Top-left: Luminous electric blue glow (--tm-accent / --tm-orb-a: #79b7ff)
/// Top-right: Luminous hot pink/magenta glow (--tm-orb-d: #ff89db) - prominently visible inside Pixel launcher circle!
/// Bottom-right: Rich purple/violet glow (--tm-orb-b / --tm-accent-2: #8f7cff) - visible inside Pixel circle!
/// Bottom-left: Vibrant cyan/teal glow (--tm-orb-c / --tm-accent-3: #5de0c8)
/// Center: Clean midnight navy providing crisp contrast without glowing over the emblem.
fn create_dark_mode_ui_background(size: u32) -> RgbaImage {
    let mut img = RgbaImage::new(size, size);
    let s = size as f32;

    for y in 0..size {
        for x in 0..size {
            let xf = x as f32;
            let yf = y as f32;

            // 1. Base deep midnight navy: #070a17 (7, 10, 23) to #0d1832 (13, 24, 50)
            let t = (xf * 0.45 + yf * 0.55) / s;
            let (mut r, mut g, mut b) = lerp3(7.0, 10.0, 23.0, 13.0, 24.0, 50.0, t);

            // 2. Luminous electric blue atmospheric glow (--tm-accent #79b7ff: 121, 183, 255)
            // Upper-left, comfortably inside Pixel's visible circle
            let g_blue_x = s * 0.32;
            let g_blue_y = s * 0.30;
            let g_blue_rad = s * 0.60;
            let d_blue = ((xf - g_blue_x).powi(2) + (yf - g_blue_y).powi(2)).sqrt();
            if d_blue < g_blue_rad {
                let f = (1.0 - d_blue / g_blue_rad).powf(1.8) * 0.42;
                r += 121.0 * f;
                g += 183.0 * f;
                b += 255.0 * f;
            }

            // 3. Luminous hot pink / magenta atmospheric glow (--tm-orb-d #ff89db: 255, 137, 219)
            // Upper-right, prominently positioned within Pixel circular mask
            let g_pink_x = s * 0.68;
            let g_pink_y = s * 0.36;
            let g_pink_rad = s * 0.55;
            let d_pink = ((xf - g_pink_x).powi(2) + (yf - g_pink_y).powi(2)).sqrt();
            if d_pink < g_pink_rad {
                let f = (1.0 - d_pink / g_pink_rad).powf(1.8) * 0.38;
                r += 255.0 * f;
                g += 137.0 * f;
                b += 219.0 * f;
            }

            // 4. Soft purple/violet atmospheric glow (--tm-orb-b / --tm-accent-2 #8f7cff: 143, 124, 255)
            // Lower-right, positioned within Pixel circular mask
            let g_purple_x = s * 0.65;
            let g_purple_y = s * 0.68;
            let g_purple_rad = s * 0.55;
            let d_purple = ((xf - g_purple_x).powi(2) + (yf - g_purple_y).powi(2)).sqrt();
            if d_purple < g_purple_rad {
                let f = (1.0 - d_purple / g_purple_rad).powf(1.8) * 0.36;
                r += 143.0 * f;
                g += 124.0 * f;
                b += 255.0 * f;
            }

            // 5. Vibrant cyan/teal atmospheric glow (--tm-accent-3 #5de0c8: 93, 224, 200)
            // Lower-left, positioned within Pixel circular mask
            let g_cyan_x = s * 0.33;
            let g_cyan_y = s * 0.68;
            let g_cyan_rad = s * 0.55;
            let d_cyan = ((xf - g_cyan_x).powi(2) + (yf - g_cyan_y).powi(2)).sqrt();
            if d_cyan < g_cyan_rad {
                let f = (1.0 - d_cyan / g_cyan_rad).powf(1.8) * 0.36;
                r += 93.0 * f;
                g += 224.0 * f;
                b += 200.0 * f;
            }

            let ru = r.round().min(255.0) as u8;
            let gu = g.round().min(255.0) as u8;
            let bu = b.round().min(255.0) as u8;
            img.put_pixel(x, y, Rgba([ru, gu, bu, 255]));
        }
    }

    img
}

fn lerp3(r1: f32, g1: f32, b1: f32, r2: f32, g2: f32, b2: f32, f: f32) -> (f32, f32, f32) {
    let f = f.clamp(0.0, 1.0);
    (r1 + (r2 - r1) * f, g1 + (g2 - g1) * f, b1 + (b2 - b1) * f)
}

fn composite_icon(bg: &RgbaImage, emblem: &RgbaImage, size: u32, emblem_size: u32) -> RgbaImage {
    let mut comp = bg.clone();
    let off_x = (size - emblem_size) / 2;
    let off_y = (size - emblem_size) / 2;

    for y in 0..emblem.height() {
        for x in 0..emblem.width() {
            let sp = emblem.get_pixel(x, y);
            if sp[3] > 0 {
                let dx = off_x + x;
                let dy = off_y + y;
                if dx < size && dy < size {
                    blend_pixel(&mut comp, dx, dy, *sp);
                }
            }
        }
    }
    comp
}

/// Creates legacy squircle icon by compositing clean emblem on background and masking to rounded rect
fn create_legacy_squircle(
    bg: &RgbaImage,
    emblem: &RgbaImage,
    size: u32,
    emblem_size: u32,
    radius: f32,
) -> RgbaImage {
    let comp = composite_icon(bg, emblem, size, emblem_size);
    let mut out = RgbaImage::new(size, size);
    let w = size as f32;
    let h = size as f32;
    let r = radius;

    for y in 0..size {
        for x in 0..size {
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;

            let in_tl = px < r && py < r;
            let in_tr = px > w - r && py < r;
            let in_bl = px < r && py > h - r;
            let in_br = px > w - r && py > h - r;

            let mut dist_from_corner = 0.0;
            if in_tl {
                let dx = r - px;
                let dy = r - py;
                dist_from_corner = (dx * dx + dy * dy).sqrt();
            } else if in_tr {
                let dx = px - (w - r);
                let dy = r - py;
                dist_from_corner = (dx * dx + dy * dy).sqrt();
            } else if in_bl {
                let dx = r - px;
                let dy = py - (h - r);
                dist_from_corner = (dx * dx + dy * dy).sqrt();
            } else if in_br {
                let dx = px - (w - r);
                let dy = py - (h - r);
                dist_from_corner = (dx * dx + dy * dy).sqrt();
            }

            let is_corner = in_tl || in_tr || in_bl || in_br;
            let inside = !is_corner || dist_from_corner <= r;

            if inside {
                let mut pixel = *comp.get_pixel(x, y);
                let dist_to_edge = if is_corner {
                    r - dist_from_corner
                } else {
                    px.min(w - px).min(py.min(h - py))
                };

                // Antialiasing on outer edge
                if dist_to_edge < 0.5 {
                    let a = ((dist_to_edge + 0.5) * 255.0).clamp(0.0, 255.0) as u8;
                    pixel[3] = a;
                }

                out.put_pixel(x, y, pixel);
            }
        }
    }

    out
}

/// Creates legacy round icon by compositing clean emblem on background and masking to circle
fn create_legacy_round(
    bg: &RgbaImage,
    emblem: &RgbaImage,
    size: u32,
    emblem_size: u32,
) -> RgbaImage {
    let comp = composite_icon(bg, emblem, size, emblem_size);
    let mut out = RgbaImage::new(size, size);
    let center = size as f32 / 2.0;
    let radius = (size as f32 - 1.0) / 2.0;

    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 + 0.5 - center;
            let dy = y as f32 + 0.5 - center;
            let dist = (dx * dx + dy * dy).sqrt();

            if dist <= radius {
                let mut pixel = *comp.get_pixel(x, y);
                let dist_to_edge = radius - dist;

                // Antialiasing on outer circle edge
                if dist_to_edge < 0.5 {
                    let a = ((dist_to_edge + 0.5) * 255.0).clamp(0.0, 255.0) as u8;
                    pixel[3] = a;
                }

                out.put_pixel(x, y, pixel);
            }
        }
    }

    out
}

fn blend_pixel(img: &mut RgbaImage, x: u32, y: u32, src: Rgba<u8>) {
    let bg = img.get_pixel(x, y);
    let sa = src[3] as f32 / 255.0;
    let ba = bg[3] as f32 / 255.0;

    let out_a = sa + ba * (1.0 - sa);
    if out_a <= 0.0 {
        return;
    }

    let r = (src[0] as f32 * sa + bg[0] as f32 * ba * (1.0 - sa)) / out_a;
    let g = (src[1] as f32 * sa + bg[1] as f32 * ba * (1.0 - sa)) / out_a;
    let b = (src[2] as f32 * sa + bg[2] as f32 * ba * (1.0 - sa)) / out_a;

    img.put_pixel(
        x,
        y,
        Rgba([
            r.round().min(255.0) as u8,
            g.round().min(255.0) as u8,
            b.round().min(255.0) as u8,
            (out_a * 255.0).round().min(255.0) as u8,
        ]),
    );
}
