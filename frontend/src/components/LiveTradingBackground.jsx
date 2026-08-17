import { useEffect, useRef } from 'react'

/**
 * Ultra-Immersive 3D Cyber-Trading Background Canvas.
 * Renders high-voltage neon financial chart waveforms, floating luminous particles,
 * animated isometric depth grid, and glowing multi-asset market trajectories at 60FPS.
 */
export default function LiveTradingBackground({ className = '' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId

    const resize = () => {
      if (!canvas) return
      const rect = canvas.parentElement?.getBoundingClientRect() || {
        width: window.innerWidth,
        height: 750,
      }
      const dpr = window.devicePixelRatio || 1
      canvas.width = (rect.width || window.innerWidth) * dpr
      canvas.height = (rect.height || 750) * dpr
    }

    resize()
    window.addEventListener('resize', resize)

    // Floating liquidity particles
    const particleCount = 45
    const particles = []
    for (let p = 0; p < particleCount; p++) {
      particles.push({
        x: Math.random(),
        y: Math.random(),
        radius: Math.random() * 2.5 + 1,
        speedY: -(Math.random() * 0.0008 + 0.0003),
        speedX: (Math.random() - 0.5) * 0.0004,
        alpha: Math.random() * 0.7 + 0.3,
        color: Math.random() > 0.5 ? '#818cf8' : '#34d399',
      })
    }

    // Dynamic wave points
    const pointCount = 80
    const points = []
    for (let i = 0; i < pointCount; i++) {
      points.push({
        baseY: 0.48 + Math.sin(i * 0.12) * 0.18 + (Math.random() - 0.5) * 0.05,
        phase: Math.random() * Math.PI * 2,
      })
    }

    let time = 0

    const render = () => {
      time += 0.016
      const width = canvas.width
      const height = canvas.height
      const dpr = window.devicePixelRatio || 1

      ctx.clearRect(0, 0, width, height)

      // ── 1. Draw 3D Isometric Cyber Grid Lines ──
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.09)'
      ctx.lineWidth = 1 * dpr
      const gridY = 8
      for (let r = 1; r < gridY; r++) {
        const y = (height / gridY) * r
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }

      const gridX = 14
      const shiftX = (time * 25 * dpr) % (width / gridX)
      for (let c = 0; c <= gridX + 1; c++) {
        const x = c * (width / gridX) - shiftX
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }

      // ── 2. Draw Floating Liquidity Particle Dust ──
      particles.forEach((p) => {
        p.y += p.speedY
        p.x += p.speedX
        if (p.y < 0) p.y = 1
        if (p.x < 0) p.x = 1
        if (p.x > 1) p.x = 0

        const px = p.x * width
        const py = p.y * height
        ctx.beginPath()
        ctx.arc(px, py, p.radius * dpr, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.alpha * (Math.sin(time * 3 + p.radius) * 0.3 + 0.7)
        ctx.shadowColor = p.color
        ctx.shadowBlur = 8 * dpr
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1
      })

      // ── 3. Draw Moving Translucent Volumetric Candlesticks at Bottom ──
      const barCount = 40
      const barW = width / barCount
      for (let b = 0; b < barCount; b++) {
        const barH = (Math.sin(time * 2.2 + b * 0.4) * 0.5 + 0.5) * (height * 0.25) + height * 0.04
        const barX = b * barW + 3 * dpr
        const barY = height - barH
        const isBullish = Math.sin(b * 0.7 + time * 1.5) > -0.1

        ctx.fillStyle = isBullish ? 'rgba(52, 211, 153, 0.16)' : 'rgba(244, 63, 94, 0.16)'
        ctx.fillRect(barX, barY, barW - 6 * dpr, barH)

        // Wick
        ctx.strokeStyle = isBullish ? 'rgba(52, 211, 153, 0.4)' : 'rgba(244, 63, 94, 0.4)'
        ctx.lineWidth = 1.5 * dpr
        ctx.beginPath()
        ctx.moveTo(barX + (barW - 6 * dpr) / 2, barY - 14 * dpr)
        ctx.lineTo(barX + (barW - 6 * dpr) / 2, barY)
        ctx.stroke()
      }

      // ── 4. Calculate Main Wave Coordinates (Primary Asset) ──
      const stepX = width / (pointCount - 1)
      const coords = points.map((pt, i) => {
        const x = i * stepX
        const wave = Math.sin(time * 2 + pt.phase + i * 0.09) * 28 * dpr
        const macro = Math.cos(time * 0.8 + i * 0.05) * 40 * dpr
        const y = pt.baseY * height + wave + macro
        return { x, y }
      })

      // ── 5. Fill Vibrant Gradient Area Under Wave ──
      const areaGrad = ctx.createLinearGradient(0, height * 0.15, 0, height)
      areaGrad.addColorStop(0, 'rgba(99, 102, 241, 0.35)')
      areaGrad.addColorStop(0.3, 'rgba(168, 85, 247, 0.22)')
      areaGrad.addColorStop(0.7, 'rgba(52, 211, 153, 0.08)')
      areaGrad.addColorStop(1, 'rgba(15, 23, 42, 0)')

      ctx.beginPath()
      ctx.moveTo(coords[0].x, height)
      ctx.lineTo(coords[0].x, coords[0].y)

      for (let i = 0; i < coords.length - 1; i++) {
        const xc = (coords[i].x + coords[i + 1].x) / 2
        const yc = (coords[i].y + coords[i + 1].y) / 2
        ctx.quadraticCurveTo(coords[i].x, coords[i].y, xc, yc)
      }
      ctx.lineTo(coords[coords.length - 1].x, coords[coords.length - 1].y)
      ctx.lineTo(width, height)
      ctx.closePath()
      ctx.fillStyle = areaGrad
      ctx.fill()

      // ── 6. Draw Glowing Dual-Tone Neon Chart Trajectory ──
      // Outer Plasma Glow
      ctx.beginPath()
      ctx.moveTo(coords[0].x, coords[0].y)
      for (let i = 0; i < coords.length - 1; i++) {
        const xc = (coords[i].x + coords[i + 1].x) / 2
        const yc = (coords[i].y + coords[i + 1].y) / 2
        ctx.quadraticCurveTo(coords[i].x, coords[i].y, xc, yc)
      }
      ctx.lineTo(coords[coords.length - 1].x, coords[coords.length - 1].y)
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)'
      ctx.lineWidth = 10 * dpr
      ctx.shadowColor = '#818cf8'
      ctx.shadowBlur = 25 * dpr
      ctx.stroke()
      ctx.shadowBlur = 0

      // Core Laser Line
      const strokeGrad = ctx.createLinearGradient(0, 0, width, 0)
      strokeGrad.addColorStop(0, '#6366f1')
      strokeGrad.addColorStop(0.4, '#a855f7')
      strokeGrad.addColorStop(0.8, '#38bdf8')
      strokeGrad.addColorStop(1, '#34d399')

      ctx.beginPath()
      ctx.moveTo(coords[0].x, coords[0].y)
      for (let i = 0; i < coords.length - 1; i++) {
        const xc = (coords[i].x + coords[i + 1].x) / 2
        const yc = (coords[i].y + coords[i + 1].y) / 2
        ctx.quadraticCurveTo(coords[i].x, coords[i].y, xc, yc)
      }
      ctx.lineTo(coords[coords.length - 1].x, coords[coords.length - 1].y)
      ctx.strokeStyle = strokeGrad
      ctx.lineWidth = 3.8 * dpr
      ctx.stroke()

      // ── 7. Secondary Electric Cyan Track ──
      ctx.beginPath()
      const coords2 = points.map((pt, i) => {
        const x = i * stepX
        const y = (pt.baseY + 0.14) * height + Math.sin(time * 2.5 + pt.phase + i * 0.11) * 20 * dpr
        return { x, y }
      })
      ctx.moveTo(coords2[0].x, coords2[0].y)
      for (let i = 0; i < coords2.length - 1; i++) {
        const xc = (coords2[i].x + coords2[i + 1].x) / 2
        const yc = (coords2[i].y + coords2[i + 1].y) / 2
        ctx.quadraticCurveTo(coords2[i].x, coords2[i].y, xc, yc)
      }
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)'
      ctx.lineWidth = 2 * dpr
      ctx.stroke()

      // ── 8. Leading Pulse Laser Head with Radar Ping ──
      const last = coords[coords.length - 1]
      const pulseSize = (Math.sin(time * 6) * 0.5 + 0.5) * 16 * dpr + 8 * dpr

      // Radar Ring
      ctx.beginPath()
      ctx.arc(last.x - 12 * dpr, last.y, pulseSize + 8 * dpr, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(52, 211, 153, 0.25)'
      ctx.fill()

      // Glowing Center Head
      ctx.beginPath()
      ctx.arc(last.x - 12 * dpr, last.y, 7 * dpr, 0, Math.PI * 2)
      ctx.fillStyle = '#34d399'
      ctx.shadowColor = '#34d399'
      ctx.shadowBlur = 25 * dpr
      ctx.fill()
      ctx.shadowBlur = 0

      // Glowing Live HUD Tag
      const tagW = 105 * dpr
      const tagH = 26 * dpr
      const tagX = last.x - tagW - 25 * dpr
      const tagY = last.y - tagH / 2

      ctx.fillStyle = 'rgba(9, 11, 17, 0.92)'
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.7)'
      ctx.lineWidth = 1.6 * dpr
      ctx.beginPath()
      ctx.roundRect(tagX, tagY, tagW, tagH, 8 * dpr)
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = '#34d399'
      ctx.font = `bold ${11 * dpr}px monospace`
      ctx.fillText('LIVE $68,420 ▲', tagX + 8 * dpr, tagY + 17 * dpr)

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <div className={`pointer-events-none absolute inset-0 z-0 overflow-hidden select-none ${className}`}>
      <canvas ref={canvasRef} className="h-full w-full opacity-95" />
      {/* Edge gradient blending */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-ink-950 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-ink-950 to-transparent"
      />
    </div>
  )
}
