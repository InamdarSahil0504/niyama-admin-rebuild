export const TIERS = {
  free_trial: {
    name: 'Free Trial',
    price: 0,
    price_annual: 0,
    reward_cap: 2.50,
    base_cap: 2.50,
    max_cap: 2.50,
    min_days: 10,
    capMonths: 3,
    hasMilestones: false,
    hasRewards: true
  },
  free_expired: {
    name: 'Free (Expired)',
    price: 0,
    price_annual: 0,
    reward_cap: 0,
    base_cap: 0,
    max_cap: 0,
    min_days: null,
    hasMilestones: false,
    hasRewards: false
  },
  basic: {
    name: 'Basic',
    price: 0.99,
    price_annual: 9.99,
    reward_cap: 5.00,
    base_cap: 5.00,
    max_cap: 5.00,
    min_days: 10,
    hasMilestones: false,
    hasRewards: true
  },
  plus: {
    name: 'Plus',
    price: 4.99,
    price_annual: 49.99,
    reward_cap: 10.00,
    base_cap: 10.00,
    max_cap: 17.50,
    min_days: 7,
    hasMilestones: true,
    hasRewards: true
  },
  premium: {
    name: 'Premium',
    price: 14.99,
    price_annual: 149.99,
    reward_cap: 25.00,
    base_cap: 25.00,
    max_cap: 35.00,
    min_days: 5,
    hasMilestones: true,
    hasRewards: true
  }
}

export const MILESTONES = {
  plus: [
    { id: 'plus_20_days', name: '20 Successful Days', reward: 2.50 },
    { id: 'plus_successful_month', name: 'Successful Month', reward: 5.00 },
    { id: 'plus_perfect_month', name: 'Perfect Month', reward: 7.50 }
  ],
  premium: [
    { id: 'premium_10_days', name: '10 Successful Days', reward: 2.50 },
    { id: 'premium_20_days', name: '20 Successful Days', reward: 5.00 },
    { id: 'premium_successful_month', name: 'Successful Month', reward: 7.50 },
    { id: 'premium_perfect_month', name: 'Perfect Month', reward: 10.00 }
  ]
}

export const MILESTONES_INR = {
  plus: {
    base: 250,
    milestones: [
      { id: 'plus_20_days_inr', name: '20 Successful Days', bonus: 100 },
      { id: 'plus_successful_month_inr', name: 'Successful Month', bonus: 100 },
      { id: 'plus_perfect_month_inr', name: 'Perfect Month', bonus: 50 }
    ],
    max_total: 500
  },
  premium: {
    base: 750,
    milestones: [
      { id: 'premium_10_days_inr', name: '10 Successful Days', bonus: 100 },
      { id: 'premium_20_days_inr', name: '20 Successful Days', bonus: 150 },
      { id: 'premium_successful_month_inr', name: 'Successful Month', bonus: 250 },
      { id: 'premium_perfect_month_inr', name: 'Perfect Month', bonus: 250 }
    ],
    max_total: 1500
  }
}

export const SUCCESSFUL_DAY_RULE = '2 of 3 core habits AND 3 of 7 library habits'

export const CORE_HABITS = [
  { id: 'wake_consistency', name: 'Wake Consistency', points: 100 },
  { id: 'sleep_duration', name: 'Sleep Duration', points: 100 },
  { id: 'steps', name: 'Steps', points: [50, 75, 100] }
]

export const LIBRARY_HABITS = [
  { id: 'screen_time', name: 'Screen Time', points: 50 },
  { id: 'no_phone', name: 'No Phone after 10:30pm', points: 50 },
  { id: 'stand', name: 'Stand', points: 50 },
  { id: 'sunlight', name: 'Morning Sunlight', points: 50 },
  { id: 'no_late_food', name: 'No Late Food', points: 50 },
  { id: 'recovery', name: 'Recovery Practice', points: 50 },
  { id: 'meditation', name: 'Meditation', points: 50 }
]

export const ALL_HABITS = [
  ...CORE_HABITS.map(h => ({ ...h, category: 'core' })),
  ...LIBRARY_HABITS.map(h => ({ ...h, category: 'library' }))
]

export const CUSTOM_HABIT_POINTS = 25
export const SUCCESSFUL_DAY_BONUS = 50
export const PERFECT_DAY_BONUS = 100
export const POINTS_PER_DOLLAR = 1000

export const HABIT_KEY_LABELS = {
  wake: 'Wake Consistency',
  sleep: 'Sleep Duration',
  steps: 'Steps',
  screen_time: 'Screen Time',
  no_phone: 'No Phone after 10:30pm',
  stand: 'Stand Consistency',
  sunlight: 'Morning Sunlight',
  no_late_food: 'No Late Food after 8pm',
  recovery: 'Recovery Practice — Yoga/Stretching',
  meditation: 'Meditation',
  hydration: 'Hydration (Legacy)',
  reading: 'Reading (Legacy)',
}

export function getHabitLabel(key) {
  if (!key) return ''
  if (HABIT_KEY_LABELS[key]) return HABIT_KEY_LABELS[key]
  if (key.startsWith('custom_')) return 'Custom Habit'
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export const FRAUD_THRESHOLDS = {
  critical: 70,
  high: 40,
  suspicious: 20,
  watch: 1
}
