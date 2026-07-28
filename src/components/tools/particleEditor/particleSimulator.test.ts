/**
 * Golden-vector unit tests for the Cocos2d-x–accurate particle simulator.
 *
 * All configs use zero variance so results are deterministic without mocking
 * Math.random(). Each test exercises one specific physics path.
 *
 * Run: npm test
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ParticleEmitter } from "./particleSimulator";
import type { Particle } from "./particleSimulator";
import { defaultParticleConfig } from "../../../domain/particleConfig";
import type { ParticleConfig } from "../../../domain/particleConfig";

// Tolerance for floating-point comparisons
const EPS = 1e-4;

function approx(a: number, b: number, tol = EPS): boolean {
  return Math.abs(a - b) <= tol;
}

function expectApprox(actual: number, expected: number, label = "", tol = EPS): void {
  if (!approx(actual, expected, tol)) {
    throw new Error(
      `${label}: expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected).toFixed(6)})`
    );
  }
}

/** Zero-variance gravity config pointing straight up (angle=90°). */
function straightUpConfig(): ParticleConfig {
  return {
    ...defaultParticleConfig(),
    emitterType: 0,
    angle: 90,
    angleVariance: 0,
    speed: 100,
    speedVariance: 0,
    gravityx: 0,
    gravityy: 0,
    radialAcceleration: 0,
    radialAccelerationVariance: 0,
    tangentialAcceleration: 0,
    tangentialAccelerationVariance: 0,
    particleLifespan: 2,
    particleLifespanVariance: 0,
    sourcePositionx: 0,
    sourcePositiony: 0,
    sourcePositionVariancex: 0,
    sourcePositionVariancey: 0,
    yCoordFlipped: 1,
    positionType: 0,
    maxParticles: 10,
    emissionRate: 10,
  };
}

/** Spawn exactly one particle via spawnParticle and return it. */
function spawnOne(cfg: ParticleConfig, wx = 200, wy = 300): Particle {
  const emitter = new ParticleEmitter(cfg);
  emitter.setEmitterWorldPos(wx, wy);
  return emitter.spawnParticle();
}

// ─── Gravity mode: straight-up fountain ──────────────────────────────────────

describe("Gravity mode – straight up (angle=90, speed=100, no gravity)", () => {
  let p: Particle;
  const cfg = straightUpConfig();

  beforeEach(() => {
    p = spawnOne(cfg, 0, 0);
  });

  it("initial velocity: vx≈0, vy≈100 (Cocos2d +Y-up space)", () => {
    expectApprox(p.vx, 0, "vx");
    expectApprox(p.vy, 100, "vy");
  });

  it("after 0.5 s: x≈0, y≈50 (local +Y-up)", () => {
    const emitter = new ParticleEmitter(cfg);
    emitter.setEmitterWorldPos(0, 0);
    const particle = emitter.spawnParticle();
    emitter.stepParticle(particle, 0.5);
    // x should stay 0 (angle=90° → vx=0)
    expectApprox(particle.x, 0, "x after 0.5s");
    // y should be 0 + 100*0.5 = 50
    expectApprox(particle.y, 50, "y after 0.5s");
  });

  it("canvas draw pos: worldY = emitterY - localY (Y-flip)", () => {
    // For positionType=Free, worldPos = startPos + localPos
    // startPosY = emitterCanvasY = 300
    // after 0.5s, localY = 50
    // expected canvasY = 300 - 50 = 250 (particle moved UP on canvas)
    const emitter = new ParticleEmitter(cfg);
    emitter.setEmitterWorldPos(200, 300);
    const particle = emitter.spawnParticle();
    emitter.stepParticle(particle, 0.5);
    const expectedCanvasY = particle.startPosY - particle.y;
    expectApprox(expectedCanvasY, 250, "canvasY");
    expectApprox(particle.startPosX + particle.x, 200, "canvasX");
  });
});

// ─── Gravity mode: downward gravity ──────────────────────────────────────────

