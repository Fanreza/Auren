import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import { BRAND } from '~/config/brand'

const STORAGE_PREFIX = `${BRAND.storagePrefix}_tour_`

function isSeen(tourId: string): boolean {
  return !!localStorage.getItem(STORAGE_PREFIX + tourId)
}

function markSeen(tourId: string) {
  localStorage.setItem(STORAGE_PREFIX + tourId, '1')
}

function runTour(tourId: string, steps: DriveStep[], delay = 500) {
  if (isSeen(tourId)) return

  setTimeout(() => {
    // Filter out steps whose target element doesn't exist in DOM
    const validSteps = steps.filter(s => {
      if (!s.element) return true // no element = centered popover, always valid
      return !!document.querySelector(s.element as string)
    })
    if (validSteps.length === 0) return

    const d = driver({
      showProgress: true,
      animate: true,
      overlayColor: 'rgba(0, 0, 0, 0.75)',
      stagePadding: 8,
      stageRadius: 12,
      popoverClass: 'auren-tour',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Got it!',
      onDestroyStarted: () => {
        markSeen(tourId)
        d.destroy()
      },
      steps: validSteps,
    })
    d.drive()
  }, delay)
}

export function useTour() {
  // Dashboard tour (first login)
  function showDashboardTour() {
    runTour('dashboard', [
      {
        popover: {
          title: `Welcome to ${BRAND.name}!`,
          description: 'Your savings grow automatically here. Let me show you around quickly.',
        },
      },
      {
        element: '[data-tour="create-pocket"]',
        popover: {
          title: 'Create a pocket',
          description: 'Give it a name, pick a strategy, and start earning. Takes 30 seconds.',
          side: 'bottom',
        },
      },
      {
        element: '[data-tour="fund-wallet"]',
        popover: {
          title: 'Add funds',
          description: 'Buy crypto with a card or bank transfer directly into your wallet.',
          side: 'bottom',
        },
      },
      {
        popover: {
          title: 'You\'re all set!',
          description: 'Create your first pocket and start earning. Withdraw anytime — no lock-ups.',
        },
      },
    ], 1500)
  }

  // Pocket detail page tour
  function showPocketTour() {
    runTour('pocket-detail', [
      {
        element: '[data-tour="pocket-share"]',
        popover: {
          title: 'Share your progress',
          description: 'Generate a card to show your friends how your savings are growing.',
        },
      },
      {
        element: '[data-tour="pocket-edit"]',
        popover: {
          title: 'Edit pocket',
          description: 'Change the name, target amount, or timeline anytime.',
        },
      },
      {
        element: '[data-tour="pocket-stats"]',
        popover: {
          title: 'At a glance',
          description: 'Your APY (how fast you earn), total profit, and current strategy.',
        },
      },
      {
        element: '[data-tour="pocket-goal"]',
        popover: {
          title: 'Goal tracker',
          description: 'See how close you are to your savings goal. The ring fills up as you get closer.',
        },
      },
      {
        element: '[data-tour="pocket-confidence"]',
        popover: {
          title: 'Vault health',
          description: 'How much money is in the vault (TVL) and how stable the yield has been. More TVL = more trusted.',
        },
      },
      {
        element: '[data-tour="pocket-earnings"]',
        popover: {
          title: 'Earnings breakdown',
          description: 'See exactly how much you put in vs how much the vault earned for you.',
        },
      },
      {
        element: '[data-tour="pocket-history"]',
        popover: {
          title: 'All your transactions',
          description: 'Every deposit and withdrawal is recorded on the blockchain.',
        },
      },
      {
        element: '[data-tour="pocket-export"]',
        popover: {
          title: 'Export reports',
          description: 'Download your history as CSV, PDF receipt, or tax report. Useful for record keeping.',
        },
      },
    ], 2500)
  }

  // Switch vault tour
  function showSwitchVaultTour() {
    runTour('switch-vault', [
      {
        element: '[data-tour="switch-current"]',
        popover: {
          title: 'Your current strategy',
          description: 'This is where your money is right now. You can see how much you have deposited.',
        },
      },
      {
        element: '[data-tour="switch-options"]',
        popover: {
          title: 'Pick a new strategy',
          description: 'Tap one to switch. Your money moves automatically in one step — no need to withdraw first.',
        },
      },
    ], 500)
  }

  // Reminder/schedule tour
  function showReminderTour() {
    runTour('reminder', [
      {
        element: '[data-tour="reminder-amount"]',
        popover: {
          title: 'How much each time?',
          description: 'Set the amount you want to deposit each month. You can enter in dollars or in the token amount.',
        },
      },
      {
        element: '[data-tour="reminder-day"]',
        popover: {
          title: 'Pick a day',
          description: 'Choose which day of the month you want to be reminded. We\'ll notify you when it\'s time to deposit.',
        },
      },
    ], 500)
  }

  // Deposit dialog tour
  function showDepositTour() {
    runTour('deposit-flow', [
      {
        popover: {
          title: 'Quick tip',
          description: 'You can deposit any token — we\'ll automatically convert it. Pick a percentage or type a custom amount, then confirm in your wallet.',
        },
      },
    ], 800)
  }

  return {
    showDashboardTour,
    showPocketTour,
    showSwitchVaultTour,
    showReminderTour,
    showDepositTour,
  }
}
