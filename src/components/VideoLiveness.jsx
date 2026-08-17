import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Camera, CheckCircle2, Loader2, Video, VideoOff } from 'lucide-react'
import { kycApi } from '../lib/kyc/kycApi'
import { MOTION_FLOOR, createMotionMeter } from '../lib/kyc/motionMeter'

/**
 * Camera liveness check.
 *
 * The video never leaves the browser. Frames are sampled into a small canvas
 * purely to measure movement, and the only thing sent to the server is the
 * result — which prompts were completed, how long it took, and how much motion
 * there was. Face video is biometric data, and not collecting it is easier to
 * get right than collecting it safely.
 *
 * The prompts and their order come from the server and expire in minutes, so a
 * clip recorded in advance cannot contain the right answers.
 *
 * What this establishes is that a live person followed instructions. It does
 * not establish who they are, and the wording never suggests otherwise.
 */

const PROMPT_MS = 3200
const SAMPLE_W = 64
const SAMPLE_H = 48
/** 10 Hz. Deliberately not requestAnimationFrame: rAF is suspended entirely
 *  while a tab is hidden, so sampling would stop dead while the prompt timers
 *  kept running — and the user would be told a still photo was detected. */
const SAMPLE_MS = 100

export default function VideoLiveness({ onPassed }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const samplerRef = useRef(0)
  const meterRef = useRef(createMotionMeter())
  const startedAtRef = useRef(0)

  const [phase, setPhase] = useState('idle') // idle | starting | running | submitting | passed | error
  const [challenge, setChallenge] = useState(null)
  const [promptIndex, setPromptIndex] = useState(0)
  const [motion, setMotion] = useState(0)
  const [error, setError] = useState(null)

  /**
   * Release the camera.
   *
   * Called from every exit path, including unmount. A stream left running keeps
   * the webcam light on after the user has navigated away, which is alarming
   * and entirely avoidable.
   */
  const stopCamera = useCallback(() => {
    clearInterval(samplerRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  /** Draw the current video frame into a tiny offscreen canvas and hand the
   *  pixels to the meter. 64x48 is enough to see a head move and cheap enough
   *  to run on a phone. */
  const sampleMotion = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H)
    meterRef.current.push(ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data)
    setMotion(meterRef.current.recent())
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setPhase('starting')
    meterRef.current.reset()
    setMotion(0)
    setPromptIndex(0)

    let issued
    try {
      issued = await kycApi.videoChallenge()
    } catch (err) {
      setError(err.message)
      setPhase('error')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 480, height: 360, facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch (err) {
      // Named cases, because "camera failed" leaves someone with nothing to do.
      const message =
        err?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow access in your browser and try again.'
          : err?.name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : err?.name === 'NotReadableError'
              ? 'The camera is already in use by another application.'
              : `Could not start the camera: ${err?.message ?? 'unknown error'}`
      setError(message)
      setPhase('error')
      return
    }

    startedAtRef.current = Date.now()
    setChallenge(issued)
    setPhase('running')

    samplerRef.current = setInterval(sampleMotion, SAMPLE_MS)
  }, [sampleMotion])

  /* You cannot observe someone who has switched away, and a score gathered
     across a hidden tab would mean nothing. Stop and say so, rather than
     submitting a number that would be read as evidence. */
  useEffect(() => {
    if (phase !== 'running') return undefined
    const onHide = () => {
      if (document.hidden) {
        stopCamera()
        setError('The check stopped because you switched away from this page. Please start again.')
        setPhase('error')
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [phase, stopCamera])

  /* Advance through the prompts, then submit. Kept in an effect so unmounting
     mid-run cancels cleanly rather than firing a submit into a dead component. */
  useEffect(() => {
    if (phase !== 'running' || !challenge) return undefined

    if (promptIndex >= challenge.prompts.length) {
      setPhase('submitting')
      stopCamera()

      kycApi
        .videoComplete({
          nonce: challenge.nonce,
          completedPrompts: challenge.prompts.map((p) => p.id),
          // Measured, not assumed. Sending prompts × PROMPT_MS would report a
          // constant the server then checks against its duration bounds, which
          // would make that check meaningless.
          durationMs: Date.now() - startedAtRef.current,
          motionScore: meterRef.current.score(),
        })
        .then((record) => {
          setPhase('passed')
          onPassed?.(record)
        })
        .catch((err) => {
          setError(err.message)
          setPhase('error')
        })
      return undefined
    }

    const timer = setTimeout(() => setPromptIndex((i) => i + 1), PROMPT_MS)
    return () => clearTimeout(timer)
  }, [phase, challenge, promptIndex, stopCamera, onPassed])

  const currentPrompt = challenge?.prompts?.[promptIndex]
  const enoughMotion = motion >= MOTION_FLOOR

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2">
        <Video size={15} className="text-brand-300" />
        <p className="label">Video liveness check</p>
      </div>

      {phase === 'idle' && (
        <>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            You’ll be asked to follow three short prompts on camera. The video stays on your device — only the result is
            sent.
          </p>
          <button onClick={start} className="btn-primary mt-3 w-full py-2.5">
            <Camera size={15} />
            Start camera check
          </button>
        </>
      )}

      {(phase === 'starting' || phase === 'running' || phase === 'submitting') && (
        <div className="mt-3">
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black">
            {/* muted + playsInline so mobile browsers autoplay it inline rather
                than taking over the screen with a native player. */}
            <video ref={videoRef} muted playsInline className="h-48 w-full scale-x-[-1] object-cover" />
            {currentPrompt && phase === 'running' && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3 text-center">
                <p className="text-sm font-semibold text-white">{currentPrompt.label}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Step {promptIndex + 1} of {challenge.prompts.length}
                </p>
              </div>
            )}
            {phase === 'submitting' && (
              <div className="absolute inset-0 grid place-items-center bg-black/70">
                <Loader2 size={20} className="animate-spin text-brand-300" />
              </div>
            )}
          </div>

          {phase === 'running' && (
            <>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-brand-400 transition-all duration-300"
                    style={{ width: `${((promptIndex + 1) / challenge.prompts.length) * 100}%` }}
                  />
                </div>
                <span className={`text-[10px] ${enoughMotion ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {enoughMotion ? 'movement detected' : 'move a little more'}
                </span>
              </div>
              {challenge.spokenCode && (
                <p className="mt-2 text-center text-[11px] text-slate-500">
                  Then read this code aloud: <span className="num text-slate-200">{challenge.spokenCode}</span>
                </p>
              )}
            </>
          )}
        </div>
      )}

      {phase === 'passed' && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] p-3">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-300" />
          <div>
            <p className="text-xs font-semibold text-emerald-200">Liveness check passed</p>
            {/* Said plainly here, where someone might otherwise assume the whole
                process just completed. */}
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              A live person completed the challenge. This does not verify your identity — your submission still needs a
              review.
            </p>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="mt-3">
          <p className="flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/[0.08] p-3 text-xs text-rose-200">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            {error}
          </p>
          <button onClick={start} className="btn-ghost btn-sm mt-2 w-full justify-center py-2">
            <VideoOff size={13} />
            Try again
          </button>
        </div>
      )}

      <canvas ref={canvasRef} width={SAMPLE_W} height={SAMPLE_H} className="hidden" />
    </div>
  )
}