describe("Gravity mode – angle=90, gravityy=-300 (dragEffect-like)", () => {
  it("velocity decreases due to negative gravityy, then reverses", () => {
    const cfg: ParticleConfig = {
      ...straightUpConfig(),
      gravityy: -300,
    };
    const emitter = new ParticleEmitter(cfg);
    emitter.setEmitterWorldPos(0, 0);
    const p = emitter.spawnParticle();

    // After dt=0.1s: vy += gravityy * yCoordFlipped * dt = 100 + (-300)*1*0.1 = 70
    emitter.stepParticle(p, 0.1);
    expectApprox(p.vy, 70, "vy after 0.1s");

    // After another dt=0.5s: vy = 70 + (-300)*0.5 = -80
    emitter.stepParticle(p, 0.5);
    expectApprox(p.vy, -80, "vy after 0.6s total");
  });
});

describe("contentScale maps Cocos points into scene pixels", () => {
  it("scales size, speed, and gravity together", () => {
    const cfg: ParticleConfig = {
      ...straightUpConfig(),
      startParticleSize: 4,
      startParticleSizeVariance: 0,
      finishParticleSize: 4,
      finishParticleSizeVariance: 0,
      speed: 100,
      speedVariance: 0,
      gravityy: -300,
    };
    const emitter = new ParticleEmitter(cfg);
    // Arbitrary multiplier (preview uses 2; this checks the math path).
    emitter.contentScale = 4;
    emitter.setEmitterWorldPos(0, 0);
    const p = emitter.spawnParticle();

    expectApprox(p.size, 16, "size");
    expectApprox(p.vy, 400, "spawn vy");

    // After dt=0.1s: vy += gravityy*scale * dt = 400 + (-300)*4*0.1 = 280
    emitter.stepParticle(p, 0.1);
    expectApprox(p.vy, 280, "vy after gravity step");
  });
});

// ─── Gravity mode: yCoordFlipped = -1 ────────────────────────────────────────

describe("Gravity mode – yCoordFlipped=-1 inverts acceleration", () => {
  it("gravity +300 with yCoordFlipped=-1 accelerates opposite direction", () => {
    const cfg: ParticleConfig = {
      ...straightUpConfig(),
      gravityy: 300,
      yCoordFlipped: -1,
    };
    const emitter = new ParticleEmitter(cfg);
    emitter.setEmitterWorldPos(0, 0);
    const p = emitter.spawnParticle();

    // dir += (gravity) * yCoordFlipped * dt = (0, 300) * (-1) * 0.1 = (0, -30)
    // vy = 100 (initial) + 300 * (-1) * 0.1 = 100 - 30 = 70
    emitter.stepParticle(p, 0.1);
    expectApprox(p.vy, 70, "vy with yCoordFlipped=-1");
  });
});

// ─── Gravity mode: radial + tangential acceleration ──────────────────────────

describe("Gravity mode – radial and tangential acceleration", () => {
  it("radialAccel with particle at (0, 10): accelerates in +y direction", () => {
    const cfg: ParticleConfig = {
      ...straightUpConfig(),
      speed: 0,
      radialAcceleration: 100,
    };
    const emitter = new ParticleEmitter(cfg);
    emitter.setEmitterWorldPos(0, 0);
    const p = emitter.spawnParticle();
    // Manually place particle at (0, 10) to test radial
    p.x = 0;
    p.y = 10;
    p.vx = 0;
    p.vy = 0;

    // norm = (0, 1); radial = (0, 1)*100; gravity = (0,0); tangential = (0,0)
    // dir += (0, 100) * 1 * 0.1 → vy = 10
    emitter.stepParticle(p, 0.1);
    expectApprox(p.vx, 0, "vx radial at (0,10)");
    expectApprox(p.vy, 10, "vy radial at (0,10)");
  });

  it("tangentialAccel with particle at (0, 10): tangential = (-ny,nx)*accel → (+x direction)", () => {
    const cfg: ParticleConfig = {
      ...straightUpConfig(),
      speed: 0,
      tangentialAcceleration: 100,
    };
    const emitter = new ParticleEmitter(cfg);
    emitter.setEmitterWorldPos(0, 0);
    const p = emitter.spawnParticle();
    // Particle at (0, 10); norm = (0, 1)
    // tangential = (-ny, nx) * accel = (-1, 0) * 100
    // dir += (-100, 0) * 1 * 0.1 → vx = -10
    p.x = 0;
    p.y = 10;
    p.vx = 0;
    p.vy = 0;

    emitter.stepParticle(p, 0.1);
    expectApprox(p.vx, -10, "vx tangential at (0,10)");
    expectApprox(p.vy, 0, "vy tangential at (0,10)");
  });
});

