'use client'

import { useState, useRef } from 'react'
import { Send, Loader2 } from 'lucide-react'

interface MessageInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
}

export function MessageInput({ onSend, disabled, placeholder }: MessageInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value)
    // Auto-resize
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 p-4 border-t border-slate-700/50">
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Ask about your health data... (Ctrl+Enter to send)'}
          disabled={disabled}
          rows={1}
          className="w-full bg-slate-800 border border-slate-600 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-3 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ minHeight: '48px', maxHeight: '160px' }}
        />
      </div>
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="flex-shrink-0 w-10 h-10 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors"
        title="Send (Ctrl+Enter)"
      >
        {disabled ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
      </button>
    </form>
  )
}
