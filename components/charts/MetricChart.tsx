'use client'

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { BaselineBand } from './BaselineBand'
import { isAnomaly } from '@/lib/baseline/deviation'
import type { HealthMetric, Baseline } from '@/lib/supabase/types'
import { format } from 'date-fns'

interface MetricChartProps {
  metrics: HealthMetric[]
  baseline?: Baseline
  metricType: string
  label: string
  unit: string
  color?: string
}

interface ChartDataPoint {
  date: string
  dateLabel: string
  value: number
  isAnomaly: boolean
}

interface TooltipPayload {
  value: number
  name: string
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 shadow-xl">
        <p className="text-xs text-slate-400 mb-1">{label}</p>
        <p className="text-sm text-white font-medium">{payload[0]?.value}</p>
      </div>
    )
  }
  return null
}

interface CustomDotProps {
  cx?: number
  cy?: number
  payload?: ChartDataPoint
  color: string
}

const CustomDot = ({ cx, cy, payload, color }: CustomDotProps) => {
  if (cx === undefined || cy === undefined || !payload) return null
  if (payload.isAnomaly) {
    return (
      <g>
        <circle cx={cx} cy={cy} r={5} fill="#ef4444" stroke="#fca5a5" strokeWidth={1.5} opacity={0.9} />
      </g>
    )
  }
  return null
}

const ActiveDot = ({ cx, cy, color }: { cx?: number; cy?: number; color: string }) => {
  if (cx === undefined || cy === undefined) return null
  return <circle cx={cx} cy={cy} r={4} fill={color} strokeWidth={0} />
}

export function MetricChart({
  metrics,
  baseline,
  metricType,
  label,
  unit,
  color = '#6366f1',
}: MetricChartProps) {
  const sorted = [...metrics]
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())

  const chartData: ChartDataPoint[] = sorted.map((m) => ({
    date: m.recorded_at,
    dateLabel: format(new Date(m.recorded_at), 'MMM d'),
    value: m.value,
    isAnomaly: !!(baseline && isAnomaly(m.value, baseline)),
  }))

  if (chartData.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-slate-500 text-sm">No data available</p>
      </div>
    )
  }

  const allValues = chartData.map((d) => d.value)
  const minVal = Math.min(...allValues)
  const maxVal = Math.max(...allValues)
  const padding = (maxVal - minVal) * 0.15 || 5

  const yMin = Math.floor(minVal - padding)
  const yMax = Math.ceil(maxVal + padding)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(71, 85, 105, 0.3)" vertical={false} />
        <XAxis
          dataKey="dateLabel"
          tick={{ fontSize: 10, fill: '#64748b' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[yMin, yMax]}
          tick={{ fontSize: 10, fill: '#64748b' }}
          tickLine={false}
          axisLine={false}
          width={32}
          tickFormatter={(v: number) => `${v}`}
        />
        <Tooltip content={<CustomTooltip />} />

        {baseline && (
          <BaselineBand
            low={baseline.baseline_range_low}
            high={baseline.baseline_range_high}
            mean={baseline.baseline_value}
          />
        )}

        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={(props: unknown) => {
            const p = props as CustomDotProps
            return <CustomDot {...p} color={color} />
          }}
          activeDot={(props: unknown) => {
            const p = props as { cx?: number; cy?: number }
            return <ActiveDot {...p} color={color} />
          }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
