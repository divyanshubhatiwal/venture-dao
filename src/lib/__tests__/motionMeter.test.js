import { describe, expect, it } from 'vitest'
import { MOTION_FLOOR, createMotionMeter, frameDelta } from '../kyc/motionMeter'

const W = 64
const H = 48

/** An RGBA frame with a filled disc, so "movement" is a real image changing. */
function disc(cx, cy, r = 14, fg = 221, bg = 34) {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r
      const v = inside ? fg : bg
      const i = (y * W + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return data
}

describe('frameDelta', () => {
  it('is zero for identical frames', () => {
    expect(frameDelta(disc(32, 24), disc(32, 24))).toBe(0)
  })

  it('is zero when there is no previous frame', () => {
    expect(frameDelta(disc(32, 24), null)).toBe(0)
  })

  it('grows with displacement', () => {
    const base = disc(32, 24)
    const small = frameDelta(disc(34, 24), base)
    const large = frameDelta(disc(50, 24), base)
    expect(large).toBeGreaterThan(small)
    expect(small).toBeGreaterThan(0)
  })
})

describe('createMotionMeter', () => {
  it('scores a static image below the floor', () => {
    // A photo held to the lens. Every sample identical.
    const meter = createMotionMeter()
    for (let i = 0; i < 40; i++) meter.push(disc(32, 24))
    expect(meter.score()).toBe(0)
    expect(meter.score()).toBeLessThan(MOTION_FLOOR)
  })

  it('stays below the floor for sensor noise alone', () => {
    // Faint per-pixel jitter, as a static photo under a real sensor produces.
    const meter = createMotionMeter()
    for (let i = 0; i < 40; i++) meter.push(disc(32, 24, 14, 221 + (i % 2), 34 + (i % 2)))
    expect(meter.score()).toBeLessThan(MOTION_FLOOR)
  })

  it('scores a moving subject above the floor', () => {
    const meter = createMotionMeter()
    for (let i = 0; i < 40; i++) meter.push(disc(32 + Math.round(Math.sin(i / 3) * 12), 24))
    expect(meter.score()).toBeGreaterThan(MOTION_FLOOR)
  })

  it('still passes someone who moves, then holds still', () => {
    // The regression this statistic exists for: a lifetime mean lets a long
    // motionless tail drag a genuine attempt under the floor, and the user is
    // then told a still photo was detected.
    const meter = createMotionMeter()
    for (let i = 0; i < 20; i++) meter.push(disc(32 + Math.round(Math.sin(i / 3) * 12), 24))
    for (let i = 0; i < 20; i++) meter.push(disc(32, 24))

    const lifetimeMean = meter.count
    expect(lifetimeMean).toBe(39)
    expect(meter.score()).toBeGreaterThan(MOTION_FLOOR)
  })

  it('does not let one bright flash pass as movement', () => {
    // A light switching on is a single large delta. Movement is repeated.
    const meter = createMotionMeter()
    for (let i = 0; i < 30; i++) meter.push(disc(32, 24))
    meter.push(disc(32, 24, 14, 255, 255))
    for (let i = 0; i < 30; i++) meter.push(disc(32, 24, 14, 255, 255))
    expect(meter.score()).toBeLessThan(MOTION_FLOOR)
  })

  it('reports 0 before there are two frames to compare', () => {
    const meter = createMotionMeter()
    expect(meter.score()).toBe(0)
    meter.push(disc(32, 24))
    expect(meter.count).toBe(0)
    expect(meter.score()).toBe(0)
  })

  it('tracks the present moment in recent(), not the whole session', () => {
    const meter = createMotionMeter()
    for (let i = 0; i < 20; i++) meter.push(disc(32 + Math.round(Math.sin(i / 3) * 12), 24))
    expect(meter.recent()).toBeGreaterThan(MOTION_FLOOR)
    for (let i = 0; i < 20; i++) meter.push(disc(32, 24))
    expect(meter.recent()).toBe(0)
  })

  it('reset clears history so a retry does not inherit the last attempt', () => {
    const meter = createMotionMeter()
    for (let i = 0; i < 20; i++) meter.push(disc(32 + i, 24))
    meter.reset()
    expect(meter.count).toBe(0)
    expect(meter.score()).toBe(0)
  })
})
