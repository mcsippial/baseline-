import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateContextBrief } from '@/lib/claude/brief'
import { subDays } from 'date-fns'
import { z } from 'zod'

const BriefRequestSchema = z.object({
  providerName: z.string().min(1).max(200),
  specialty: z.string().max(200).optional().default(''),
  appointmentDate: z.string().refine((d) => !isNaN(Date.parse(d)), {
    message: 'Invalid date format',
  }),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = BriefRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { providerName, specialty, appointmentDate } = parsed.data

    // Get user profile
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Fetch 90 days of metrics
    const now = new Date()
    const ninetyDaysAgo = subDays(now, 90)

    const { data: metrics } = await supabase
      .from('health_metrics')
      .select('*')
      .eq('user_id', user.id)
      .gte('recorded_at', ninetyDaysAgo.toISOString())
      .order('recorded_at', { ascending: true })

    if (!metrics || metrics.length === 0) {
      return NextResponse.json(
        { error: 'No health data available. Please sync your devices first.' },
        { status: 422 }
      )
    }

    // Fetch baselines
    const { data: baselines } = await supabase
      .from('baselines')
      .select('*')
      .eq('user_id', user.id)

    // Generate brief via Claude
    const briefContent = await generateContextBrief(
      profile,
      metrics,
      baselines || [],
      providerName,
      specialty,
      appointmentDate
    )

    // Store in DB
    const { data: brief, error } = await supabase
      .from('context_briefs')
      .insert({
        user_id: user.id,
        appointment_date: appointmentDate,
        provider_name: providerName,
        generated_content: briefContent as unknown as Record<string, unknown>,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ brief, content: briefContent })
  } catch (error) {
    console.error('Error generating brief:', error)
    return NextResponse.json(
      { error: 'Failed to generate context brief' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: briefs, error } = await supabase
    .from('context_briefs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch briefs' }, { status: 500 })
  }

  return NextResponse.json({ briefs })
}
