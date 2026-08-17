import { useRef, useState } from 'react'

/**
 * High-performance 3D Tilt Card with dynamic specular glare.
 * Responds to mouse position with smooth 3D perspective rotation and lighting.
 */
export default function TiltCard({
  children,
  className = '',
  maxTilt = 8,
  glare = true,
  scale = 1.015,
  as: Tag = 'div',
  ...rest
}) {
  const cardRef = useRef(null)
  const [style, setStyle] = useState({
    transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
    glareX: 50,
    glareY: 50,
    glareOpacity: 0,
    transition: 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)',
  })

  const handleMouseMove = (e) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    const rotateX = ((y - centerY) / centerY) * -maxTilt
    const rotateY = ((x - centerX) / centerX) * maxTilt

    const glareX = (x / rect.width) * 100
    const glareY = (y / rect.height) * 100

    setStyle({
      transform: `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(${scale}, ${scale}, ${scale})`,
      glareX,
      glareY,
      glareOpacity: 0.25,
      transition: 'transform 0.1s ease-out',
    })
  }

  const handleMouseLeave = () => {
    setStyle({
      transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
      glareX: 50,
      glareY: 50,
      glareOpacity: 0,
      transition: 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)',
    })
  }

  return (
    <Tag
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: style.transform,
        transition: style.transition,
        transformStyle: 'preserve-3d',
      }}
      className={`relative overflow-hidden ${className}`}
      {...rest}
    >
      {glare && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-300"
          style={{
            opacity: style.glareOpacity,
            background: `radial-gradient(circle 350px at ${style.glareX}% ${style.glareY}%, rgba(255, 255, 255, 0.35), transparent 70%)`,
          }}
        />
      )}
      <div style={{ transform: 'translateZ(10px)' }}>{children}</div>
    </Tag>
  )
}
