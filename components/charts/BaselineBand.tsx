'use client'

import { ReferenceArea, ReferenceLine } from 'recharts'

interface BaselineBandProps {
  low: number
  high: number
  mean: number
}

export function BaselineBand({ low, high, mean }: BaselineBandProps) {
  return (
    <>
      <ReferenceArea
        y1={low}
        y2={high}
        fill="rgba(99, 102, 241, 0.08)"
        stroke="rgba(99, 102, 241, 0.2)"
        strokeDasharray="4 4"
      />
      <ReferenceLine
        y={mean}
        stroke="rgba(99, 102, 241, 0.5)"
        strokeDasharray="6 3"
        strokeWidth={1}
        label={{
          value: 'baseline',
          position: 'insideTopRight',
          fill: 'rgba(99, 102, 241, 0.7)',
          fontSize: 10,
        }}
      />
    </>
  )
}
