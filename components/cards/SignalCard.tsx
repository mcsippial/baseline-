'use client'

import { useState } from 'react'
import { X, Info, AlertTriangle, AlertCircle } from 'lucide-react'
import type { Signal } from '@/lib/supabase/types'
import { formatDistanceToNow } from 'date-fns'

interface SignalCardProps {
  signal: Signal
  onDismiss?: (id: string) => void
}

const SEVERITY_CONFIG = {
  info: {
    icon: Info,
    badgeClass: 'badge-info',
    borderClass: 'border-blue-500/20',
    bgClass: 'bg-blue-500/5',
    iconClass: 'text-blue-400',
    label: 'Info',
  },
  watch: {
    icon: AlertTriangle,
    badgeClass: 'badge-watch',
    borderClass: 'border-amber-500/20',
    bgClass: 'bg-amber-500/5',
    iconClass: 'text-amber-400',
    label: 'Watch',
  },
  alert: {
    icon: AlertCircle,
    badgeClass: 'badge-alert',
    borderClass: 'border-red-500/20',
    bgClass: 'bg-red-500/5',
    iconClass: 'text-red-400',
    label: 'Alert',
  },
}

export function SignalCard({ signal, onDismiss }: SignalCardProps) {
  const [dismissing, setDismissing] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const config = SEVERITY_CONFIG[signal.severity]
  const Icon = config.icon

  async function handleDismiss() {
    setDismissing(true)
    try {
      const res = await fetch('/api/signals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signalId: signal.id }),
      })
      if (res.ok) {
        setDismissed(true)
        onDismiss?.(signal.id)
      }
    } catch {
      // Handle error silently
    } finally {
      setDismissing(false)
    }
  }

  if (dismissed) return null

  return (
    <div
      className={`card-sm border ${config.borderClass} ${config.bgClass} animate-fade-in`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex-shrink-0 ${config.iconClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={config.badgeClass}>{config.label}</span>
            <h3 className="font-medium text-white text-sm">{signal.title}</h3>
          </div>
          <p className="text-slate-400 text-sm leading-relaxed">{signal.body}</p>

          {signal.supporting_metrics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {signal.supporting_metrics.map((metric) => (
                <span
                  key={metric}
                  className="text-xs bg-slate-700/50 text-slate-400 border border-slate-600/50 px-2 py-0.5 rounded-full"
                >
                  {metric.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-600 mt-2">
            {formatDistanceToNow(new Date(signal.generated_at), { addSuffix: true })}
          </p>
        </div>

        <button
          onClick={handleDismiss}
          disabled={dismissing}
          className="flex-shrink-0 p-1 rounded-md text-slate-600 hover:text-slate-400 hover:bg-slate-700/50 transition-colors"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
