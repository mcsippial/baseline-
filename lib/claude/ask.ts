import Anthropic from '@anthropic-ai/sdk'
import type { HealthMetric, Baseline, User } from '@/lib/supabase/types'
import { computeZScore } from '@/lib/baseline/deviation'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

function buildSystemPrompt(
  user: User,
  recentMetrics: HealthMetric[],
  baselines: Baseline[]
): string {
  const baselineMap = new Map(baselines.map((b) => [b.metric_type, b]))

  // Get latest value per metric type
  const latestByType = new Map<string, HealthMetric>()
  for (const m of recentMetrics) {
    const existing = latestByType.get(m.metric_type)
    if (!existing || new Date(m.recorded_at) > new Date(existing.recorded_at)) {
      latestByType.set(m.metric_type, m)
    }
  }

  const metricLines: string[] = []
  for (const [type, metric] of latestByType.entries()) {
    const baseline = baselineMap.get(type)
    if (baseline) {
      const zScore = computeZScore(metric.value, baseline)
      const pctDiff = ((metric.value - baseline.baseline_value) / baseline.baseline_value * 100).toFixed(1)
      const dir = metric.value >= baseline.baseline_value ? '+' : ''
      metricLines.push(
        `  - ${type}: ${metric.value}${metric.unit} (${dir}${pctDiff}% vs baseline of ${baseline.baseline_value}${metric.unit}, z=${zScore.toFixed(2)})`
      )
    } else {
      metricLines.push(`  - ${type}: ${metric.value}${metric.unit}`)
    }
  }

  const userName = user.name || 'the user'
  const ageStr = user.date_of_birth
    ? `${Math.floor((new Date().getTime() - new Date(user.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} years old`
    : ''

  return `You are Baseline AI, a personal health intelligence assistant. You help users understand their wearable health data and provide evidence-based insights.

## About the User
Name: ${userName}${ageStr ? `, ${ageStr}` : ''}

## Current Health Metrics (most recent readings vs. personal baseline)
${metricLines.length > 0 ? metricLines.join('\n') : '  No recent metrics available.'}

## Your Role
- Explain health metrics in plain language
- Identify patterns and correlations in the data
- Suggest lifestyle factors that may be affecting metrics
- Provide evidence-based recommendations
- Always recommend consulting healthcare providers for medical decisions
- Be conversational, empathetic, and specific to their data

## Important Boundaries
- You are NOT a medical device and cannot diagnose conditions
- Always recommend professional medical advice for health concerns
- Do not suggest specific medications or treatments
- Focus on lifestyle, sleep hygiene, stress management, and general wellness`
}

/**
 * Create a streaming response from Claude for the Ask Baseline chat
 */
export async function createAskStream(
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant', content: string }>,
  user: User,
  recentMetrics: HealthMetric[],
  baselines: Baseline[]
): Promise<ReadableStream<Uint8Array>> {
  const systemPrompt = buildSystemPrompt(user, recentMetrics, baselines)

  // Build messages array (last 10 exchanges for context)
  const messages = [
    ...conversationHistory.slice(-10),
    { role: 'user' as const, content: userMessage },
  ]

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  })

  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
}
