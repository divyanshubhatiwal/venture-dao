/**
 * Frame-to-frame motion measurement.
 *
 * Separated from the camera component so the arithmetic can be tested against
 * real pixel arrays, rather than only being exercised through a live webcam.
 *
 * The statistic is the MEDIAN of the most active half of samples. Both halves
 * of that matter, and each fixes a way the obvious metric gets someone wrong:
 *
 * Taking only the active half, rather than the lifetime mean, protects the
 * honest user. Someone who follows the prompts and then holds still between
 * them drags their own average under the threshold and is told a still photo
 * was detected. A photo is unaffected — every one of its samples is near zero,
 * so its active half is near zero too.
 *
 * Taking the median of that half, rather than its mean, closes the opposite
 * hole. A single enormous frame — a lamp switching on, auto-exposure settling,
 * one image swapped for another — is one spike among otherwise still frames,
 * and a mean will happily spread it out until it clears the floor. A median
 * does not move for one sample. Liveness is repeated movement, and this is the
 * statistic that says so.
 */

/** Mean per-pixel change, 0–1, below which nothing moved worth counting. */
export const MOTION_FLOOR = 0.02

/** Recent samples behind the live "keep moving" hint. */
const RECENT_WINDOW = 8

/**
 * Mean absolute luminance-channel difference between two RGBA frames, 0–1.
 *
 * Reads one channel in four: colour says nothing about movement, so sampling
 * all four would triple the work for the same answer.
 */
export function frameDelta(current, previous) {
  if (!previous || previous.length !== current.length) return 0
  let total = 0
  for (let i = 0; i < current.length; i += 4) total += Math.abs(current[i] - previous[i])
  return total / (current.length / 4) / 255
}

export function createMotionMeter() {
  const samples = []
  let previous = null

  return {
    /** Feed one RGBA frame. Returns the delta against the frame before it. */
    push(frame) {
      const first = previous === null
      const delta = frameDelta(frame, previous)
      // Copy: canvas getImageData buffers get reused, so holding the reference
      // would compare a frame against itself and measure zero movement.
      previous = frame.slice()
      // The first frame has nothing to compare against; recording its zero
      // would seed the session with a sample that means nothing.
      if (!first) samples.push(delta)
      return delta
    },

    /** The value sent to the server. */
    score() {
      if (samples.length < 2) return 0
      const sorted = [...samples].sort((a, b) => b - a)
      const half = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)))
      return half[Math.floor(half.length / 2)]
    },

    /** Short rolling average, so the on-screen hint tracks the present moment
     *  rather than the whole session. */
    recent() {
      if (!samples.length) return 0
      const window = samples.slice(-RECENT_WINDOW)
      return window.reduce((a, b) => a + b, 0) / window.length
    },

    /** Guards against reporting a confident score built from two samples. */
    get count() {
      return samples.length
    },

    reset() {
      samples.length = 0
      previous = null
    },
  }
}
