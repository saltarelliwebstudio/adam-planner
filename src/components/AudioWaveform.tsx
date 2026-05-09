'use client'

import { useEffect, useRef } from 'react'

interface AudioWaveformProps {
  isActive: boolean
  color?: string
  barCount?: number
  height?: number
}

export default function AudioWaveform({
  isActive,
  color = 'var(--accent)',
  barCount = 40,
  height = 64,
}: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null)

  useEffect(() => {
    if (!isActive) {
      // Cleanup
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      analyserRef.current = null
      dataRef.current = null
      // Draw flat line
      drawBars(null)
      return
    }

    let mounted = true

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        const ctx = new AudioContext()
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 128
        analyser.smoothingTimeConstant = 0.75
        source.connect(analyser)

        analyserRef.current = analyser
        dataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>

        animate()
      } catch {
        // Mic not available — draw animated placeholder
        animatePlaceholder()
      }
    }

    function animate() {
      if (!mounted) return
      const analyser = analyserRef.current
      const data = dataRef.current
      if (analyser && data) {
        analyser.getByteFrequencyData(data)
        drawBars(data)
      }
      animFrameRef.current = requestAnimationFrame(animate)
    }

    // Fallback: animated sine wave when no mic access
    let placeholderPhase = 0
    function animatePlaceholder() {
      if (!mounted) return
      placeholderPhase += 0.05
      const fakeData = new Uint8Array(barCount)
      for (let i = 0; i < barCount; i++) {
        fakeData[i] = Math.floor(
          80 + 60 * Math.sin(placeholderPhase + i * 0.3) * Math.sin(placeholderPhase * 0.7 + i * 0.1)
        )
      }
      drawBars(fakeData)
      animFrameRef.current = requestAnimationFrame(animatePlaceholder)
    }

    init()

    return () => {
      mounted = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [isActive, barCount])

  function drawBars(data: Uint8Array<ArrayBuffer> | null) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const gap = 2
    const barWidth = (w - gap * (barCount - 1)) / barCount
    const centerY = h / 2
    const maxBarHeight = h * 0.85

    for (let i = 0; i < barCount; i++) {
      // Get value from data or default to minimal
      let value = 0
      if (data) {
        // Map bar index to data index
        const dataIdx = Math.floor((i / barCount) * data.length)
        value = data[dataIdx] / 255
      }

      // Minimum bar height for visual presence
      const minHeight = 3
      const barHeight = Math.max(minHeight, value * maxBarHeight)

      const x = i * (barWidth + gap)
      const y = centerY - barHeight / 2

      // Gradient opacity based on position (fade edges)
      const edgeFade = 1 - Math.abs((i / barCount) - 0.5) * 0.6
      const alpha = data ? (0.4 + value * 0.6) * edgeFade : 0.15

      ctx.fillStyle = color.startsWith('var(')
        ? `rgba(59, 130, 246, ${alpha})` // fallback blue if CSS var
        : color
      ctx.globalAlpha = alpha

      // Rounded bars
      const radius = barWidth / 2
      ctx.beginPath()
      ctx.moveTo(x + radius, y)
      ctx.lineTo(x + barWidth - radius, y)
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius)
      ctx.lineTo(x + barWidth, y + barHeight - radius)
      ctx.quadraticCurveTo(x + barWidth, y + barHeight, x + barWidth - radius, y + barHeight)
      ctx.lineTo(x + radius, y + barHeight)
      ctx.quadraticCurveTo(x, y + barHeight, x, y + barHeight - radius)
      ctx.lineTo(x, y + radius)
      ctx.quadraticCurveTo(x, y, x + radius, y)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height }}
      className="rounded-xl"
    />
  )
}
