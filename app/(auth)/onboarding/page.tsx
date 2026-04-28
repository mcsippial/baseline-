'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Activity, Watch, Heart, Zap, Navigation,
  ChevronRight, Loader2, CheckCircle2, User, Calendar
} from 'lucide-react'

const DEVICES = [
  {
    id: 'oura',
    name: 'Oura Ring',
    description: 'Sleep, HRV, readiness',
    icon: '⭕',
    metrics: ['Sleep Score', 'HRV', 'Resting HR', 'SpO2'],
  },
  {
    id: 'apple',
    name: 'Apple Health',
    description: 'Activity, heart rate, workouts',
    icon: '🍎',
    metrics: ['Steps', 'Active Calories', 'Heart Rate'],
  },
  {
    id: 'whoop',
    name: 'Whoop',
    description: 'Recovery, strain, sleep',
    icon: '🔴',
    metrics: ['Recovery Score', 'Strain', 'Sleep Performance'],
  },
  {
    id: 'garmin',
    name: 'Garmin',
    description: 'GPS, activity, body battery',
    icon: '🟢',
    metrics: ['Body Battery', 'Steps', 'Stress Score'],
  },
]

const STEPS = ['profile', 'devices', 'confirm'] as const
type Step = typeof STEPS[number]

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState<Step>('profile')
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stepIndex = STEPS.indexOf(step)

  function toggleDevice(deviceId: string) {
    setSelectedDevices((prev) =>
      prev.includes(deviceId)
        ? prev.filter((d) => d !== deviceId)
        : [...prev, deviceId]
    )
  }

  async function handleFinish() {
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { error } = await supabase.from('users').upsert({
      id: user.id,
      email: user.email!,
      name: name || null,
      date_of_birth: dob || null,
      connected_devices: selectedDevices,
      updated_at: new Date().toISOString(),
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      // Trigger initial data sync
      try {
        await fetch('/api/sync', { method: 'POST' })
      } catch {
        // Non-fatal - sync can be retried
      }
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold text-white">Baseline</span>
        </div>

        {/* Progress steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  i < stepIndex
                    ? 'bg-indigo-600 text-white'
                    : i === stepIndex
                    ? 'bg-indigo-600 text-white ring-4 ring-indigo-500/30'
                    : 'bg-slate-700 text-slate-500'
                }`}
              >
                {i < stepIndex ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-12 h-0.5 ${i < stepIndex ? 'bg-indigo-600' : 'bg-slate-700'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="card">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Profile */}
          {step === 'profile' && (
            <div>
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-xl font-bold text-white">Your profile</h2>
                </div>
                <p className="text-slate-400 text-sm">This helps personalize your health insights</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="label">Full name (optional)</label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. Jane Smith"
                    className="input"
                    autoComplete="name"
                  />
                </div>

                <div>
                  <label htmlFor="dob" className="label">Date of birth (optional)</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      id="dob"
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="input pl-9"
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={() => setStep('devices')}
                className="btn-primary w-full mt-6 flex items-center justify-center gap-2"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 2: Connect Devices */}
          {step === 'devices' && (
            <div>
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <Watch className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-xl font-bold text-white">Connect your devices</h2>
                </div>
                <p className="text-slate-400 text-sm">
                  Select the devices you use. We&apos;ll use mock data until you connect real APIs.
                </p>
              </div>

              <div className="space-y-3">
                {DEVICES.map((device) => {
                  const isSelected = selectedDevices.includes(device.id)
                  return (
                    <button
                      key={device.id}
                      onClick={() => toggleDevice(device.id)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-500/10'
                          : 'border-slate-700 bg-slate-700/30 hover:border-slate-500'
                      }`}
                    >
                      <div className="text-2xl">{device.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{device.name}</span>
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-slate-400 text-sm">{device.description}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {device.metrics.map((m) => (
                            <span key={m} className="text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep('profile')} className="btn-secondary flex-1">
                  Back
                </button>
                <button
                  onClick={() => setStep('confirm')}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 'confirm' && (
            <div>
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-xl font-bold text-white">You&apos;re all set!</h2>
                </div>
                <p className="text-slate-400 text-sm">
                  Here&apos;s a summary of your setup. We&apos;ll generate 90 days of sample data to get you started.
                </p>
              </div>

              <div className="space-y-3">
                {name && (
                  <div className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg">
                    <User className="w-4 h-4 text-indigo-400" />
                    <div>
                      <p className="text-xs text-slate-500">Name</p>
                      <p className="text-white font-medium">{name}</p>
                    </div>
                  </div>
                )}
                {dob && (
                  <div className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg">
                    <Calendar className="w-4 h-4 text-indigo-400" />
                    <div>
                      <p className="text-xs text-slate-500">Date of birth</p>
                      <p className="text-white font-medium">{new Date(dob).toLocaleDateString()}</p>
                    </div>
                  </div>
                )}
                <div className="p-3 bg-slate-700/30 rounded-lg">
                  <p className="text-xs text-slate-500 mb-2">Connected devices</p>
                  {selectedDevices.length === 0 ? (
                    <p className="text-slate-400 text-sm">No devices selected — you can add them later in Settings</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedDevices.map((d) => {
                        const device = DEVICES.find((dev) => dev.id === d)
                        return (
                          <span key={d} className="text-sm bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-1 rounded-lg">
                            {device?.icon} {device?.name}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep('devices')} className="btn-secondary flex-1">
                  Back
                </button>
                <button
                  onClick={handleFinish}
                  disabled={loading}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      Launch Baseline
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
