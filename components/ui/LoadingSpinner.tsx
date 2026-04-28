import { Loader2 } from 'lucide-react'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

export function LoadingSpinner({ size = 'md', label }: LoadingSpinnerProps) {
  const sizeClass = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-10 h-10',
  }[size]

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <Loader2 className={`${sizeClass} text-indigo-400 animate-spin`} />
      {label && <p className="text-sm text-slate-400">{label}</p>}
    </div>
  )
}
