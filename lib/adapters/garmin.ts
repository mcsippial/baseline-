import type { DeviceAdapter, HealthMetricData } from './base'
import { dailyValue, getDatesInRange } from './base'

export class GarminAdapter implements DeviceAdapter {
  name = 'garmin'

  async fetchMetrics(userId: string, fromDate: Date, toDate: Date): Promise<HealthMetricData[]> {
    const dates = getDatesInRange(fromDate, toDate)
    const metrics: HealthMetricData[] = []

    for (const date of dates) {
      // Garmin syncs throughout the day
      const recordedAt = new Date(date)
      recordedAt.setHours(23, 30, 0, 0)

      // Steps: 5000-15000
      const isWeekend = date.getDay() === 0 || date.getDay() === 6
      const stepsMin = isWeekend ? 4500 : 6000
      const steps = Math.round(
        dailyValue(date, 'steps', 'garmin', stepsMin, stepsMin + 7000)
      )
      metrics.push({
        source: 'garmin',
        metric_type: 'steps',
        value: steps,
        unit: 'steps',
        recorded_at: recordedAt.toISOString(),
      })

      // Body Battery: 20-100 (Garmin's readiness score)
      const bodyBattery = Math.round(
        dailyValue(date, 'recovery_score', 'garmin', 25, 95)
      )
      metrics.push({
        source: 'garmin',
        metric_type: 'recovery_score',
        value: Math.max(10, Math.min(100, bodyBattery)),
        unit: '%',
        recorded_at: recordedAt.toISOString(),
      })

      // Stress score: 20-75 (lower is better)
      const stressScore = Math.round(
        dailyValue(date, 'strain', 'garmin', 20, 70)
      )
      metrics.push({
        source: 'garmin',
        metric_type: 'strain',
        value: stressScore,
        unit: 'score',
        recorded_at: recordedAt.toISOString(),
      })

      // Resting heart rate: 52-68 bpm
      const rhr = Math.round(dailyValue(date, 'resting_hr', 'garmin', 52, 68))
      metrics.push({
        source: 'garmin',
        metric_type: 'resting_hr',
        value: rhr,
        unit: 'bpm',
        recorded_at: recordedAt.toISOString(),
      })

      // SpO2: 95-99%
      const spo2 = dailyValue(date, 'spo2', 'garmin', 95.0, 99.0)
      metrics.push({
        source: 'garmin',
        metric_type: 'spo2',
        value: Math.round(spo2 * 10) / 10,
        unit: '%',
        recorded_at: recordedAt.toISOString(),
      })

      // Active calories: 250-700
      const activeCalories = Math.round(
        dailyValue(date, 'active_calories', 'garmin', 260, 680)
      )
      metrics.push({
        source: 'garmin',
        metric_type: 'active_calories',
        value: activeCalories,
        unit: 'kcal',
        recorded_at: recordedAt.toISOString(),
      })
    }

    return metrics
  }
}
