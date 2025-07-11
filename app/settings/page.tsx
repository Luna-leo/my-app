'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StartupService, StartupMode } from '@/lib/services/startupService'

export default function SettingsPage() {
  const router = useRouter()
  const [startupMode, setStartupMode] = useState<StartupMode>('restore')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    // Load current settings
    const currentMode = StartupService.getDefaultMode()
    setStartupMode(currentMode)
  }, [])

  const handleSave = () => {
    setIsSaving(true)
    StartupService.saveDefaultMode(startupMode)
    
    // Show feedback
    setTimeout(() => {
      setIsSaving(false)
    }, 500)
  }

  const handleBack = () => {
    router.push('/')
  }

  return (
    <div className="container mx-auto p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={handleBack}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          
          <h1 className="text-4xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground">
            Configure your application preferences
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Startup Mode</CardTitle>
            <CardDescription>
              Choose how the application starts when you open it
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={startupMode} onValueChange={(value) => setStartupMode(value as StartupMode)}>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="restore" id="restore" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="restore" className="font-medium cursor-pointer">
                      Restore Previous Session
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Automatically load your last workspace with all charts and selected data
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="clean" id="clean" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="clean" className="font-medium cursor-pointer">
                      Always Start Fresh
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Begin with a new empty workspace every time you open the application
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="interactive" id="interactive" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="interactive" className="font-medium cursor-pointer">
                      Ask Every Time
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Show a dialog on startup to choose between recent workspaces or starting fresh
                    </p>
                  </div>
                </div>
              </div>
            </RadioGroup>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleBack}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-sm text-muted-foreground">
          <p>
            Note: You can always override the default behavior by using URL parameters:
          </p>
          <ul className="mt-2 space-y-1">
            <li>• <code className="bg-muted px-1 py-0.5 rounded">?clean=true</code> - Force a clean start</li>
            <li>• <code className="bg-muted px-1 py-0.5 rounded">?workspace=&lt;id&gt;</code> - Load a specific workspace</li>
          </ul>
        </div>
      </div>
    </div>
  )
}