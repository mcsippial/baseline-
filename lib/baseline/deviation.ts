import type { Baseline } from '@/lib/supabase/types'

export interface DeviationResult {
  metricType: string
  value: number
  baselineValue: number
  zScore: number
  deviationPct: number
  direction: 'above' | 'below' | 'within'
  severity: 'normal' | 'mild' | 'moderate' | 'significant'
}

/**
 * Compute z-score: (value - baseline_mean) / baseline_std_dev
 * The standard deviation is derived from the baseline range (mean ± 1SD).
 */
export function computeZScore(value: number, baseline: Baseline): number {
  // Derive SD from the stored range
  const sd = (baseline.baseline_range_high - baseline.baseline_range_low) / 2
  if (sd === 0) return 0
  return (value - baseline.baseline_value) / sd
}

/**
 * Compute deviation percentage from baseline
 */
export function computeDeviationPct(value: number, baselineValue: number): number {
  if (baselineValue === 0) return 0
  return ((value - baselineValue) / baselineValue) * 100
}

/**
 * Get severity label based on z-score magnitude
 */
export function getDeviationSeverity(zScore: number): 'normal' | 'mild' | 'moderate' | 'significant' {
  const abs = Math.abs(zScore)
  if (abs < 1.0) return 'normal'
  if (abs < 1.5) return 'mild'
  if (abs < 2.0) return 'moderate'
  return 'significant'
}

/**
 * Full deviation analysis for a single metric value against its baseline
 */
export function analyzeDeviation(
  metricType: string,
  value: number,
  baseline: Baseline
): DeviationResult {
  const zScore = computeZScore(value, baseline)
  const deviationPct = computeDeviationPct(value, baseline.baseline_value)
  const severity = getDeviationSeverity(zScore)

  let direction: 'above' | 'below' | 'within' = 'within'
  if (value > baseline.baseline_range_high) direction = 'above'
  else if (value < baseline.baseline_range_low) direction = 'below'

  return {
    metricType,
    value,
    baselineValue: baseline.baseline_value,
    zScore,
    deviationPct,
    direction,
    severity,
  }
}

/**
 * Check if a value represents an anomaly (beyond 1.5 SD)
 */
export function isAnomaly(value: number, baseline: Baseline): boolean {
  return Math.abs(computeZScore(value, baseline)) > 1.5
}

/**
 * Format a deviation for display
 */
export function formatDeviation(deviationPct: number): string {
  const abs = Math.abs(deviationPct)
  const direction = deviationPct >= 0 ? 'above' : 'below'
  return `${abs.toFixed(1)}% ${direction} baseline`
}
