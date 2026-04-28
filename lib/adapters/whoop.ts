import type { DeviceAdapter, HealthMetricData } from './base'
import { dailyValue, getDatesInRange } from './base'

export class WhoopAdapter implements DeviceAdapter {
  name = 'whoop'

  async fetchMetrics(userId: string, fromDate: Date, toDate: Date): Promise<HealthMetricData[]> {
    const dates = getDatesInRange(fromDate, toDate)
    const metrics: HealthMetricData[] = []

    for (const date of dates) {
      // Whoop reports morning data
      const recordedAt = new Date(date)
      recordedAt.setHours(7, 30, 0, 0)

      // Recovery score: 40-90% (Whoop's signature metric)
      const recoveryScore = Math.round(
        dailyValue(date, 'recovery_score', 'whoop', 42, 88)
      )
      metrics.push({
        source: 'whoop',
        metric_type: 'recovery_score',
        value: Math.max(20, Math.min(99, recoveryScore)),
        unit: '%',
        recorded_at: recordedAt.toISOString(),
      })

      // Strain: 5-18 (Whoop strain score)
      const strain = dailyValue(date, 'strain', 'whoop', 6, 17)
      metrics.push({
        source: 'whoop',
        metric_type: 'strain',
        value: Math.round(strain * 10) / 10,
        unit: 'score',
        recorded_at: recordedAt.toISOString(),
      })

      // HRV from Whoop: 40-70ms
      const hrv = dailyValue(date, 'hrv', 'whoop', 42, 68)
      metrics.push({
        source: 'whoop',
        metric_type: 'hrv',
        value: hrv,
        unit: 'ms',
        recorded_at: recordedAt.toISOString(),
      })

      // Resting heart rate from Whoop: 50-65 bpm
      const rhr = Math.round(dailyValue(date, 'resting_hr', 'whoop', 51, 64))
      metrics.push({
        source: 'whoop',
        metric_type: 'resting_hr',
        value: rhr,
        unit: 'bpm',
        recorded_at: recordedAt.toISOString(),
      })

      // Sleep performance: 60-90%
      const sleepPerformance = Math.round(
        dailyValue(date, 'sleep_score', 'whoop', 62, 88)
      )
      metrics.push({
        source: 'whoop',
        metric_type: 'sleep_score',
        value: sleepPerformance,
        unit: '%',
        recorded_at: recordedAt.toISOString(),
      })
    }

    return metrics
  }
}
