import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// shadcn/ui-pattern button (vendored, no CLI).
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 disabled:pointer-events-none disabled:opacity-45 cursor-pointer select-none',
  {
    variants: {
      variant: {
        primary: 'bg-sky-accent text-ink-950 font-semibold hover:bg-cyan-300 border border-cyan-300/50 shadow-sm active:bg-cyan-400',
        secondary: 'bg-ink-800 text-ink-100 hover:bg-ink-700 border border-ink-600/80 active:bg-ink-750',
        ghost: 'text-ink-300 hover:text-ink-100 hover:bg-ink-800/80',
        outline: 'border border-ink-600 text-ink-200 hover:border-sky-accent/70 hover:text-ink-100 bg-ink-900/60',
        danger: 'bg-crit/15 text-red-200 border border-crit/40 hover:bg-crit/25 active:bg-crit/30',
        ai: 'bg-ai/15 text-violet-200 border border-ai/40 hover:bg-ai/25 active:bg-ai/30',
        recover: 'bg-recover/15 text-emerald-200 border border-recover/40 hover:bg-recover/25 active:bg-recover/30',
      },
      size: { sm: 'h-8 px-2.5 text-xs', md: 'h-9 px-3.5', lg: 'h-10 px-5 text-base', icon: 'h-9 w-9 p-0' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
