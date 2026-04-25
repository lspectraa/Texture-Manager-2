use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Bounds {
    pub left: u32,
    pub top: u32,
    pub right: u32,
    pub bottom: u32,
}

pub fn normalize_rotation(texture_rotated: bool) -> bool {
    if texture_rotated {
        return false;
    }

    texture_rotated
}

pub fn nullify_offset() -> (f32, f32) {
    (0.0, 0.0)
}

pub fn alpha_trim_bounds(alpha_mask: &[Vec<u8>]) -> Option<Bounds> {
    if alpha_mask.is_empty() || alpha_mask[0].is_empty() {
        return None;
    }

    let height = alpha_mask.len() as u32;
    let width = alpha_mask[0].len() as u32;

    let mut left = width;
    let mut top = height;
    let mut right = 0_u32;
    let mut bottom = 0_u32;
    let mut has_opaque = false;

    for (y, row) in alpha_mask.iter().enumerate() {
        for (x, alpha) in row.iter().enumerate() {
            if *alpha > 0 {
                has_opaque = true;
                let x = x as u32;
                let y = y as u32;
                if x < left {
                    left = x;
                }
                if y < top {
                    top = y;
                }
                if x > right {
                    right = x;
                }
                if y > bottom {
                    bottom = y;
                }
            }
        }
    }

    if !has_opaque {
        return None;
    }

    Some(Bounds {
        left,
        top,
        right,
        bottom,
    })
}

#[cfg(test)]
mod tests {
    use super::{alpha_trim_bounds, normalize_rotation, Bounds};

    #[test]
    fn normalize_rotation_makes_rotated_false() {
        assert!(!normalize_rotation(true));
        assert!(!normalize_rotation(false));
    }

    #[test]
    fn trim_bounds_returns_none_for_empty_mask() {
        assert_eq!(alpha_trim_bounds(&[]), None);
        assert_eq!(alpha_trim_bounds(&[vec![]]), None);
    }

    #[test]
    fn trim_bounds_finds_opaque_region() {
        let alpha = vec![
            vec![0, 0, 0, 0],
            vec![0, 255, 255, 0],
            vec![0, 255, 255, 0],
        ];
        assert_eq!(
            alpha_trim_bounds(&alpha),
            Some(Bounds {
                left: 1,
                top: 1,
                right: 2,
                bottom: 2,
            })
        );
    }
}
