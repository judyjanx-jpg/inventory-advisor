import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--background)] disabled:opacity-50 disabled:cursor-not-allowed",

          // Variants
          variant === 'primary' && "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/25 focus:ring-cyan-500",
          variant === 'secondary' && "bg-[var(--secondary)] hover:bg-[var(--muted)] text-[var(--secondary-foreground)] focus:ring-[var(--ring)]",
          variant === 'ghost' && "bg-transparent hover:bg-[var(--hover-bg)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] focus:ring-[var(--ring)]",
          variant === 'danger' && "bg-red-600 hover:bg-red-500 text-white focus:ring-red-500",
          variant === 'success' && "bg-emerald-600 hover:bg-emerald-500 text-white focus:ring-emerald-500",
          variant === 'outline' && "bg-transparent border border-[var(--border)] hover:border-[var(--muted-foreground)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] focus:ring-[var(--ring)]",

          // Sizes
          size === 'sm' && "px-3 py-1.5 text-sm",
          size === 'md' && "px-4 py-2 text-sm",
          size === 'lg' && "px-6 py-3 text-base",

          className
        )}
        {...props}
      >
        {loading && (
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export default Button
