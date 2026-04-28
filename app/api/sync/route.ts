import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { OuraAdapter } from '@/lib/adapters/oura'
import { AppleHealthAdapter } from '@/lib/adapters/apple'
import { WhoopAdapter } from '@/lib/adapters/whoop'
import { GarminAdapter } from '@/lib/adapters/garmin'
import { computeBaselines, toBaselineInserts } from '@/lib/baseline/compute'
import { subDays } from 'date-fns'
import type { HealthMetricInsert } from '@/lib/supabase/types'
import type { DeviceAdapter } from '@/lib/adapters/base'

const ALL_ADAPTERS: DeviceAdapter[] = [
  new OuraAdapter(),
  new AppleHealthAdapter(),
  new WhoopAdapter(),
  new GarminAdapter(),
]

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get user's connected devices
    const { data: profile } = await supabase
      .from('users')
      .select('connected_devices')
      .eq('id', user.id)
      .single()

    const connectedDevices = profile?.connected_devices || []

    // Determine which adapters to run
    const adaptersToRun = connectedDevices.length > 0
      ? ALL_ADAPTERS.filter((a) => connectedDevices.includes(a.name))
      : ALL_ADAPTERS // Run all adapters if no specific devices selected (demo mode)

    const now = new Date()
    const fromDate = subDays(now, 90)

    let allMetrics: HealthMetricInsert[] = []

    for (const adapter of adaptersToRun) {
      try {
        const metrics = await adapter.fetchMetrics(user.id, fromDate, now)
        allMetrics = allMetrics.concat(
          metrics.map((m) => ({ ...m, user_id: user.id }))
        )
      } catch (err) {
        console.error(`Error fetching from ${adapter.name}:`, err)
        // Continue with other adapters
      }
    }

    if (allMetrics.length === 0) {
      return NextResponse.json({ metricsInserted: 0, baselinesComputed: 0 })
    }

    // Upsert metrics (use recorded_at + user_id + source + metric_type as unique key)
    // We'll batch insert - Supabase handles conflicts based on pk (id)
    // First delete existing data for this window to avoid duplicates
    await supabase
      .from('health_metrics')
      .delete()
      .eq('user_id', user.id)
      .gte('recorded_at', fromDate.toISOString())

    // Insert in batches of 500
    const batchSize = 500
    let inserted = 0
    for (let i = 0; i < allMetrics.length; i += batchSize) {
      const batch = allMetrics.slice(i, i + batchSize)
      const { error } = await supabase.from('health_metrics').insert(batch)
      if (error) {
        console.error('Error inserting metrics batch:', error)
      } else {
        inserted += batch.length
      }
    }

    // Recompute baselines from the full 90-day window
    const { data: metricsForBaseline } = await supabase
      .from('health_metrics')
      .select('*')
      .eq('user_id', user.id)
      .gte('recorded_at', fromDate.toISOString())

    if (metricsForBaseline && metricsForBaseline.length > 0) {
      const computed = computeBaselines(metricsForBaseline, 90)
      const inserts = toBaselineInserts(user.id, computed)

      // Delete existing baselines and reinsert
      await supabase.from('baselines').delete().eq('user_id', user.id)
      if (inserts.length > 0) {
        await supabase.from('baselines').insert(inserts)
      }

      return NextResponse.json({
        metricsInserted: inserted,
        baselinesComputed: computed.length,
        adaptersRun: adaptersToRun.map((a) => a.name),
      })
    }

    return NextResponse.json({
      metricsInserted: inserted,
      baselinesComputed: 0,
    })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json(
      { error: 'Internal server error during sync' },
      { status: 500 }
    )
  }
}
