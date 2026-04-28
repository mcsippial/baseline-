'use client'

import { Activity } from 'lucide-react'

interface StreamingMessageProps {
  content: string
}

export function StreamingMessage({ content }: StreamingMessageProps) {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Activity className="w-3.5 h-3.5 text-indigo-400" />
      </div>
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-3 bg-slate-800 border border-slate-700 text-slate-200">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {content}
          <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-pulse rounded-sm" />
        </p>
      </div>
    </div>
  )
}
