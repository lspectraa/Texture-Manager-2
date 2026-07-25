/**
 * Re-export ParticleConfig and utilities from the canonical domain module.
 * Exists so legacy imports from "./particleConfig" in this folder continue to work.
 */
export type { EmitterType, ParticleConfig, BlendPreset } from "../domain/particleConfig";
export {
  DEFAULT_PARTICLE_CONFIG,
  defaultParticleConfig,
  GL_BLEND_LABELS,
  BLEND_PRESETS,
  blendToCompositeOp,
  getEmissionRate,
} from "../domain/particleConfig";
