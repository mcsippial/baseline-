'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import {
  Activity, LayoutDashboard, TrendingUp, FileText,
  MessageSquare, Settings, LogOut, Menu, X, ChevronRight
} from 'lucide-react'

type UserProfile = Database['public']['Tables']['users']['Row']

interface SidebarNavProps {
  user: User
  profile: UserProfile | null
}

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/baseline', label: 'My Baseline', icon: TrendingUp },
  { href: '/brief', label: 'Context Brief', icon: FileText },
  { href: '/ask', label: 'Ask Baseline', icon: MessageSquare },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function SidebarNav({ user, profile }: SidebarNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const displayName = profile?.name || user.email?.split('@')[0] || 'User'
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-slate-700/50">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <Activity className="w-5 h-5 text-white" />
        </div>
        <span className="text-lg font-bold text-white">Baseline</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={isActive ? 'sidebar-link-active' : 'sidebar-link'}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
              {isActive && <ChevronRight className="w-3 h-3 ml-auto opacity-50" />}
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="px-3 py-4 border-t border-slate-700/50">
        <div className="flex items-center gap-3 px-2 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{displayName}</p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {signingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-slate-800/50 border-r border-slate-700/50 flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-slate-900/95 backdrop-blur border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white">Baseline</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 text-slate-400 hover:text-white"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-30 flex">
          <div
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative flex flex-col w-64 bg-slate-800 border-r border-slate-700 pt-14">
            <SidebarContent />
          </div>
        </div>
      )}
    </>
  )
}
