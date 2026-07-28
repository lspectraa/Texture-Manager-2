import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARTICLE_CONFIG,
  getEmissionRate,
  withSyncedEmissionRate,
} from "./particleConfig";

describe("withSyncedEmissionRate", () => {
  it("sets emissionRate to maxParticles / particleLifespan", () => {
    const synced = withSyncedEmissionRate({
      ...DEFAULT_PARTICLE_CONFIG,
      maxParticles: 200,
      particleLifespan: 2,
      emissionRate: 1,
    });
    expect(synced.emissionRate).toBe(100);
    expect(getEmissionRate(synced)).toBe(100);
  });

  it("uses maxParticles when lifespan is zero", () => {
    const synced = withSyncedEmissionRate({
      ...DEFAULT_PARTICLE_CONFIG,
      maxParticles: 50,
      particleLifespan: 0,
      emissionRate: 999,
    });
    expect(synced.emissionRate).toBe(50);
  });
});
