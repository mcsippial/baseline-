'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'
import {
  Settings, User, Wifi, Bell, Download,
  Save, Loader2, CheckCircle2, AlertCircle, Trash2
} from 'lucide-react'

type UserProfile = Database['public']['Tables']['users']['Row']

const DEVICES = [
  { id: 'oura', name: 'Oura Ring', icon: '⭕', description: 'Sleep, HRV, readiness metrics' },
  { id: 'apple', name: 'Apple Health', icon: '🍎', description: 'Activity, heart rate, workouts' },
  { id: 'whoop', name: 'Whoop', icon: '🔴', description: 'Recovery, strain, sleep performance' },
  { id: 'garmin', name: 'Garmin', icon: '🟢', description: 'GPS, body battery, stress' },
]

export default function SettingsPage() {
  const supabase = createClient()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [connectedDevices, setConnectedDevices] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (data) {
        setProfile(data)
        setName(data.name || '')
        setDob(data.date_of_birth || '')
        setConnectedDevices(data.connected_devices || [])
      }
      setLoading(false)
    }
    load()
  }, [supabase])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    const { error } = await supabase
      .from('users')
      .update({
        name: name || null,
        date_of_birth: dob || null,
        connected_devices: connectedDevices,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile!.id)

    if (error) {
      setSaveError(error.message)
    } else {
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    }
    setSaving(false)
  }

  function toggleDevice(deviceId: string) {
    setConnectedDevices((prev) =>
      prev.includes(deviceId)
        ? prev.filter((d) => d !== deviceId)
        : [...prev, deviceId]
    )
  }

  async function handleExport(format: 'json' | 'csv') {
    setExporting(true)
    try {
      const res = await fetch(`/api/export?format=${format}`)
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `baseline-export-${new Date().toISOString().split('T')[0]}.${format}`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch {
      // Handle silently
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-slate-700 rounded" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card h-40" />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <Settings className="w-8 h-8 text-indigo-400" />
          Settings
        </h1>
        <p className="text-slate-400 mt-1">Manage your profile, devices, and preferences</p>
      </div>

      {/* Profile section */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-indigo-400" />
          <h2 className="font-semibold text-white">Profile</h2>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              value={profile?.email || ''}
              disabled
              className="input opacity-50 cursor-not-allowed"
            />
            <p className="text-xs text-slate-600 mt-1">Email cannot be changed here</p>
          </div>

          <div>
            <label htmlFor="name" className="label">Full Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="input"
            />
          </div>

          <div>
            <label htmlFor="dob" className="label">Date of Birth</label>
            <input
              id="dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="input sm:max-w-xs"
              max={new Date().toISOString().split('T')[0]}
            />
          </div>

          {saveError && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {saveError}
            </div>
          )}

          {saveSuccess && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              Profile saved successfully
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Connected devices */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Wifi className="w-5 h-5 text-indigo-400" />
          <h2 className="font-semibold text-white">Connected Devices</h2>
        </div>
        <p className="text-slate-400 text-sm mb-4">
          Select which device data to include in your health tracking.
          All selected devices will be synced using mock data until real API connections are configured.
        </p>

        <div className="space-y-3">
          {DEVICES.map((device) => {
            const isConnected = connectedDevices.includes(device.id)
            return (
              <div
                key={device.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  isConnected
                    ? 'border-indigo-500/30 bg-indigo-500/5'
                    : 'border-slate-700 bg-slate-700/20'
                }`}
              >
                <span className="text-xl">{device.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{device.name}</p>
                  <p className="text-xs text-slate-500">{device.description}</p>
                </div>
                <button
                  onClick={() => toggleDevice(device.id)}
                  className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                    isConnected
                      ? 'bg-indigo-500/20 text-indigo-400 hover:bg-red-500/20 hover:text-red-400'
                      : 'bg-slate-700 text-slate-400 hover:bg-indigo-500/20 hover:text-indigo-400'
                  }`}
                >
                  {isConnected ? 'Disconnect' : 'Connect'}
                </button>
              </div>
            )
          })}
        </div>

        <p className="text-xs text-slate-600 mt-3">
          Changes will be applied on the next sync. Leave all unchecked to sync all devices (demo mode).
        </p>
      </div>

      {/* Notifications (stubbed) */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5 text-indigo-400" />
          <h2 className="font-semibold text-white">Notifications</h2>
        </div>
        <div className="space-y-3">
          {[
            { label: 'Health alerts', desc: 'Notify when a metric deviates significantly from baseline' },
            { label: 'Weekly report', desc: 'Summary of your weekly health trends every Monday' },
            { label: 'Appointment reminders', desc: 'Remind me to generate a brief before appointments' },
          ].map(({ label, desc }) => (
            <div key={label} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-xs text-slate-500">{desc}</p>
              </div>
              <div className="w-10 h-5 bg-slate-700 rounded-full relative opacity-50 cursor-not-allowed">
                <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-slate-500 rounded-full" />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-600 mt-2">Notification settings coming soon</p>
      </div>

      {/* Data export */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Download className="w-5 h-5 text-indigo-400" />
          <h2 className="font-semibold text-white">Export Your Data</h2>
        </div>
        <p className="text-slate-400 text-sm mb-4">
          Download all your health metrics and baselines in your preferred format.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleExport('json')}
            disabled={exporting}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export as JSON
          </button>
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export as CSV
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="card border-red-500/20 bg-red-500/5">
        <div className="flex items-center gap-2 mb-4">
          <Trash2 className="w-5 h-5 text-red-400" />
          <h2 className="font-semibold text-red-400">Danger Zone</h2>
        </div>
        <p className="text-slate-400 text-sm mb-4">
          These actions are permanent and cannot be undone.
        </p>
        <button
          className="text-sm text-red-400 border border-red-500/30 hover:bg-red-500/10 px-4 py-2 rounded-lg transition-colors opacity-50 cursor-not-allowed"
          disabled
          title="Coming soon"
        >
          Delete all health data
        </button>
      </div>
    </div>
  )
}
