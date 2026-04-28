import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateSignals } from '@/lib/claude/signals'
import { subDays } from 'date-fns'
import type { SignalInsert } from '@/lib/supabase/types'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Return existing non-dismissed signals
    const { data: signals, error } = await supabase
      .from('signals')
      .select('*')
      .eq('user_id', user.id)
      .is('dismissed_at', null)
      .order('generated_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ signals })
  } catch (error) {
    console.error('Error fetching signals:', error)
    return NextResponse.json({ error: 'Failed to fetch signals' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const fourteenDaysAgo = subDays(now, 14)

    // Fetch recent metrics
    const { data: metricsData } = await supabase
      .from('health_metrics')
      .select('*')
      .eq('user_id', user.id)
      .gte('recorded_at', fourteenDaysAgo.toISOString())
      .order('recorded_at', { ascending: false })

    if (!metricsData || metricsData.length === 0) {
      return NextResponse.json({ signals: [], message: 'No metrics to analyze' })
    }

    // Fetch baselines
    const { data: baselines } = await supabase
      .from('baselines')
      .select('*')
      .eq('user_id', user.id)

    // Generate signals via Claude
    const generatedSignals = await generateSignals(metricsData, baselines || [])

    if (generatedSignals.length === 0) {
      return NextResponse.json({ signals: [] })
    }

    // Delete old signals and insert new ones
    await supabase.from('signals').delete().eq('user_id', user.id)

    const signalInserts: SignalInsert[] = generatedSignals.map((s) => ({
      user_id: user.id,
      signal_type: s.signal_type,
      severity: s.severity,
      title: s.title,
      body: s.body,
      supporting_metrics: s.supporting_metrics,
      generated_at: now.toISOString(),
    }))

    const { data: inserted, error } = await supabase
      .from('signals')
      .insert(signalInserts)
      .select()

    if (error) throw error

    return NextResponse.json({ signals: inserted })
  } catch (error) {
    console.error('Error generating signals:', error)
    return NextResponse.json(
      { error: 'Failed to generate signals' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { signalId } = await request.json()
    if (!signalId) {
      return NextResponse.json({ error: 'Missing signalId' }, { status: 400 })
    }

    const { error } = await supabase
      .from('signals')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', signalId)
      .eq('user_id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error dismissing signal:', error)
    return NextResponse.json({ error: 'Failed to dismiss signal' }, { status: 500 })
  }
}
