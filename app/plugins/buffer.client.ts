import { Buffer } from 'buffer'

export default defineNuxtPlugin(() => {
  if (typeof window !== 'undefined' && !window.Buffer) {
    window.Buffer = Buffer
  }
})
