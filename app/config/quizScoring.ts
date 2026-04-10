import type { StrategyKey } from './strategies'

export interface QuizOption {
  label: string
  value: number
}

export interface QuizQuestion {
  id: string
  question: string
  subtitle: string
  icon: string
  options: QuizOption[]
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'horizon',
    question: 'How long until your goal?',
    subtitle: 'This helps us match the right level of risk.',
    icon: 'lucide:clock',
    options: [
      { label: 'Less than 1 year', value: 1 },
      { label: '1\u20133 years', value: 2 },
      { label: '3+ years', value: 3 },
    ],
  },
  {
    id: 'volatility',
    question: 'How do you feel about price swings?',
    subtitle: 'Crypto prices can go up and down. How does that feel?',
    icon: 'lucide:activity',
    options: [
      { label: 'I prefer stability', value: 1 },
      { label: 'I can handle some ups and downs', value: 2 },
      { label: 'Big swings don\'t bother me', value: 3 },
    ],
  },
  {
    id: 'priority',
    question: 'What matters most to you?',
    subtitle: 'There\'s no wrong answer here.',
    icon: 'lucide:target',
    options: [
      { label: 'Protecting what I have', value: 1 },
      { label: 'Steady growth over time', value: 2 },
      { label: 'Maximizing returns', value: 3 },
    ],
  },
]

export const RECOMMENDATION_REASONS: Record<StrategyKey, string> = {
  conservative:
    'A stable dollar-based strategy fits your goals best. Your savings earn daily interest with minimal risk.',
  balanced:
    'A balance between growth and stability suits you. Bitcoin-backed savings give you upside with moderate risk.',
  aggressive:
    'With a longer horizon and higher risk tolerance, an Ethereum-based strategy offers the highest growth potential.',
}

export function computeRecommendation(answers: number[]): StrategyKey {
  const total = answers.reduce((sum, a) => sum + a, 0)
  if (total <= 4) return 'conservative'
  if (total <= 6) return 'balanced'
  return 'aggressive'
}
