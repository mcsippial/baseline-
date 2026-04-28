import Anthropic from '@anthropic-ai/sdk'
import type { HealthMetric, Baseline } from '@/lib/supabase/types'
import { computeZScore } from '@/lib/baseline/deviation'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export interface GeneratedSignal {
  signal_type: string
  severity: 'info' | 'watch' | 'alert'
  title: string
  body: string
  supporting_metrics: string[]
}

/**
 * Summarize recent metrics relative to baselines for Claude context
 */
function buildMetricSummary(
  metrics: HealthMetric[],
  baselines: Baseline[]
): string {
  const baselineMap = new Map(baselines.map((b) => [b.metric_type, b]))

  // Get the most recent value for each metric type
  const latestByType = new Map<string, HealthMetric>()
  for (const m of metrics) {
    const existing = latestByType.get(m.metric_type)
    if (!existing || new Date(m.recorded_at) > new Date(existing.recorded_at)) {
      latestByType.set(m.metric_type, m)
    }
  }

  const lines: string[] = []
  for (const [type, metric] of latestByType.entries()) {
    const baseline = baselineMap.get(type)
    if (baseline) {
      const zScore = computeZScore(metric.value, baseline)
      const pctDiff = ((metric.value - baseline.baseline_value) / baseline.baseline_value * 100).toFixed(1)
      const dir = metric.value > baseline.baseline_value ? 'above' : 'below'
      lines.push(
        `- ${type}: ${metric.value}${metric.unit} (baseline: ${baseline.baseline_value}${metric.unit}, ${Math.abs(parseFloat(pctDiff))}% ${dir} baseline, z-score: ${zScore.toFixed(2)})`
      )
    } else {
      lines.push(`- ${type}: ${metric.value}${metric.unit} (no baseline established)`)
    }
  }

  return lines.join('\n')
}

/**
 * Call Claude to analyze health metrics and return structured signals
 */
export async function generateSignals(
  metrics: HealthMetric[],
  baselines: Baseline[]
): Promise<GeneratedSignal[]> {
  const metricSummary = buildMetricSummary(metrics, baselines)

  const prompt = `You are a health data analyst reviewing wearable device data. Analyze the following health metrics and generate meaningful health signals.

## Recent Health Metrics (vs. personal baseline)
${metricSummary}

Generate 2-4 health signals based on this data. Each signal should be actionable and specific.

Severity levels:
- "info": Positive trend or general observation
- "watch": Something worth monitoring but not urgent
- "alert": Significant deviation that warrants attention

Return a JSON array with this exact structure:
[
  {
    "signal_type": "short_type_identifier",
    "severity": "info" | "watch" | "alert",
    "title": "Brief title (under 60 chars)",
    "body": "2-3 sentence explanation with specific numbers and context",
    "supporting_metrics": ["metric_type_1", "metric_type_2"]
  }
]

Focus on:
1. Significant deviations from personal baseline (z-score > 1.5)
2. Correlated metrics (e.g., low HRV + low recovery + high resting HR)
3. Positive trends worth highlighting
4. Early warning patterns

Return ONLY the JSON array, no other text.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  try {
    // Extract JSON from response (handle potential markdown code blocks)
    const jsonText = content.text.replace(/```json\n?|\n?```/g, '').trim()
    const signals = JSON.parse(jsonText) as GeneratedSignal[]

    // Validate and sanitize
    return signals
      .filter((s) => s.signal_type && s.severity && s.title && s.body)
      .map((s) => ({
        ...s,
        severity: ['info', 'watch', 'alert'].includes(s.severity) ? s.severity : 'info',
        supporting_metrics: Array.isArray(s.supporting_metrics) ? s.supporting_metrics : [],
      }))
  } catch {
    console.error('Failed to parse signals from Claude:', content.text)
    return []
  }
}
