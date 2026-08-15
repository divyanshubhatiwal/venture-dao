import { useEffect, useRef, useState } from 'react'

/**
 * Fades content up as it scrolls into view.
 *
 * The failure mode of every scroll-reveal is content that never appears: the
 * observer needs the page to be compositing frames, so in a backgrounded tab,
 * a hidden pane, or a browser without IntersectionObserver it simply never
 * fires and the section stays at opacity zero forever. Decoration is not worth
 * losing content over, so there are two independent escapes — the feature is
 * skipped entirely when the API is missing, and a timer reveals anything the
 * observer has not reported on within a second regardless.
 */
export default function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (shown) return undefined
    const el = ref.current
    if (!el) return undefined

    const reveal = () => setShown(true)
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Once revealed it stays revealed — re-hiding on scroll-out is motion
        // for its own sake and makes long pages feel unstable.
        if (entry.isIntersecting) {
          reveal()
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    )
    observer.observe(el)

    const failsafe = setTimeout(reveal, 1000)
    return () => {
      observer.disconnect()
      clearTimeout(failsafe)
    }
  }, [shown])

  return (
    <Tag
      ref={ref}
      className={`reveal ${shown ? 'reveal-in' : ''} ${className}`}
      style={shown && delay ? { transitionDelay: `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  )
}
