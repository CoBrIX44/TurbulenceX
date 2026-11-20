import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// shadcn/ui-pattern button (vendored, no CLI).
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-accent/60 disabled:pointer-events-none disabled:opacity-45 cursor-pointer active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary: 'bg-sky-accent text-ink-950 hover:bg-cyan-300 shadow-[0_0_0_1px_rgba(34,211,238,0.4),0_8px_24px_-8px_rgba(34,211,238,0.6)]',
        secondary: 'bg-ink-700 text-ink-100 hover:bg-ink-600 border border-ink-600',
        ghost: 'text-ink-300 hover:text-ink-100 hover:bg-ink-800',
        outline: 'border border-ink-600 text-ink-200 hover:border-sky-accent/60 hover:text-ink-100 bg-transparent',
        danger: 'bg-crit/15 text-red-300 border border-crit/40 hover:bg-crit/25',
        ai: 'bg-ai/15 text-violet-200 border border-ai/40 hover:bg-ai/25',
        recover: 'bg-recover/15 text-emerald-200 border border-recover/40 hover:bg-recover/25',
      },
      size: { sm: 'h-7 px-2.5 text-xs', md: 'h-9 px-3.5', lg: 'h-10 px-5', icon: 'h-8 w-8 p-0' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
