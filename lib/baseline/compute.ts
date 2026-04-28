import type { HealthMetric, Baseline, BaselineInsert } from '@/lib/supabase/types'

export interface ComputedBaseline {
  metric_type: string
  baseline_value: number
  baseline_range_low: number
  baseline_range_high: number
  window_days: number
  sample_count: number
}

/**
 * Compute mean of an array of numbers
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Compute standard deviation of an array of numbers
 */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  const squaredDiffs = values.map((v) => Math.pow(v - avg, 2))
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/**
 * Compute baselines for all metric types from a set of historical metrics.
 * Returns one baseline per metric_type (using mean ± 1 SD).
 */
export function computeBaselines(
  metrics: HealthMetric[],
  windowDays: number = 90
): ComputedBaseline[] {
  // Group by metric_type
  const grouped = new Map<string, number[]>()

  for (const metric of metrics) {
    const existing = grouped.get(metric.metric_type) || []
    existing.push(metric.value)
    grouped.set(metric.metric_type, existing)
  }

  const results: ComputedBaseline[] = []

  for (const [metricType, values] of grouped.entries()) {
    if (values.length < 3) continue

    const avg = mean(values)
    const sd = stdDev(values)

    results.push({
      metric_type: metricType,
      baseline_value: Math.round(avg * 100) / 100,
      baseline_range_low: Math.round((avg - sd) * 100) / 100,
      baseline_range_high: Math.round((avg + sd) * 100) / 100,
      window_days: windowDays,
      sample_count: values.length,
    })
  }

  return results
}

/**
 * Convert computed baselines to DB insert format
 */
export function toBaselineInserts(
  userId: string,
  computed: ComputedBaseline[]
): BaselineInsert[] {
  return computed.map((b) => ({
    user_id: userId,
    metric_type: b.metric_type,
    baseline_value: b.baseline_value,
    baseline_range_low: b.baseline_range_low,
    baseline_range_high: b.baseline_range_high,
    window_days: b.window_days,
    computed_at: new Date().toISOString(),
  }))
}
