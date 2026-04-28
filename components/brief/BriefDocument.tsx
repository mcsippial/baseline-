import type { BriefContent } from '@/lib/supabase/types'
import { format } from 'date-fns'
import {
  FileText, TrendingUp, AlertTriangle, CheckCircle,
  HelpCircle, Activity, ChevronRight
} from 'lucide-react'

interface BriefDocumentProps {
  content: BriefContent
  providerName: string
  appointmentDate: string
  patientName?: string
}

export function BriefDocument({
  content,
  providerName,
  appointmentDate,
  patientName,
}: BriefDocumentProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between pb-6 border-b border-slate-700">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            <span className="text-sm font-medium text-indigo-400">Baseline Health Intelligence</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Clinical Context Brief</h2>
          {patientName && (
            <p className="text-slate-400 mt-1">Prepared for: <span className="text-white">{patientName}</span></p>
          )}
        </div>
        <div className="text-right text-sm text-slate-400">
          <p className="font-medium text-white">{providerName}</p>
          <p>{format(new Date(appointmentDate), 'MMMM d, yyyy')}</p>
          <p className="text-xs mt-1 text-slate-500">Generated {format(new Date(), 'PPp')}</p>
        </div>
      </div>

      {/* Summary */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-indigo-400" />
          <h3 className="font-semibold text-white">Executive Summary</h3>
        </div>
        <p className="text-slate-300 leading-relaxed whitespace-pre-line">{content.summary}</p>
      </div>

      {/* Key Metrics */}
      {content.keyMetrics.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            <h3 className="font-semibold text-white">Key Metrics</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {content.keyMetrics.map((metric, i) => (
              <div key={i} className="card-sm">
                <div className="flex items-start justify-between mb-1">
                  <span className="text-sm font-medium text-white">{metric.name}</span>
                  <span className="text-sm font-bold text-indigo-400">{metric.value}</span>
                </div>
                <p className="text-xs text-amber-400 mb-1">{metric.trend}</p>
                <p className="text-xs text-slate-400">{metric.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two-column: Concerns + Positives */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Concerns */}
        {content.concerns.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h3 className="font-semibold text-white">Areas to Discuss</h3>
            </div>
            <ul className="space-y-2">
              {content.concerns.map((concern, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                  <ChevronRight className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                  {concern}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Positives */}
        {content.positives.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <h3 className="font-semibold text-white">Positive Indicators</h3>
            </div>
            <ul className="space-y-2">
              {content.positives.map((positive, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  {positive}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Questions for Provider */}
      {content.questionsForProvider.length > 0 && (
        <div className="card bg-indigo-500/5 border-indigo-500/20">
          <div className="flex items-center gap-2 mb-3">
            <HelpCircle className="w-4 h-4 text-indigo-400" />
            <h3 className="font-semibold text-white">Questions for Your Provider</h3>
          </div>
          <ol className="space-y-2">
            {content.questionsForProvider.map((question, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                <span className="flex-shrink-0 w-5 h-5 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center text-xs font-bold">
                  {i + 1}
                </span>
                {question}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Data methodology */}
      <div className="pt-4 border-t border-slate-700">
        <p className="text-xs text-slate-500 italic leading-relaxed">
          <span className="font-medium text-slate-400">Data Note: </span>
          {content.rawDataSummary}
        </p>
        <p className="text-xs text-slate-600 mt-2">
          This brief was generated by Baseline AI and should be reviewed in conjunction with clinical judgment.
          It is not a substitute for professional medical advice.
        </p>
      </div>
    </div>
  )
}
