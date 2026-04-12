/**
 * Browser notifications composable.
 *
 * Two modes:
 *  1. Local Notification API — fires immediately client-side (deposit reminders, goal reached)
 *  2. Service Worker push — placeholder for future server-side push (not wired)
 *
 * Use case for #1: when user opens the app and has a reminder due today,
 * we fire a local notification + toast. No backend needed.
 */
import { BRAND } from '~/config/brand'

const ENABLED_KEY = `${BRAND.storagePrefix}_notif_enabled`
const LAST_FIRED_KEY = `${BRAND.storagePrefix}_notif_last_fired`

const permission = ref<NotificationPermission>('default')
const enabled = ref(false)

function loadState() {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  permission.value = Notification.permission
  enabled.value = localStorage.getItem(ENABLED_KEY) === '1'
}

export function useNotifications() {
  if (typeof window !== 'undefined') loadState()

  const supported = computed(() => typeof window !== 'undefined' && 'Notification' in window)

  async function requestPermission(): Promise<boolean> {
    if (!supported.value) return false
    if (permission.value === 'granted') {
      enabled.value = true
      localStorage.setItem(ENABLED_KEY, '1')
      return true
    }
    try {
      const result = await Notification.requestPermission()
      permission.value = result
      if (result === 'granted') {
        enabled.value = true
        localStorage.setItem(ENABLED_KEY, '1')
        return true
      }
    } catch (e) {
      console.warn('[notifications] permission request failed:', e)
    }
    return false
  }

  function disable() {
    enabled.value = false
    localStorage.setItem(ENABLED_KEY, '0')
  }

  /**
   * Fire a local browser notification, deduped by tag (so reminder for the same
   * pocket doesn't spam if user reopens the tab multiple times).
   */
  function fire(opts: { title: string; body: string; tag?: string; url?: string; force?: boolean }) {
    if (!supported.value || permission.value !== 'granted' || !enabled.value) return

    // Dedupe: don't fire same tag twice within 6 hours
    if (opts.tag && !opts.force) {
      const lastFiredRaw = localStorage.getItem(LAST_FIRED_KEY)
      const lastFired: Record<string, number> = lastFiredRaw ? JSON.parse(lastFiredRaw) : {}
      const last = lastFired[opts.tag]
      if (last && Date.now() - last < 6 * 60 * 60 * 1000) return
      lastFired[opts.tag] = Date.now()
      localStorage.setItem(LAST_FIRED_KEY, JSON.stringify(lastFired))
    }

    try {
      const n = new Notification(opts.title, {
        body: opts.body,
        icon: '/new.jpeg',
        badge: '/new.jpeg',
        tag: opts.tag,
      })
      if (opts.url) {
        n.onclick = () => {
          window.focus()
          window.location.href = opts.url!
          n.close()
        }
      }
    } catch (e) {
      console.warn('[notifications] fire failed:', e)
    }
  }

  return {
    supported,
    permission: computed(() => permission.value),
    enabled: computed(() => enabled.value),
    requestPermission,
    disable,
    fire,
  }
}
