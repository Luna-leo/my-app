interface LoadingStateProps {
  message?: string
  progress?: {
    loaded: number
    total: number
  }
}

export function LoadingState({ message = 'Loading charts...', progress }: LoadingStateProps) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">
          {progress 
            ? `${message} (${progress.loaded}/${progress.total})`
            : message}
        </p>
        {progress && (
          <div className="mt-4 w-64 mx-auto">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${(progress.loaded / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}