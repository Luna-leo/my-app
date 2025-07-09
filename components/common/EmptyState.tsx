import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileSearch } from 'lucide-react'

export function EmptyState() {
  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>No Chart Created</CardTitle>
        <CardDescription>
          Follow these steps to create a chart
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6 py-8">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              1
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Import CSV Data</h3>
              <p className="text-sm text-muted-foreground">
                Use the &quot;Import CSV Data&quot; button to load your time series data
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              2
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Select Data Sources</h3>
              <p className="text-sm text-muted-foreground">
                Click &quot;Data Selection&quot; to choose which datasets to use
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              3
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Create Chart</h3>
              <p className="text-sm text-muted-foreground">
                Use &quot;Create Chart&quot; to configure X/Y axis parameters and generate your visualization
              </p>
            </div>
          </div>
          
          <div className="mt-8 flex justify-center">
            <FileSearch className="h-16 w-16 text-muted-foreground/50" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}