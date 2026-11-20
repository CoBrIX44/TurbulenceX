import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('min-w-0 rounded-xl border border-ink-700/80 bg-ink-900 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]', className)}
      {...props}
    />
  )
}

export function CardHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-ink-700/70 px-4 py-3', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <div className="mt-0.5 text-sky-accent">{icon}</div>}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-wide text-ink-100">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />
}
