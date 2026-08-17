import { useEffect, useRef, useState } from 'react'

const easeOut = (t) => 1 - Math.pow(1 - t, 3)

/**
 * Counts a figure up from zero once it is scrolled into view.
 *
 * Same hazard as Reveal, one step worse: requestAnimationFrame is throttled to
 * a stop in a backgrounded tab, so a naive version leaves the headline number
 * frozen at "0" — actively misleading rather than merely unanimated. The timer
 * below therefore snaps to the true value if the animation has not finished on
 * schedule, and the true value is what renders if the observer never fires.
 */
export default function CountUp({ value, decimals = 0, prefix = '', suffix = '', duration = 1100, className = '' }) {
  const ref = useRef(null)
  const [display, setDisplay] = useState(0)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setDisplay(value)
      return undefined
    }
    const el = ref.current
    if (!el) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setStarted(true)
        observer.disconnect()
      }
    })
    observer.observe(el)
    // The observer only reports when the page is compositing frames, so on a
    // hidden tab it never fires at all and the count never begins — leaving a
    // headline figure reading "0", which is not a missing animation but a wrong
    // number. Start regardless after a beat; the worst case is that a figure
    // below the fold has already counted by the time it is scrolled to.
    const kick = setTimeout(() => setStarted(true), 1200)
    return () => {
      observer.disconnect()
      clearTimeout(kick)
    }
  }, [value])

  useEffect(() => {
    if (!started) return undefined
    let frame = 0
    const from = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - from) / duration)
      setDisplay(value * easeOut(t))
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    // If rAF is throttled (hidden tab) the count never lands — snap it.
    const failsafe = setTimeout(() => setDisplay(value), duration + 400)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(failsafe)
    }
  }, [started, value, duration])

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  )
}
