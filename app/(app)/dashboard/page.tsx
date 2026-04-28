import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MetricCard } from '@/components/cards/MetricCard'
import { SignalCard } from '@/components/cards/SignalCard'
import { AppointmentBanner } from '@/components/cards/AppointmentBanner'
import { RefreshButton } from '@/components/ui/RefreshButton'
import { subDays, format } from 'date-fns'
import type { HealthMetric, Baseline, Signal, Appointment } from '@/lib/supabase/types'
import { TrendingUp, Activity, Zap, AlertCircle } from 'lucide-react'

const KEY_METRICS = [
  { type: 'sleep_score', label: 'Sleep Score', unit: '%' },
  { type: 'hrv', label: 'HRV', unit: 'ms' },
  { type: 'resting_hr', label: 'Resting HR', unit: 'bpm' },
  { type: 'recovery_score', label: 'Recovery', unit: '%' },
]

async function DashboardContent() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date()
  const thirtyDaysAgo = subDays(now, 30)

  // Fetch metrics for the last 30 days
  const { data: metricsData } = await supabase
    .from('health_metrics')
    .select('*')
    .eq('user_id', user.id)
    .gte('recorded_at', thirtyDaysAgo.toISOString())
    .order('recorded_at', { ascending: false })

  const metrics = (metricsData || []) as HealthMetric[]

  // Fetch baselines
  const { data: baselinesData } = await supabase
    .from('baselines')
    .select('*')
    .eq('user_id', user.id)

  const baselines = (baselinesData || []) as Baseline[]
  const baselineMap = new Map(baselines.map((b) => [b.metric_type, b]))

  // Fetch signals (not dismissed)
  const { data: signalsData } = await supabase
    .from('signals')
    .select('*')
    .eq('user_id', user.id)
    .is('dismissed_at', null)
    .order('generated_at', { ascending: false })
    .limit(5)

  const signals = (signalsData || []) as Signal[]

  // Fetch upcoming appointments
  const { data: appointmentsData } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', user.id)
    .gte('appointment_at', now.toISOString())
    .order('appointment_at', { ascending: true })
    .limit(3)

  const appointments = (appointmentsData || []) as Appointment[]

  // Build metric card data
  const metricCardData = KEY_METRICS.map(({ type, label, unit }) => {
    const metricEntries = metrics
      .filter((m) => m.metric_type === type)
      .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())

    const latest = metricEntries[0]
    const sevenDaysAgo = metricEntries.find(
      (m) => new Date(m.recorded_at) <= subDays(now, 7)
    )

    const baseline = baselineMap.get(type)
    const sparklineData = metricEntries
      .slice(0, 30)
      .reverse()
      .map((m) => ({ value: m.value, date: m.recorded_at }))

    let trend: 'up' | 'down' | 'neutral' = 'neutral'
    if (latest && sevenDaysAgo) {
      const change = ((latest.value - sevenDaysAgo.value) / sevenDaysAgo.value) * 100
      if (Math.abs(change) > 2) {
        trend = change > 0 ? 'up' : 'down'
      }
    }

    let deviationPct: number | null = null
    if (latest && baseline) {
      deviationPct = ((latest.value - baseline.baseline_value) / baseline.baseline_value) * 100
    }

    return { type, label, unit, latest, baseline, sparklineData, trend, deviationPct }
  })

  const hasData = metricCardData.some((m) => m.latest !== undefined)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 mt-1">
            {format(now, "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <RefreshButton />
      </div>

      {/* Appointment banners */}
      {appointments.length > 0 && (
        <div className="space-y-3">
          {appointments.map((appt) => (
            <AppointmentBanner key={appt.id} appointment={appt} />
          ))}
        </div>
      )}

      {/* No data state */}
      {!hasData && (
        <div className="card text-center py-12">
          <Activity className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">No health data yet</h2>
          <p className="text-slate-400 mb-6">
            Sync your devices to start tracking your health metrics.
          </p>
          <RefreshButton label="Sync now" />
        </div>
      )}

      {/* Metric cards */}
      {hasData && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-white">Today&apos;s Metrics</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {metricCardData.map((data) => (
              <MetricCard key={data.type} data={data} />
            ))}
          </div>
        </div>
      )}

      {/* Signals */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-white">Health Signals</h2>
          </div>
          {signals.length > 0 && (
            <span className="text-xs text-slate-500">{signals.length} active</span>
          )}
        </div>

        {signals.length === 0 ? (
          <div className="card-sm text-center py-8">
            <Zap className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">
              {hasData
                ? 'No signals right now — your metrics look stable.'
                : 'Signals will appear here after syncing your data.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {signals.map((signal) => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-8 w-48 bg-slate-700 rounded mb-2" />
        <div className="h-4 w-32 bg-slate-700 rounded" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card h-40" />
        ))}
      </div>
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card h-24" />
        ))}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  )
}
