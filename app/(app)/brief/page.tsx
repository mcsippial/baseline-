'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { BriefDocument } from '@/components/brief/BriefDocument'
import { createClient } from '@/lib/supabase/client'
import type { BriefContent } from '@/lib/supabase/types'
import {
  FileText, Loader2, Download, Calendar, User,
  Stethoscope, ChevronRight, AlertCircle
} from 'lucide-react'

// Dynamically import PDF renderer (server-side only compatible component)
const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then((mod) => mod.PDFDownloadLink),
  { ssr: false, loading: () => null }
)

const BriefPDF = dynamic(
  () => import('@/components/brief/BriefPDF').then((mod) => mod.BriefPDF),
  { ssr: false }
)

interface BriefResult {
  content: BriefContent
  providerName: string
  appointmentDate: string
  specialty: string
}

export default function BriefPage() {
  const supabase = createClient()
  const [providerName, setProviderName] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [appointmentDate, setAppointmentDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BriefResult | null>(null)
  const [patientName, setPatientName] = useState<string | undefined>()

  async function loadPatientName() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('name')
        .eq('id', user.id)
        .single()
      setPatientName(profile?.name || undefined)
    }
  }

  useEffect(() => {
    loadPatientName()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerName, specialty, appointmentDate }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to generate brief')
      } else {
        setResult({
          content: data.content,
          providerName,
          appointmentDate,
          specialty,
        })
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <FileText className="w-8 h-8 text-indigo-400" />
          Context Brief
        </h1>
        <p className="text-slate-400 mt-1">
          Generate an AI-powered health summary for your upcoming medical appointment
        </p>
      </div>

      {/* Form */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Appointment Details</h2>
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="providerName" className="label">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  Provider Name
                </span>
              </label>
              <input
                id="providerName"
                type="text"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="Dr. Sarah Johnson"
                className="input"
                required
              />
            </div>

            <div>
              <label htmlFor="specialty" className="label">
                <span className="flex items-center gap-1.5">
                  <Stethoscope className="w-3.5 h-3.5" />
                  Specialty (optional)
                </span>
              </label>
              <input
                id="specialty"
                type="text"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="Cardiology, GP, Sports Medicine..."
                className="input"
              />
            </div>
          </div>

          <div>
            <label htmlFor="appointmentDate" className="label">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Appointment Date
              </span>
            </label>
            <input
              id="appointmentDate"
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              className="input sm:max-w-xs"
              required
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing your health data...
              </>
            ) : (
              <>
                Generate Brief
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="card text-center py-12">
          <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Generating your brief</h3>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            Claude is analyzing 90 days of your health data and preparing a clinical summary...
          </p>
        </div>
      )}

      {/* Brief result */}
      {result && !loading && (
        <div className="card animate-fade-in">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Your Context Brief</h2>
            <PDFDownloadLink
              document={
                <BriefPDF
                  content={result.content}
                  providerName={result.providerName}
                  appointmentDate={result.appointmentDate}
                  patientName={patientName}
                />
              }
              fileName={`baseline-brief-${result.appointmentDate}.pdf`}
            >
              {({ loading: pdfLoading }) => (
                <button
                  className="btn-secondary flex items-center gap-2 text-sm"
                  disabled={pdfLoading}
                >
                  {pdfLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Download PDF
                </button>
              )}
            </PDFDownloadLink>
          </div>

          <BriefDocument
            content={result.content}
            providerName={result.providerName}
            appointmentDate={result.appointmentDate}
            patientName={patientName}
          />
        </div>
      )}
    </div>
  )
}
