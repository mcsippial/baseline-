import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const format_type = searchParams.get('format') || 'json'

    // Fetch all user data
    const [
      { data: profile },
      { data: metrics },
      { data: baselines },
      { data: signals },
      { data: appointments },
    ] = await Promise.all([
      supabase.from('users').select('*').eq('id', user.id).single(),
      supabase.from('health_metrics').select('*').eq('user_id', user.id).order('recorded_at', { ascending: true }),
      supabase.from('baselines').select('*').eq('user_id', user.id),
      supabase.from('signals').select('*').eq('user_id', user.id).order('generated_at', { ascending: false }),
      supabase.from('appointments').select('*').eq('user_id', user.id).order('appointment_at', { ascending: true }),
    ])

    const exportData = {
      exportedAt: new Date().toISOString(),
      exportVersion: '1.0',
      user: {
        id: profile?.id,
        email: profile?.email,
        name: profile?.name,
        dateOfBirth: profile?.date_of_birth,
        connectedDevices: profile?.connected_devices,
      },
      summary: {
        totalMetrics: metrics?.length || 0,
        metricsFrom: metrics?.[0]?.recorded_at,
        metricsTo: metrics?.[metrics.length - 1]?.recorded_at,
        metricTypes: [...new Set(metrics?.map((m) => m.metric_type) || [])],
        sources: [...new Set(metrics?.map((m) => m.source) || [])],
      },
      healthMetrics: metrics || [],
      baselines: baselines || [],
      signals: signals || [],
      appointments: appointments || [],
    }

    if (format_type === 'csv') {
      // Return CSV of just the health metrics
      const headers = ['id', 'source', 'metric_type', 'value', 'unit', 'recorded_at']
      const rows = (metrics || []).map((m) =>
        headers.map((h) => String((m as Record<string, unknown>)[h] ?? '')).join(',')
      )
      const csv = [headers.join(','), ...rows].join('\n')

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="baseline-export-${format(new Date(), 'yyyy-MM-dd')}.csv"`,
        },
      })
    }

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="baseline-export-${format(new Date(), 'yyyy-MM-dd')}.json"`,
      },
    })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
