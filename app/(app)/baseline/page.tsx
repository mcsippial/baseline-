'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MetricChart } from '@/components/charts/MetricChart'
import { subDays } from 'date-fns'
import type { HealthMetric, Baseline } from '@/lib/supabase/types'
import {
  TrendingUp, Wifi, Clock, RefreshCw, Loader2,
  CheckCircle2, AlertCircle
} from 'lucide-react'

const METRIC_CONFIG = [
  { type: 'sleep_score', label: 'Sleep Score', unit: 'score', color: '#6366f1' },
  { type: 'hrv', label: 'Heart Rate Variability', unit: 'ms', color: '#10b981' },
  { type: 'resting_hr', label: 'Resting Heart Rate', unit: 'bpm', color: '#f59e0b' },
  { type: 'recovery_score', label: 'Recovery Score', unit: '%', color: '#3b82f6' },
  { type: 'spo2', label: 'Blood Oxygen (SpO₂)', unit: '%', color: '#8b5cf6' },
  { type: 'steps', label: 'Daily Steps', unit: 'steps', color: '#ec4899' },
]

const DEVICES = [
  { id: 'oura', name: 'Oura Ring', icon: '⭕', color: 'indigo' },
  { id: 'apple', name: 'Apple Health', icon: '🍎', color: 'red' },
  { id: 'whoop', name: 'Whoop', icon: '🔴', color: 'rose' },
  { id: 'garmin', name: 'Garmin', icon: '🟢', color: 'emerald' },
]

type WindowDays = 30 | 90 | 365

export default function BaselinePage() {
  const supabase = createClient()
  const [windowDays, setWindowDays] = useState<WindowDays>(90)
  const [metrics, setMetrics] = useState<HealthMetric[]>([])
  const [baselines, setBaselines] = useState<Baseline[]>([])
  const [connectedDevices, setConnectedDevices] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const fromDate = subDays(new Date(), windowDays)

    const [metricsResult, baselinesResult, profileResult] = await Promise.all([
      supabase
        .from('health_metrics')
        .select('*')
        .eq('user_id', user.id)
        .gte('recorded_at', fromDate.toISOString())
        .order('recorded_at', { ascending: true }),
      supabase
        .from('baselines')
        .select('*')
        .eq('user_id', user.id),
      supabase
        .from('users')
        .select('connected_devices, updated_at')
        .eq('id', user.id)
        .single(),
    ])

    setMetrics(metricsResult.data || [])
    setBaselines(baselinesResult.data || [])
    setConnectedDevices(profileResult.data?.connected_devices || [])
    if (profileResult.data?.updated_at) {
      setLastSync(new Date(profileResult.data.updated_at))
    }
    setLoading(false)
  }, [supabase, windowDays])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch('/api/sync', { method: 'POST' })
      await fetchData()
      setLastSync(new Date())
    } catch {
      // Silent fail
    } finally {
      setSyncing(false)
    }
  }

  const baselineMap = new Map(baselines.map((b) => [b.metric_type, b]))

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-8 h-8 text-indigo-400" />
            My Baseline
          </h1>
          <p className="text-slate-400 mt-1">
            Your personal health baselines derived from {windowDays} days of data
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Window toggle */}
          <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
            {([30, 90, 365] as WindowDays[]).map((days) => (
              <button
                key={days}
                onClick={() => setWindowDays(days)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                  windowDays === days
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {days === 365 ? '1y' : `${days}d`}
              </button>
            ))}
          </div>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {syncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {/* Connected devices */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Wifi className="w-5 h-5 text-indigo-400" />
          <h2 className="font-semibold text-white">Connected Devices</h2>
          {lastSync && (
            <span className="ml-auto text-xs text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Last sync: {lastSync.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {DEVICES.map((device) => {
            const isConnected = connectedDevices.length === 0 || connectedDevices.includes(device.id)
            return (
              <div
                key={device.id}
                className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                  isConnected
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-slate-700 bg-slate-700/20 opacity-50'
                }`}
              >
                <span className="text-lg">{device.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{device.name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {isConnected ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span className="text-xs text-emerald-400">Active</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3 h-3 text-slate-500" />
                        <span className="text-xs text-slate-500">Inactive</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Metric charts grid */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {METRIC_CONFIG.map(({ type }) => (
            <div key={type} className="card h-64 animate-pulse">
              <div className="h-4 w-32 bg-slate-700 rounded mb-4" />
              <div className="h-full bg-slate-700/30 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {METRIC_CONFIG.map(({ type, label, unit, color }) => {
            const typeMetrics = metrics.filter((m) => m.metric_type === type)
            const baseline = baselineMap.get(type)

            return (
              <div key={type} className="card">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-white">{label}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {typeMetrics.length} data points · {windowDays} day window
                    </p>
                  </div>
                  {baseline && (
                    <div className="text-right">
                      <p className="text-sm font-medium text-white">
                        {baseline.baseline_value} {unit}
                      </p>
                      <p className="text-xs text-slate-500">
                        ±{((baseline.baseline_range_high - baseline.baseline_range_low) / 2).toFixed(1)} {unit}
                      </p>
                    </div>
                  )}
                </div>
                <div className="h-48">
                  {typeMetrics.length > 0 ? (
                    <MetricChart
                      metrics={typeMetrics}
                      baseline={baseline}
                      metricType={type}
                      label={label}
                      unit={unit}
                      color={color}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-slate-600 text-sm">No data for this metric</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
