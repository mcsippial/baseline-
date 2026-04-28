'use client'

import { useState } from 'react'
import { MessageList } from '@/components/chat/MessageList'
import { MessageInput } from '@/components/chat/MessageInput'
import { MessageSquare, Sparkles } from 'lucide-react'
import { nanoid } from '@/lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const STARTER_QUESTIONS = [
  "What does my HRV trend say about my recovery?",
  "How is my sleep quality compared to my baseline?",
  "What should I ask my doctor about my resting heart rate?",
  "Am I overtraining based on my recent metrics?",
  "What lifestyle changes might improve my recovery score?",
  "Explain my SpO2 readings and what they mean",
]

export default function AskPage() {
  const [sessionId] = useState(() => nanoid())
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  async function sendMessage(content: string) {
    if (isStreaming) return

    const userMessage: Message = {
      id: nanoid(),
      role: 'user',
      content,
    }

    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setStreamingContent('')
    setIsStreaming(true)

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          sessionId,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Request failed')
      }

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        assistantContent += chunk
        setStreamingContent(assistantContent)
      }

      const assistantMessage: Message = {
        id: nanoid(),
        role: 'assistant',
        content: assistantContent,
      }

      setMessages([...newMessages, assistantMessage])
      setStreamingContent('')
    } catch (error) {
      const errMessage: Message = {
        id: nanoid(),
        role: 'assistant',
        content: `I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
      }
      setMessages([...newMessages, errMessage])
      setStreamingContent('')
    } finally {
      setIsStreaming(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-6 flex-shrink-0">
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <MessageSquare className="w-8 h-8 text-indigo-400" />
          Ask Baseline
        </h1>
        <p className="text-slate-400 mt-1">
          Chat with AI about your health data and get personalized insights
        </p>
      </div>

      {/* Chat container */}
      <div className="flex-1 flex flex-col bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden min-h-0">
        {/* Messages */}
        <MessageList
          messages={messages}
          streamingContent={isStreaming ? streamingContent : undefined}
        />

        {/* Starter questions (shown when no messages) */}
        {messages.length === 0 && !isStreaming && (
          <div className="px-4 pb-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
              <Sparkles className="w-3 h-3" />
              Suggested questions
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STARTER_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  disabled={isStreaming}
                  className="text-left text-xs text-slate-400 hover:text-indigo-400 bg-slate-700/50 hover:bg-indigo-500/10 border border-slate-600 hover:border-indigo-500/40 px-3 py-2 rounded-lg transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <MessageInput
          onSend={sendMessage}
          disabled={isStreaming}
          placeholder="Ask about your health metrics... (Ctrl+Enter to send)"
        />
      </div>
    </div>
  )
}
