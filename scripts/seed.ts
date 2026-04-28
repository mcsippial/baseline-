/**
 * Seed script: Creates a demo user and generates 90 days of realistic health data
 * Usage: npx tsx scripts/seed.ts
 * Env vars:
 *   SUPABASE_SEED_USER_EMAIL (default: demo@baseline.app)
 *   SUPABASE_SEED_USER_PASSWORD (default: Demo1234!)
 */

import { createClient } from '@supabase/supabase-js'
import { subDays, format } from 'date-fns'
import type { Database } from '../lib/supabase/types'

// Load env
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables:')
  console.error('  NEXT_PUBLIC_SUPABASE_URL')
  console.error('  SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const SEED_EMAIL = process.env.SUPABASE_SEED_USER_EMAIL || 'demo@baseline.app'
const SEED_PASSWORD = process.env.SUPABASE_SEED_USER_PASSWORD || 'Demo1234!'

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Simple seeded random for consistent data
function seededRandom(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(Math.sin(hash))
}

function dailyValue(date: Date, metric: string, source: string, min: number, max: number): number {
  const dateStr = date.toISOString().split('T')[0]
  const seed = `${dateStr}-${metric}-${source}`
  const varSeed = `${dateStr}-${metric}-${source}-v`
  const base = seededRandom(seed)
  const variation = (seededRandom(varSeed) - 0.5) * 0.12
  const normalized = Math.min(1, Math.max(0, base + variation))
  return Math.round((min + normalized * (max - min)) * 10) / 10
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  const variance = values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / (values.length - 1)
  return Math.sqrt(variance)
}

interface MetricRow {
  user_id: string
  source: string
  metric_type: string
  value: number
  unit: string
  recorded_at: string
}

function generateMetrics(userId: string, days: number = 90): MetricRow[] {
  const now = new Date()
  const metrics: MetricRow[] = []

  for (let d = days; d >= 0; d--) {
    const date = subDays(now, d)
    const isWeekend = date.getDay() === 0 || date.getDay() === 6

    // Oura
    const ouraTime = new Date(date)
    ouraTime.setHours(8, 0, 0, 0)
    const ouraSleep = Math.round(dailyValue(date, 'sleep_score', 'oura', 58, 82) + (isWeekend ? -3 : 0))
    const ouraHrv = dailyValue(date, 'hrv', 'oura', 38, 62)
    metrics.push(
      { user_id: userId, source: 'oura', metric_type: 'sleep_score', value: Math.max(45, Math.min(95, ouraSleep)), unit: 'score', recorded_at: ouraTime.toISOString() },
      { user_id: userId, source: 'oura', metric_type: 'hrv', value: ouraHrv, unit: 'ms', recorded_at: ouraTime.toISOString() },
      { user_id: userId, source: 'oura', metric_type: 'resting_hr', value: Math.round(60 - (ouraHrv - 50) * 0.2), unit: 'bpm', recorded_at: ouraTime.toISOString() },
      { user_id: userId, source: 'oura', metric_type: 'spo2', value: dailyValue(date, 'spo2', 'oura', 95.5, 99.0), unit: '%', recorded_at: ouraTime.toISOString() }
    )

    // Apple
    const appleTime = new Date(date)
    appleTime.setHours(22, 0, 0, 0)
    metrics.push(
      { user_id: userId, source: 'apple', metric_type: 'steps', value: Math.round(dailyValue(date, 'steps', 'apple', isWeekend ? 4500 : 7000, isWeekend ? 9000 : 12000)), unit: 'steps', recorded_at: appleTime.toISOString() },
      { user_id: userId, source: 'apple', metric_type: 'active_calories', value: Math.round(dailyValue(date, 'active_calories', 'apple', 220, 620)), unit: 'kcal', recorded_at: appleTime.toISOString() },
      { user_id: userId, source: 'apple', metric_type: 'resting_hr', value: Math.round(dailyValue(date, 'resting_hr', 'apple', 54, 69)), unit: 'bpm', recorded_at: appleTime.toISOString() },
      { user_id: userId, source: 'apple', metric_type: 'hrv', value: dailyValue(date, 'hrv', 'apple', 32, 58), unit: 'ms', recorded_at: appleTime.toISOString() }
    )

    // Whoop
    const whoopTime = new Date(date)
    whoopTime.setHours(7, 30, 0, 0)
    metrics.push(
      { user_id: userId, source: 'whoop', metric_type: 'recovery_score', value: Math.round(dailyValue(date, 'recovery_score', 'whoop', 42, 88)), unit: '%', recorded_at: whoopTime.toISOString() },
      { user_id: userId, source: 'whoop', metric_type: 'strain', value: dailyValue(date, 'strain', 'whoop', 6, 17), unit: 'score', recorded_at: whoopTime.toISOString() },
      { user_id: userId, source: 'whoop', metric_type: 'hrv', value: dailyValue(date, 'hrv', 'whoop', 42, 68), unit: 'ms', recorded_at: whoopTime.toISOString() },
      { user_id: userId, source: 'whoop', metric_type: 'sleep_score', value: Math.round(dailyValue(date, 'sleep_score', 'whoop', 62, 88)), unit: '%', recorded_at: whoopTime.toISOString() }
    )

    // Garmin
    const garminTime = new Date(date)
    garminTime.setHours(23, 30, 0, 0)
    metrics.push(
      { user_id: userId, source: 'garmin', metric_type: 'steps', value: Math.round(dailyValue(date, 'steps', 'garmin', isWeekend ? 4500 : 6000, isWeekend ? 10000 : 14000)), unit: 'steps', recorded_at: garminTime.toISOString() },
      { user_id: userId, source: 'garmin', metric_type: 'recovery_score', value: Math.round(dailyValue(date, 'recovery_score', 'garmin', 25, 95)), unit: '%', recorded_at: garminTime.toISOString() },
      { user_id: userId, source: 'garmin', metric_type: 'resting_hr', value: Math.round(dailyValue(date, 'resting_hr', 'garmin', 52, 68)), unit: 'bpm', recorded_at: garminTime.toISOString() },
      { user_id: userId, source: 'garmin', metric_type: 'spo2', value: dailyValue(date, 'spo2', 'garmin', 95.0, 99.0), unit: '%', recorded_at: garminTime.toISOString() }
    )
  }

  return metrics
}

function computeBaselines(metrics: MetricRow[], userId: string) {
  const grouped = new Map<string, number[]>()
  for (const m of metrics) {
    const existing = grouped.get(m.metric_type) || []
    existing.push(m.value)
    grouped.set(m.metric_type, existing)
  }

  const baselines = []
  for (const [metricType, values] of grouped.entries()) {
    if (values.length < 3) continue
    const avg = mean(values)
    const sd = stdDev(values)
    baselines.push({
      user_id: userId,
      metric_type: metricType,
      baseline_value: Math.round(avg * 100) / 100,
      baseline_range_low: Math.round((avg - sd) * 100) / 100,
      baseline_range_high: Math.round((avg + sd) * 100) / 100,
      window_days: 90,
      computed_at: new Date().toISOString(),
    })
  }
  return baselines
}

async function seed() {
  console.log('🌱 Starting seed...')
  console.log(`   Email: ${SEED_EMAIL}`)

  // Create or find user via admin API
  let userId: string

  // Try to find existing user
  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  const existingUser = existingUsers?.users?.find((u) => u.email === SEED_EMAIL)

  if (existingUser) {
    console.log(`   Found existing user: ${existingUser.id}`)
    userId = existingUser.id
  } else {
    // Create new user
    const { data: newUser, error } = await supabase.auth.admin.createUser({
      email: SEED_EMAIL,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { name: 'Demo User' },
    })

    if (error || !newUser.user) {
      console.error('Failed to create user:', error)
      process.exit(1)
    }

    userId = newUser.user.id
    console.log(`   Created new user: ${userId}`)
  }

  // Upsert user profile
  const { error: profileError } = await supabase.from('users').upsert({
    id: userId,
    email: SEED_EMAIL,
    name: 'Demo User',
    date_of_birth: '1988-03-15',
    connected_devices: ['oura', 'apple', 'whoop', 'garmin'],
    updated_at: new Date().toISOString(),
  })

  if (profileError) {
    console.error('Failed to upsert profile:', profileError)
    process.exit(1)
  }
  console.log('   ✓ Profile created/updated')

  // Generate metrics
  console.log('   Generating 90 days of mock metrics...')
  const metrics = generateMetrics(userId, 90)
  console.log(`   Generated ${metrics.length} metric data points`)

  // Delete existing metrics for this user
  await supabase.from('health_metrics').delete().eq('user_id', userId)

  // Insert in batches
  const batchSize = 500
  let inserted = 0
  for (let i = 0; i < metrics.length; i += batchSize) {
    const batch = metrics.slice(i, i + batchSize)
    const { error } = await supabase.from('health_metrics').insert(batch)
    if (error) {
      console.error('Error inserting batch:', error)
    } else {
      inserted += batch.length
    }
  }
  console.log(`   ✓ Inserted ${inserted} metrics`)

  // Compute and store baselines
  const baselines = computeBaselines(metrics, userId)
  await supabase.from('baselines').delete().eq('user_id', userId)
  const { error: baselineError } = await supabase.from('baselines').insert(baselines)
  if (baselineError) {
    console.error('Failed to insert baselines:', baselineError)
  } else {
    console.log(`   ✓ Computed ${baselines.length} baselines`)
  }

  // Create a sample upcoming appointment
  const appointmentDate = new Date()
  appointmentDate.setDate(appointmentDate.getDate() + 14)
  appointmentDate.setHours(10, 0, 0, 0)

  await supabase.from('appointments').delete().eq('user_id', userId)
  await supabase.from('appointments').insert({
    user_id: userId,
    provider_name: 'Dr. Sarah Chen',
    specialty: 'Internal Medicine',
    appointment_at: appointmentDate.toISOString(),
    brief_generated: false,
  })
  console.log(`   ✓ Created sample appointment with Dr. Sarah Chen (${format(appointmentDate, 'MMM d, yyyy')})`)

  console.log('\n✅ Seed complete!')
  console.log(`\n   Demo credentials:`)
  console.log(`   Email:    ${SEED_EMAIL}`)
  console.log(`   Password: ${SEED_PASSWORD}`)
  console.log('\n   Run "npm run dev" and visit http://localhost:3000/login')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
