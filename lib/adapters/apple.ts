import type { DeviceAdapter, HealthMetricData } from './base'
import { dailyValue, getDatesInRange } from './base'

export class AppleHealthAdapter implements DeviceAdapter {
  name = 'apple'

  async fetchMetrics(userId: string, fromDate: Date, toDate: Date): Promise<HealthMetricData[]> {
    const dates = getDatesInRange(fromDate, toDate)
    const metrics: HealthMetricData[] = []

    for (const date of dates) {
      // Apple Health records throughout the day, use end of day
      const recordedAt = new Date(date)
      recordedAt.setHours(22, 0, 0, 0)

      // Steps: 4000-12000, more on weekdays
      const isWeekend = date.getDay() === 0 || date.getDay() === 6
      const stepsBase = isWeekend ? 5000 : 7500
      const steps = Math.round(
        dailyValue(date, 'steps', 'apple', stepsBase, stepsBase + 4500)
      )
      metrics.push({
        source: 'apple',
        metric_type: 'steps',
        value: steps,
        unit: 'steps',
        recorded_at: recordedAt.toISOString(),
      })

      // Active calories: 200-650
      const activeCalories = Math.round(
        dailyValue(date, 'active_calories', 'apple', 220, 620)
      )
      metrics.push({
        source: 'apple',
        metric_type: 'active_calories',
        value: activeCalories,
        unit: 'kcal',
        recorded_at: recordedAt.toISOString(),
      })

      // Resting heart rate from Apple Watch: 54-70 bpm
      const rhr = Math.round(dailyValue(date, 'resting_hr', 'apple', 54, 69))
      metrics.push({
        source: 'apple',
        metric_type: 'resting_hr',
        value: rhr,
        unit: 'bpm',
        recorded_at: recordedAt.toISOString(),
      })

      // HRV from Apple Watch (SDNN): 30-60ms
      const hrv = dailyValue(date, 'hrv', 'apple', 32, 58)
      metrics.push({
        source: 'apple',
        metric_type: 'hrv',
        value: hrv,
        unit: 'ms',
        recorded_at: recordedAt.toISOString(),
      })

      // Sleep score (from Apple Health sleep data): 55-82
      const sleepScore = Math.round(dailyValue(date, 'sleep_score', 'apple', 56, 80))
      metrics.push({
        source: 'apple',
        metric_type: 'sleep_score',
        value: sleepScore,
        unit: 'score',
        recorded_at: recordedAt.toISOString(),
      })
    }

    return metrics
  }
}
