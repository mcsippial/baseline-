export interface HealthMetricData {
  source: string
  metric_type: string
  value: number
  unit: string
  recorded_at: string
}

export interface DeviceAdapter {
  name: string
  fetchMetrics(userId: string, fromDate: Date, toDate: Date): Promise<HealthMetricData[]>
}

/**
 * Seeded pseudo-random number generator based on a string seed.
 * Returns a value between 0 and 1, consistent for the same seed.
 */
export function seededRandom(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  // Normalize to 0-1 range
  return Math.abs(Math.sin(hash))
}

/**
 * Generate a random value within a range using a date-based seed for consistency.
 */
export function dailyValue(
  date: Date,
  metric: string,
  source: string,
  min: number,
  max: number,
  trend?: number // optional slow drift (-1 to 1 normalized to effect)
): number {
  const dateStr = date.toISOString().split('T')[0]
  const seed = `${dateStr}-${metric}-${source}`
  const base = seededRandom(seed)

  // Add slight day-to-day variation using a secondary seed
  const variationSeed = `${dateStr}-${metric}-${source}-var`
  const variation = (seededRandom(variationSeed) - 0.5) * 0.15

  const normalized = Math.min(1, Math.max(0, base + variation + (trend || 0)))
  return Math.round((min + normalized * (max - min)) * 10) / 10
}

/**
 * Get dates between two dates (inclusive)
 */
export function getDatesInRange(fromDate: Date, toDate: Date): Date[] {
  const dates: Date[] = []
  const current = new Date(fromDate)
  current.setHours(0, 0, 0, 0)

  const end = new Date(toDate)
  end.setHours(23, 59, 59, 999)

  while (current <= end) {
    dates.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  return dates
}
