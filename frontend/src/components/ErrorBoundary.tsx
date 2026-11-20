import { AlertTriangle, RefreshCcw, RotateCcw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  private handleReload = () => {
    window.location.reload()
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="mx-auto my-12 max-w-xl rounded-xl border border-crit/50 bg-ink-900 p-6 text-center shadow-2xl"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-crit/15 border border-crit/30 text-red-400">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-ink-100">
            {this.props.fallbackTitle ?? 'An unexpected error occurred'}
          </h2>
          <p className="mt-2 text-sm text-ink-300 leading-relaxed">
            {this.state.error?.message || 'The application encountered an unhandled exception while rendering this view.'}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button variant="primary" onClick={this.handleReset} aria-label="Retry loading this view">
              <RotateCcw className="h-4 w-4" /> Try again
            </Button>
            <Button variant="outline" onClick={this.handleReload} aria-label="Reload entire application">
              <RefreshCcw className="h-4 w-4" /> Reload application
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
