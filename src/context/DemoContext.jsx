import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DEMO_STEPS } from '../lib/demoScript'

const DemoContext = createContext(null)

export function useDemo() {
  const ctx = useContext(DemoContext)
  if (!ctx) throw new Error('useDemo must be used inside <DemoProvider>')
  return ctx
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Drives the hands-free judge walkthrough. Pages register the actions they can
 * perform (`analyzer:run`, `voting:vote`, …) and the director calls them in
 * script order, spotlighting the element each step refers to.
 */
export function DemoProvider({ children }) {
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [rect, setRect] = useState(null)

  const actions = useRef(new Map())
  const runToken = useRef(0)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  /** Pages call this on mount; returns an unregister function. */
  const registerAction = useCallback((name, fn) => {
    actions.current.set(name, fn)
    return () => {
      if (actions.current.get(name) === fn) actions.current.delete(name)
    }
  }, [])

  // An action may belong to a page that has not mounted yet — wait briefly.
  const callAction = useCallback(async ({ name, arg }) => {
    for (let i = 0; i < 24; i++) {
      const fn = actions.current.get(name)
      if (fn) return fn(arg)
      await wait(125)
    }
    if (import.meta.env.DEV) console.warn(`[demo] action never registered: ${name}`)
    return undefined
  }, [])

  const start = useCallback(() => {
    runToken.current += 1
    setIndex(0)
    setPaused(false)
    setRunning(true)
  }, [])

  const stop = useCallback(() => {
    runToken.current += 1
    setRunning(false)
    setPaused(false)
    setBusy(false)
    setRect(null)
    setIndex(0)
  }, [])

  const next = useCallback(() => {
    runToken.current += 1
    setIndex((i) => (i + 1 < DEMO_STEPS.length ? i + 1 : i))
  }, [])

  const prev = useCallback(() => {
    runToken.current += 1
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  const step = running ? DEMO_STEPS[index] : null

  // Run the current step: route → action → spotlight → advance.
  useEffect(() => {
    if (!running || paused) return undefined
    const token = ++runToken.current
    const alive = () => token === runToken.current
    let timer

    ;(async () => {
      const current = DEMO_STEPS[index]
      if (current.route && current.route !== pathname) {
        navigate(current.route)
        await wait(450)
      }
      if (!alive()) return

      if (current.action) {
        setBusy(true)
        await callAction(current.action)
        setBusy(false)
      }
      if (!alive()) return

      await wait(250)
      if (!alive()) return

      timer = setTimeout(() => {
        if (!alive()) return
        if (index + 1 < DEMO_STEPS.length) setIndex(index + 1)
        else stop()
      }, current.duration)
    })()

    return () => clearTimeout(timer)
    // `pathname` is intentionally excluded: the effect navigates itself, and
    // re-running on the resulting change would restart the step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, paused, index, callAction, navigate, stop])

  // Track the spotlight target while the step is on screen.
  useEffect(() => {
    if (!running || !step?.target) {
      setRect(null)
      return undefined
    }
    let scrolled = false
    const measure = () => {
      const el = document.querySelector(step.target)
      if (!el) return setRect(null)
      if (!scrolled) {
        scrolled = true
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      return undefined
    }
    measure()
    const poll = setInterval(measure, 220)
    window.addEventListener('resize', measure)
    return () => {
      clearInterval(poll)
      window.removeEventListener('resize', measure)
    }
  }, [running, step, busy])

  // Escape always exits — never be trapped in the overlay in front of judges.
  useEffect(() => {
    if (!running) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') stop()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === ' ') {
        e.preventDefault()
        setPaused((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, stop, next, prev])

  const value = useMemo(
    () => ({
      running,
      paused,
      busy,
      index,
      step,
      rect,
      total: DEMO_STEPS.length,
      start,
      stop,
      next,
      prev,
      togglePause: () => setPaused((p) => !p),
      registerAction,
    }),
    [running, paused, busy, index, step, rect, start, stop, next, prev, registerAction],
  )

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}
