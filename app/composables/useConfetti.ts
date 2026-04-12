import confetti from 'canvas-confetti'

/**
 * Lightweight wrapper around canvas-confetti with presets used across the app.
 * Firing is no-op on SSR.
 */
export function useConfetti() {
  function fireSuccess() {
    if (typeof window === 'undefined') return
    // Two-burst pattern: center cone + side bursts for a richer celebration
    const end = Date.now() + 600
    const colors = ['#86B238', '#A3D64C', '#ffffff', '#F7CB45']

    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.65 },
      colors,
      scalar: 0.9,
      disableForReducedMotion: true,
    })

    // Trailing side bursts
    ;(function frame() {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors,
        disableForReducedMotion: true,
      })
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors,
        disableForReducedMotion: true,
      })
      if (Date.now() < end) requestAnimationFrame(frame)
    })()
  }

  return { fireSuccess }
}
