import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAskStream } from '@/lib/claude/ask'
import { subDays } from 'date-fns'
import { z } from 'zod'

const AskRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  sessionId: z.string().min(1).max(100),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = AskRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { message, sessionId, history } = parsed.data

    // Get user profile
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    // Fetch recent metrics (14 days)
    const { data: metrics } = await supabase
      .from('health_metrics')
      .select('*')
      .eq('user_id', user.id)
      .gte('recorded_at', subDays(new Date(), 14).toISOString())
      .order('recorded_at', { ascending: false })

    // Fetch baselines
    const { data: baselines } = await supabase
      .from('baselines')
      .select('*')
      .eq('user_id', user.id)

    // Store user message
    await supabase.from('chat_messages').insert({
      user_id: user.id,
      session_id: sessionId,
      role: 'user',
      content: message,
    })

    // Create streaming response
    const stream = await createAskStream(
      message,
      history,
      profile,
      metrics || [],
      baselines || []
    )

    // We need to capture the full response to store it
    // Use a transform stream to tee the response
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    let fullResponse = ''

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = decoder.decode(chunk)
        fullResponse += text
        controller.enqueue(chunk)
      },
      async flush(controller) {
        // Store assistant message after streaming completes
        await supabase.from('chat_messages').insert({
          user_id: user.id,
          session_id: sessionId,
          role: 'assistant',
          content: fullResponse,
        })
        controller.terminate()
      },
    })

    const transformedStream = stream.pipeThrough(transformStream)

    return new Response(transformedStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (error) {
    console.error('Error in ask route:', error)
    return NextResponse.json(
      { error: 'Failed to process your question' },
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

  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId')

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  }

  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('user_id', user.id)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }

  return NextResponse.json({ messages })
}
