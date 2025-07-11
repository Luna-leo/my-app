'use client'

import { Button } from '@/components/ui/button'
import { StartupService } from '@/lib/services/startupService'

export function ClearStartupMode() {
  const handleClear = () => {
    // Clear the startup mode to default (restore)
    localStorage.removeItem('default-startup-mode')
    console.log('Startup mode cleared. Default mode will be "restore" on next refresh.')
    alert('Startup mode cleared. The app will restore the previous session on next refresh.')
  }

  const handleSetRestore = () => {
    StartupService.saveDefaultMode('restore')
    console.log('Startup mode set to "restore"')
    alert('Startup mode set to "restore". The app will restore the previous session on next refresh.')
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleClear} variant="outline" size="sm">
        Clear Startup Mode
      </Button>
      <Button onClick={handleSetRestore} variant="outline" size="sm">
        Set to Restore Mode
      </Button>
    </div>
  )
}