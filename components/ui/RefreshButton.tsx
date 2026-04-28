'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Loader2 } from 'lucide-react'

interface RefreshButtonProps {
  label?: string
}

export function RefreshButton({ label }: RefreshButtonProps) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSync() {
    setSyncing(true)
    setMessage(null)

    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setMessage(`Synced ${data.metricsInserted || 0} new metrics`)
        router.refresh()
      } else {
        setMessage(data.error || 'Sync failed')
      }
    } catch {
      setMessage('Sync failed — check your connection')
    } finally {
      setSyncing(false)
      setTimeout(() => setMessage(null), 4000)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span className="text-sm text-slate-400 animate-fade-in">{message}</span>
      )}
      <button
        onClick={handleSync}
        disabled={syncing}
        className="btn-secondary flex items-center gap-2 text-sm"
      >
        {syncing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <RefreshCw className="w-4 h-4" />
        )}
        {label || (syncing ? 'Syncing...' : 'Sync')}
      </button>
    </div>
  )
}
