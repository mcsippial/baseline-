'use client'

import { LineChart, Line, ResponsiveContainer, ReferenceLine } from 'recharts'

interface SparkLineProps {
  data: { value: number; date: string }[]
  baselineValue?: number
  color?: string
  height?: number
}

export function SparkLine({
  data,
  baselineValue,
  color = '#6366f1',
  height = 48,
}: SparkLineProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className="w-full bg-slate-700/30 rounded animate-pulse"
        style={{ height }}
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
        {baselineValue !== undefined && (
          <ReferenceLine
            y={baselineValue}
            stroke="rgba(99, 102, 241, 0.3)"
            strokeDasharray="3 3"
            strokeWidth={1}
          />
        )}
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
