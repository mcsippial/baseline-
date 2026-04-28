'use client'

import { SparkLine } from '@/components/charts/SparkLine'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { HealthMetric, Baseline } from '@/lib/supabase/types'

interface MetricCardData {
  type: string
  label: string
  unit: string
  latest?: HealthMetric
  baseline?: Baseline
  sparklineData: { value: number; date: string }[]
  trend: 'up' | 'down' | 'neutral'
  deviationPct: number | null
}

interface MetricCardProps {
  data: MetricCardData
}

const METRIC_COLORS: Record<string, string> = {
  sleep_score: '#6366f1',
  hrv: '#10b981',
  resting_hr: '#f59e0b',
  recovery_score: '#3b82f6',
  spo2: '#8b5cf6',
  steps: '#ec4899',
  strain: '#ef4444',
  active_calories: '#f97316',
}

const TREND_GOOD_UP = new Set(['sleep_score', 'hrv', 'recovery_score', 'spo2', 'steps'])
const TREND_GOOD_DOWN = new Set(['resting_hr', 'strain'])

function getTrendColor(metricType: string, trend: 'up' | 'down' | 'neutral'): string {
  if (trend === 'neutral') return 'text-slate-500'
  const isGoodUp = TREND_GOOD_UP.has(metricType)
  const isGoodDown = TREND_GOOD_DOWN.has(metricType)

  if (trend === 'up' && isGoodUp) return 'text-emerald-400'
  if (trend === 'up' && isGoodDown) return 'text-red-400'
  if (trend === 'down' && isGoodDown) return 'text-emerald-400'
  if (trend === 'down' && isGoodUp) return 'text-red-400'
  return 'text-slate-500'
}

function getDeviationLabel(metricType: string, deviationPct: number): { text: string; color: string } {
  const abs = Math.abs(deviationPct)
  const dir = deviationPct >= 0 ? 'above' : 'below'

  if (abs < 5) return { text: 'At baseline', color: 'text-slate-400' }

  const isGoodAbove = TREND_GOOD_UP.has(metricType)
  const isGoodBelow = TREND_GOOD_DOWN.has(metricType)
  const isPositive =
    (dir === 'above' && isGoodAbove) ||
    (dir === 'below' && isGoodBelow)

  const color = isPositive ? 'text-emerald-400' : abs > 15 ? 'text-red-400' : 'text-amber-400'
  return { text: `${abs.toFixed(0)}% ${dir} baseline`, color }
}

export function MetricCard({ data }: MetricCardProps) {
  const { type, label, unit, latest, baseline, sparklineData, trend, deviationPct } = data
  const color = METRIC_COLORS[type] || '#6366f1'

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const trendColor = getTrendColor(type, trend)

  const deviation = deviationPct !== null
    ? getDeviationLabel(type, deviationPct)
    : null

  return (
    <div className="card hover:border-slate-600 transition-all duration-200 group">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
          {latest ? (
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-white">{latest.value}</span>
              <span className="text-sm text-slate-500">{unit}</span>
            </div>
          ) : (
            <div className="mt-1">
              <span className="text-slate-600 text-sm">No data</span>
            </div>
          )}
        </div>
        <div className={`flex items-center gap-1 ${trendColor}`}>
          <TrendIcon className="w-4 h-4" />
        </div>
      </div>

      {/* Sparkline */}
      <div className="my-3">
        <SparkLine
          data={sparklineData}
          baselineValue={baseline?.baseline_value}
          color={color}
          height={44}
        />
      </div>

      {/* Deviation from baseline */}
      {deviation && (
        <p className={`text-xs ${deviation.color} mt-1`}>
          {deviation.text}
        </p>
      )}
      {!deviation && baseline && (
        <p className="text-xs text-slate-500 mt-1">
          Baseline: {baseline.baseline_value} {unit}
        </p>
      )}
      {!baseline && (
        <p className="text-xs text-slate-600 mt-1">Building baseline...</p>
      )}

      {/* Source indicator */}
      {latest && (
        <p className="text-xs text-slate-700 mt-2 capitalize">
          via {latest.source}
        </p>
      )}
    </div>
  )
}
