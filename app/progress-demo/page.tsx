"use client"

import { useState, useEffect } from "react"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function ProgressDemo() {
  const [progress, setProgress] = useState(0)
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    if (isRunning) {
      const timer = setTimeout(() => {
        if (progress < 100) {
          setProgress(progress + 10)
        } else {
          setIsRunning(false)
        }
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [progress, isRunning])

  const handleStart = () => {
    setProgress(0)
    setIsRunning(true)
  }

  const handleReset = () => {
    setProgress(0)
    setIsRunning(false)
  }

  return (
    <div className="container mx-auto p-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Progress Component Demo</CardTitle>
          <CardDescription>
            A demonstration of the Progress component with various states and controls
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Basic Progress */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Basic Progress</h3>
            <Progress value={33} className="w-full" />
          </div>

          {/* Interactive Progress */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Interactive Progress</h3>
            <Progress value={progress} className="w-full" />
            <div className="flex items-center gap-4">
              <Button 
                onClick={handleStart} 
                disabled={isRunning}
                variant="default"
                size="sm"
              >
                Start Progress
              </Button>
              <Button 
                onClick={handleReset}
                variant="outline"
                size="sm"
              >
                Reset
              </Button>
              <span className="text-sm text-muted-foreground">
                {progress}%
              </span>
            </div>
          </div>

          {/* Different Sizes */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Different Sizes</h3>
            <div className="space-y-3">
              <Progress value={60} className="h-1" />
              <Progress value={60} className="h-2" />
              <Progress value={60} className="h-3" />
              <Progress value={60} className="h-4" />
            </div>
          </div>

          {/* Custom Styled Progress */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Custom Styled Progress</h3>
            <Progress 
              value={75} 
              className="h-2 bg-secondary/50 [&>*]:bg-green-500" 
            />
            <Progress 
              value={50} 
              className="h-3 bg-red-100 [&>*]:bg-red-500" 
            />
            <Progress 
              value={90} 
              className="h-2 bg-blue-100 [&>*]:bg-blue-500" 
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}