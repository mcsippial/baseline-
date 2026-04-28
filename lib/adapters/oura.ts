import type { DeviceAdapter, HealthMetricData } from './base'
import { dailyValue, getDatesInRange } from './base'

export class OuraAdapter implements DeviceAdapter {
  name = 'oura'

  async fetchMetrics(userId: string, fromDate: Date, toDate: Date): Promise<HealthMetricData[]> {
    const dates = getDatesInRange(fromDate, toDate)
    const metrics: HealthMetricData[] = []

    for (const date of dates) {
      // Oura records daily data at end of night, so use 8am as timestamp
      const recordedAt = new Date(date)
      recordedAt.setHours(8, 0, 0, 0)

      // Sleep score: 55-85, slight weekly pattern (weekends slightly lower)
      const isWeekend = date.getDay() === 0 || date.getDay() === 6
      const weekendOffset = isWeekend ? -3 : 0
      const sleepScore = Math.round(
        dailyValue(date, 'sleep_score', 'oura', 58, 82) + weekendOffset
      )
      metrics.push({
        source: 'oura',
        metric_type: 'sleep_score',
        value: Math.max(45, Math.min(95, sleepScore)),
        unit: 'score',
        recorded_at: recordedAt.toISOString(),
      })

      // HRV: 35-65ms, inversely correlated with stress
      const hrv = dailyValue(date, 'hrv', 'oura', 38, 62)
      metrics.push({
        source: 'oura',
        metric_type: 'hrv',
        value: hrv,
        unit: 'ms',
        recorded_at: recordedAt.toISOString(),
      })

      // Resting heart rate: 52-68 bpm, inversely related to HRV
      // Higher HRV tends to mean lower RHR
      const hrvNormalized = (hrv - 38) / (62 - 38)
      const rhrBase = dailyValue(date, 'resting_hr', 'oura', 54, 67)
      const rhr = Math.round(rhrBase - hrvNormalized * 4)
      metrics.push({
        source: 'oura',
        metric_type: 'resting_hr',
        value: Math.max(48, Math.min(80, rhr)),
        unit: 'bpm',
        recorded_at: recordedAt.toISOString(),
      })

      // SpO2: 95-99%
      const spo2 = dailyValue(date, 'spo2', 'oura', 95.5, 99.0)
      metrics.push({
        source: 'oura',
        metric_type: 'spo2',
        value: Math.round(spo2 * 10) / 10,
        unit: '%',
        recorded_at: recordedAt.toISOString(),
      })
    }

    return metrics
  }
}
