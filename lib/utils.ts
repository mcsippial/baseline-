import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Simple nanoid-like unique ID generator
 */
export function nanoid(size = 21): string {
  const alphabet = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict'
  let id = ''
  let bytes = new Uint8Array(size)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    bytes = bytes.map(() => Math.floor(Math.random() * 256))
  }
  for (let i = 0; i < size; i++) {
    id += alphabet[bytes[i] & 63]
  }
  return id
}

/**
 * Format a metric type key for display
 */
export function formatMetricType(type: string): string {
  const map: Record<string, string> = {
    sleep_score: 'Sleep Score',
    hrv: 'HRV',
    resting_hr: 'Resting HR',
    spo2: 'SpO₂',
    recovery_score: 'Recovery',
    strain: 'Strain',
    steps: 'Steps',
    active_calories: 'Active Cal',
  }
  return map[type] || type.replace(/_/g, ' ')
}

/**
 * Format a number with appropriate decimal places
 */
export function formatValue(value: number, metricType: string): string {
  const oneDecimal = new Set(['hrv', 'spo2', 'strain'])
  const noDecimal = new Set(['sleep_score', 'resting_hr', 'recovery_score', 'steps', 'active_calories'])

  if (noDecimal.has(metricType)) return Math.round(value).toString()
  if (oneDecimal.has(metricType)) return value.toFixed(1)
  return value.toFixed(1)
}