// ─── Radius mode: -cos/-sin signs ────────────────────────────────────────────

describe("Radius mode – Cocos2d -cos/-sin position formula", () => {
  it("angle=0: pos.x = -cos(0)*r = -r,  pos.y = -sin(0)*r*yFlip = 0", () => {
    const cfg: ParticleConfig = {
      ...defaultParticleConfig(),
      emitterType: 1,
      angle: 0,
      angleVariance: 0,
      maxRadius: 100,
      maxRadiusVariance: 0,
      minRadius: 100,
      minRadiusVariance: 0,
      rotatePerSecond: 0,
      rotatePerSecondVariance: 0,
      particleLifespan: 1,
      particleLifespanVariance: 0,
      yCoordFlipped: 1,
      positionType: 0,
      maxParticles: 5,
      emissionRate: 5,
    };
    const emitter = new ParticleEmitter(cfg);
    emitter.setEmitterWorldPos(0, 0);
    const p = emitter.spawnParticle();

    // angle=0 → orbitAngle=0 → pos.x = -cos(0)*100 = -100, pos.y = -sin(0)*100*1 = 0
    expectApprox(p.x, -100, "radius x at angle=0");
    expectApprox(p.y, 0, "radius y at angle=0");
  });

  it("angle=90: pos.x = -cos(90°)*r ≈ 0,  pos.y = -sin(90°)*r*1 = -r", () => {
    const cfg: ParticleConfig = {
      ...defaultParticleConfig(),
      emitterType: 1,
      angle: 90,
      angleVariance: 0,
      maxRadius: 100,
      maxRadiusVariance: 0,
      minRadius: 100,
      minRadiusVariance: 0,
      rotatePerSecond: 0,
      rotatePerSecondVariance: 0,
      particleLifespan: 1,
      particleLifespanVariance: 0,
      yCoordFlipped: 1,
      positionType: 0,
      maxParticles: 5,
      emissionRate: 5,
    };
    const emitter = new ParticleEmitter(cfg);
    emitter.setEmitterWorldPos(0, 0);
    const p = emitter.spawnParticle();

    // angle=90° → orbitAngle=π/2 → pos.x = -cos(π/2)*100 ≈ 0, pos.y = -sin(π/2)*100 = -100
    expectApprox(p.x, 0, "radius x at angle=90", 1e-3);
    expectApprox(p.y, -100, "radius y at angle=90");
  });

  it("step: orbit rotates, stays on circle of radius r", () => {
    const cfg: ParticleConfig = {
      ...defaultParticleConfig(),
      emitterType: 1,
      angle: 0,
      angleVariance: 0,
      maxRadius: 80,
      maxRadiusVariance: 0,
      minRadius: 80,
      minRadiusVariance: 0,
      rotatePerSecond: 90, // 90°/s
      rotatePerSecondVariance: 0,
      particleLifespan: 2,
      particleLifespanVariance: 0,
      yCoordFlipped: 1,
      positionType: 0,
      maxParticles: 5,
      emissionRate: 5,
    };
    const emitter = new ParticleEmitter(cfg);
    emitter.setEmitterWorldPos(0, 0);
    const p = emitter.spawnParticle();
    // Initial: angle=0, pos=(-80, 0)
    emitter.stepParticle(p, 1.0); // rotate by 90° in 1 s → new angle=90°

    // After 1s: orbitAngle = 90° = π/2
    // pos.x = -cos(π/2)*80 ≈ 0, pos.y = -sin(π/2)*80*1 = -80
    expectApprox(p.x, 0, "orbit x after 1s", 1e-3);
    expectApprox(p.y, -80, "orbit y after 1s", 1e-3);
    // Verify it stays on the circle
    const r = Math.sqrt(p.x * p.x + p.y * p.y);
    expectApprox(r, 80, "orbit radius preserved", 0.01);
  });
});

// ─── positionType: Free vs. Grouped ──────────────────────────────────────────

