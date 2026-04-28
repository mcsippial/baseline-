'use client'

import Link from 'next/link'
import { Calendar, FileText, ChevronRight } from 'lucide-react'
import type { Appointment } from '@/lib/supabase/types'
import { format, formatDistanceToNow, isPast } from 'date-fns'

interface AppointmentBannerProps {
  appointment: Appointment
}

export function AppointmentBanner({ appointment }: AppointmentBannerProps) {
  const appointmentDate = new Date(appointment.appointment_at)
  const isUpcoming = !isPast(appointmentDate)
  const timeStr = formatDistanceToNow(appointmentDate, { addSuffix: true })

  return (
    <div className="flex items-center gap-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-3">
      <div className="flex-shrink-0">
        <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
          <Calendar className="w-5 h-5 text-indigo-400" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-white font-medium text-sm truncate">
            {appointment.provider_name}
          </p>
          {appointment.specialty && (
            <span className="text-xs text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
              {appointment.specialty}
            </span>
          )}
        </div>
        <p className="text-slate-400 text-xs mt-0.5">
          {format(appointmentDate, 'EEEE, MMMM d')} at {format(appointmentDate, 'h:mm a')}
          {' · '}
          <span className={isUpcoming ? 'text-indigo-400' : 'text-slate-500'}>
            {timeStr}
          </span>
        </p>
      </div>

      {!appointment.brief_generated && isUpcoming && (
        <Link
          href="/brief"
          className="flex-shrink-0 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          Generate Brief
          <ChevronRight className="w-3 h-3" />
        </Link>
      )}

      {appointment.brief_generated && (
        <Link
          href="/brief"
          className="flex-shrink-0 flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          View Brief
        </Link>
      )}
    </div>
  )
}
