import Anthropic from '@anthropic-ai/sdk'
import type { HealthMetric, Baseline, User } from '@/lib/supabase/types'
import type { BriefContent } from '@/lib/supabase/types'
import { computeZScore } from '@/lib/baseline/deviation'
import { subDays, format } from 'date-fns'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

function buildHealthContext(
  user: User,
  metrics: HealthMetric[],
  baselines: Baseline[],
  providerName: string,
  specialty: string,
  appointmentDate: string
): string {
  const baselineMap = new Map(baselines.map((b) => [b.metric_type, b]))

  // Compute 90-day stats per metric
  const statsByType = new Map<string, { values: number[], unit: string }>()
  for (const m of metrics) {
    const existing = statsByType.get(m.metric_type)
    if (existing) {
      existing.values.push(m.value)
    } else {
      statsByType.set(m.metric_type, { values: [m.value], unit: m.unit })
    }
  }

  const metricLines: string[] = []
  for (const [type, { values, unit }] of statsByType.entries()) {
    const sorted = [...values].sort((a, b) => a - b)
    const avg = values.reduce((s, v) => s + v, 0) / values.length
    const min = sorted[0]
    const max = sorted[sorted.length - 1]
    const baseline = baselineMap.get(type)

    let baselineNote = ''
    if (baseline) {
      const latestValue = values[values.length - 1]
      const zScore = computeZScore(latestValue, baseline)
      baselineNote = ` | personal baseline: ${baseline.baseline_value}${unit} (±${((baseline.baseline_range_high - baseline.baseline_range_low)/2).toFixed(1)}) | current z-score: ${zScore.toFixed(2)}`
    }

    metricLines.push(
      `- ${type.replace(/_/g, ' ')}: avg ${avg.toFixed(1)}${unit}, range ${min}-${max}${unit}${baselineNote}`
    )
  }

  const ageStr = user.date_of_birth
    ? `${Math.floor((new Date().getTime() - new Date(user.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} years old`
    : 'age unknown'

  return `Patient: ${user.name || 'Patient'}, ${ageStr}
Appointment: ${format(new Date(appointmentDate), 'MMMM d, yyyy')} with ${providerName} (${specialty || 'General'})
Data period: Last 90 days from connected wearable devices

Health Metrics Summary:
${metricLines.join('\n')}`
}

/**
 * Generate a clinical context brief using Claude
 */
export async function generateContextBrief(
  user: User,
  metrics: HealthMetric[],
  baselines: Baseline[],
  providerName: string,
  specialty: string,
  appointmentDate: string
): Promise<BriefContent> {
  const context = buildHealthContext(user, metrics, baselines, providerName, specialty, appointmentDate)

  const prompt = `You are preparing a clinical context brief for a patient's upcoming medical appointment. This brief will help the healthcare provider quickly understand the patient's recent health trends from wearable device data.

## Patient Health Data
${context}

Generate a comprehensive clinical context brief as a JSON object with this exact structure:
{
  "summary": "2-3 paragraph executive summary of overall health status and notable trends",
  "keyMetrics": [
    {
      "name": "Metric display name",
      "value": "Current value with unit",
      "trend": "Trending up/down/stable over 30 days",
      "note": "Clinical significance or context"
    }
  ],
  "concerns": ["List of health concerns worth discussing, each as a complete sentence"],
  "positives": ["List of positive health indicators, each as a complete sentence"],
  "questionsForProvider": ["List of 4-6 specific questions the patient might want to ask their provider"],
  "rawDataSummary": "Technical summary paragraph for the provider about data sources and methodology"
}

Guidelines:
- Be clinically accurate but accessible
- Focus on patterns and trends, not single data points
- Note any metrics that deviate significantly from personal baseline
- Frame concerns constructively, not alarmingly
- Make provider questions specific and actionable
- Include data quality notes where relevant

Return ONLY the JSON object, no other text.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  try {
    const jsonText = content.text.replace(/```json\n?|\n?```/g, '').trim()
    return JSON.parse(jsonText) as BriefContent
  } catch {
    console.error('Failed to parse brief from Claude:', content.text)
    // Return a basic structure if parsing fails
    return {
      summary: content.text.slice(0, 500),
      keyMetrics: [],
      concerns: [],
      positives: [],
      questionsForProvider: [],
      rawDataSummary: 'Data generated from wearable device integrations.',
    }
  }
}