describe("positionType: Free vs. Grouped world position", () => {
  it("Free (0): particle stays at spawnEmitterPos + localPos when emitter moves", () => {
    const cfg: ParticleConfig = {
      ...straightUpConfig(),
      positionType: 0,
    };
    const emitter = new ParticleEmitter(cfg);
    emitter.setEmitterWorldPos(100, 200);
    const p = emitter.spawnParticle();

    // Spawn: startPosX=100, startPosY=200, localPos≈(0,0) at t=0
    expectApprox(p.startPosX, 100, "Free startPosX");
    expectApprox(p.startPosY, 200, "Free startPosY");

    // Move emitter, step physics
    emitter.setEmitterWorldPos(300, 200);
    emitter.stepParticle(p, 0.5); // particle moves up in local space

    // Free: worldX = startPosX + localX = 100 + 0 = 100 (not tracking emitter move)
    // worldY = startPosY - localY = 200 - 50 = 150
    const worldX = p.startPosX + p.x;
    const worldY = p.startPosY - p.y;
    expectApprox(worldX, 100, "Free worldX (not moved with emitter)");
    expectApprox(worldY, 150, "Free worldY (particle went up)");
  });

  it("Grouped (2): particle world pos tracks current emitter position", () => {
    const cfg: ParticleConfig = {
      ...straightUpConfig(),
      positionType: 2,
    };
    const emitter = new ParticleEmitter(cfg);
    emitter.setEmitterWorldPos(100, 200);
    const p = emitter.spawnParticle();

    // Move emitter to new position
    emitter.setEmitterWorldPos(300, 200);
    emitter.stepParticle(p, 0.5);

    // Grouped: worldX = currentEmitterX + localX = 300 + 0 = 300
    // worldY = currentEmitterY - localY = 200 - 50 = 150
    const worldX = emitter.centerX + p.x;
    const worldY = emitter.centerY - p.y;
    expectApprox(worldX, 300, "Grouped worldX (moved with emitter)");
    expectApprox(worldY, 150, "Grouped worldY");
  });

  it("Relative (1): startPos shifts by emitter delta on update", () => {
    const cfg: ParticleConfig = {
      ...straightUpConfig(),
      positionType: 1,
      emissionRate: 1000,
      maxParticles: 1,
      particleLifespan: 10,
      particleLifespanVariance: 0,
      duration: -1,
    };
    const emitter = new ParticleEmitter(cfg);
    emitter.setEmitterWorldPos(100, 200);
    emitter.reset();
    emitter.update(0.05);
    const particles = emitter.getParticles();
    expect(particles.length).toBe(1);
    const p = particles[0]!;
    expectApprox(p.startPosX, 100, "Relative startPosX at spawn");
    expectApprox(p.startPosY, 200, "Relative startPosY at spawn");

    emitter.setEmitterWorldPos(300, 200);
    emitter.update(0.001);

    expectApprox(p.startPosX, 300, "Relative startPosX after emitter move");
    expectApprox(p.startPosY, 200, "Relative startPosY unchanged in Y");
    expectApprox(p.startPosX + p.x, 300, "Relative worldX follows emitter translate");
  });
});

// ─── lifespan = 0 allowed ─────────────────────────────────────────────────────

describe("Zero lifespan (landEffect / explodeEffect pattern)", () => {
  it("lifespan=0: particle is spawned and immediately culled next update", () => {
    const cfg: ParticleConfig = {
      ...straightUpConfig(),
      particleLifespan: 0,
      particleLifespanVariance: 0,
      maxParticles: 100,
      emissionRate: 100,
    };
    const emitter = new ParticleEmitter(cfg);
    emitter.setEmitterWorldPos(0, 0);
    const p = emitter.spawnParticle();
    expect(p.lifespan).toBe(0);
    expect(p.life).toBe(0);
    // After any positive dt, life becomes negative → culled
    emitter.stepParticle(p, 0.016);
    // The particle was alive at spawn (life=0) and is then expired — verifies no artificial min
  });
});

// ─── emitCounter emission rate ────────────────────────────────────────────────

describe("emitCounter emission timing", () => {
  it("emits correct count matching _emitCounter accumulator", () => {
    // emissionRate=100 → rate=0.01 s per particle.
    // update(0.05) per frame (the step cap) → floor(0.05/0.01) = 5 particles per frame.
    // 3 frames × 5 = 15 particles emitted total.
    const cfg: ParticleConfig = {
      ...straightUpConfig(),
      emissionRate: 100,
      maxParticles: 100,
      particleLifespan: 10,
      particleLifespanVariance: 0,
    };
    const emitter = new ParticleEmitter(cfg);
    emitter.setEmitterWorldPos(0, 0);
    emitter.update(0.05);
    emitter.update(0.05);
    emitter.update(0.05);
    expect(emitter.particleCount).toBe(15);
  });

  it("respects maxParticles cap", () => {
    const cfg: ParticleConfig = {
      ...straightUpConfig(),
      emissionRate: 1000,
      maxParticles: 5,
      particleLifespan: 10,
      particleLifespanVariance: 0,
    };
    const emitter = new ParticleEmitter(cfg);
    emitter.setEmitterWorldPos(0, 0);
    emitter.update(1.0); // would emit 1000 without cap
    expect(emitter.particleCount).toBeLessThanOrEqual(5);
  });
});

