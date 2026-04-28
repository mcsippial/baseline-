'use client'

import { useEffect, useRef } from 'react'
import { Activity } from 'lucide-react'

interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

interface MessageListProps {
  messages: Message[]
  streamingContent?: string
}

export function MessageList({ messages, streamingContent }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  if (messages.length === 0 && !streamingContent) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Activity className="w-8 h-8 text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Ask Baseline AI</h3>
          <p className="text-slate-400 text-sm max-w-sm">
            I can help you understand your health metrics, explain trends, and suggest lifestyle improvements.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message, i) => (
        <MessageBubble key={message.id || i} message={message} />
      ))}
      {streamingContent !== undefined && streamingContent !== '' && (
        <MessageBubble
          message={{ role: 'assistant', content: streamingContent }}
          isStreaming
        />
      )}
      <div ref={bottomRef} />
    </div>
  )
}

interface MessageBubbleProps {
  message: { role: 'user' | 'assistant'; content: string }
  isStreaming?: boolean
}

function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
          isUser
            ? 'bg-gradient-to-br from-indigo-500 to-purple-600'
            : 'bg-indigo-600/30 border border-indigo-500/30'
        }`}
      >
        {isUser ? (
          <span className="text-xs font-bold text-white">Y</span>
        ) : (
          <Activity className="w-3.5 h-3.5 text-indigo-400" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-indigo-600 text-white rounded-tr-sm'
            : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-sm'
        }`}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-pulse rounded-sm" />
          )}
        </p>
      </div>
    </div>
  )
}
