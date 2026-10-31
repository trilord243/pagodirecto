interface LoadStateProps {
  message: string
  onRetry?: () => void
}

export function LoadState({ message, onRetry }: LoadStateProps) {
  return (
    <div className="load-state" role={onRetry ? 'alert' : 'status'}>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="button button--ghost" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  )
}