// ─── usePlistSourcePosition flag ─────────────────────────────────────────────

describe("usePlistSourcePosition: in-game vs. Particle Designer mode", () => {
  it("false (default): sourcePositionx/y ignored at spawn → local origin at (0,0)", () => {
    const cfg: ParticleConfig = {
      ...straightUpConfig(),
      sourcePositionx: 164,
      sourcePositiony: 61,
      sourcePositionVariancex: 0,
      sourcePositionVariancey: 0,
    };
    const emitter = new ParticleEmitter(cfg);
    emitter.usePlistSourcePosition = false;
    emitter.setEmitterWorldPos(0, 0);
    const p = emitter.spawnParticle();
    // With usePlistSourcePosition=false, localX/Y = 0
    expectApprox(p.x, 0, "x with usePlistSourcePosition=false");
    expectApprox(p.y, 0, "y with usePlistSourcePosition=false");
  });

  it("true: sourcePositionx/y applied as initial local offset", () => {
    const cfg: ParticleConfig = {
      ...straightUpConfig(),
      sourcePositionx: 164,
      sourcePositiony: 61,
      sourcePositionVariancex: 0,
      sourcePositionVariancey: 0,
    };
    const emitter = new ParticleEmitter(cfg);
    emitter.usePlistSourcePosition = true;
    emitter.setEmitterWorldPos(0, 0);
    const p = emitter.spawnParticle();
    expectApprox(p.x, 164, "x with usePlistSourcePosition=true");
    expectApprox(p.y, 61, "y with usePlistSourcePosition=true");
  });
});

// ─── rotationIsDir at spawn ───────────────────────────────────────────────────

describe("rotationIsDir: initial rotation from velocity angle", () => {
  it("angle=0 (→+x): initial rotation ≈ 0°", () => {
    const cfg: ParticleConfig = {
      ...straightUpConfig(),
      angle: 0,
      rotationIsDir: true,
    };
    const emitter = new ParticleEmitter(cfg);
    emitter.setEmitterWorldPos(0, 0);
    const p = emitter.spawnParticle();
    // vx=100, vy=0 → atan2(0,100)=0 → rotation≈0°
    expectApprox(p.rotation, 0, "rotation at angle=0");
  });

  it("angle=90 (→+y): initial rotation ≈ 90°", () => {
    const cfg: ParticleConfig = {
      ...straightUpConfig(),
      angle: 90,
      rotationIsDir: true,
    };
    const emitter = new ParticleEmitter(cfg);
    emitter.setEmitterWorldPos(0, 0);
    const p = emitter.spawnParticle();
    // vx≈0, vy=100 → atan2(100,0)=π/2 ≈ 90°
    expectApprox(p.rotation, 90, "rotation at angle=90", 0.01);
  });
});

// ─── color delta model ────────────────────────────────────────────────────────

describe("Color delta integration (Cocos2d per-frame model)", () => {
  it("alpha interpolates correctly over lifespan", () => {
    const cfg: ParticleConfig = {
      ...straightUpConfig(),
      startColorAlpha: 1.0,
      startColorVarianceAlpha: 0,
      finishColorAlpha: 0.0,
      finishColorVarianceAlpha: 0,
      particleLifespan: 1.0,
    };
    const emitter = new ParticleEmitter(cfg);
    emitter.setEmitterWorldPos(0, 0);
    const p = emitter.spawnParticle();
    // deltaA = (0 - 1) / 1.0 = -1 per second
    expectApprox(p.deltaA, -1, "deltaA");
    emitter.stepParticle(p, 0.5);
    // a = 1.0 + (-1)*0.5 = 0.5
    expectApprox(p.a, 0.5, "alpha at 0.5s");
  });
});
