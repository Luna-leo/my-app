'use client'

import { InteractiveUplotChart } from '@/components/charts'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { useState } from 'react'

// Demo configuration
const demoConfig: ChartConfiguration = {
  title: 'Interactive Chart Demo',
  chartType: 'line',
  xAxisParameter: 'index',
  yAxisParameters: ['value1', 'value2'],
  selectedDataIds: [1, 2],
}

export default function InteractiveChartDemo() {
  const [selectedRange, setSelectedRange] = useState<{
    xMin: number
    xMax: number
    yMin: number
    yMax: number
  } | null>(null)
  const [viewport, setViewport] = useState<{
    xMin: number
    xMax: number
    yMin: number
    yMax: number
  } | null>(null)

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Interactive Chart Demo</h1>
      
      <div className="space-y-8">
        {/* Basic Selection */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">Box Selection</h2>
          <p className="text-gray-600 mb-4">
            Click the &quot;Box Selection&quot; button and drag on the chart to select a region. 
            You can export the selected data as CSV or JSON.
          </p>
          <div className="border rounded-lg p-4 bg-gray-50">
            <InteractiveUplotChart
              config={demoConfig}
              enableSelection={true}
              enableZoomToSelection={false}
              onSelectionChange={setSelectedRange}
            />
          </div>
          {selectedRange && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold">Selected Range:</h3>
              <pre className="text-sm mt-2">{JSON.stringify(selectedRange, null, 2)}</pre>
            </div>
          )}
        </section>

        {/* Zoom to Selection */}
        <section>
          <h2 className="text-2xl font-semibold mb-4">Zoom to Selection</h2>
          <p className="text-gray-600 mb-4">
            Click the &quot;Zoom Selection&quot; button, drag to select a region, then click &quot;Apply Zoom&quot; 
            to zoom into the selected area. Use &quot;Reset Zoom&quot; to return to the original view.
          </p>
          <div className="border rounded-lg p-4 bg-gray-50">
            <InteractiveUplotChart
              config={demoConfig}
              enableSelection={true}
              enableZoomToSelection={true}
              enableViewportControl={true}
              onViewportChange={setViewport}
              selectionOptions={{
                color: '#3B82F6',
                opacity: 0.3,
                minSize: 20,
              }}
            />
          </div>
          {viewport && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg">
              <h3 className="font-semibold">Current Viewport:</h3>
              <pre className="text-sm mt-2">{JSON.stringify(viewport, null, 2)}</pre>
            </div>
          )}
        </section>

        {/* Features List */}
        <section className="mt-12">
          <h2 className="text-2xl font-semibold mb-4">Features</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li>Box selection with visual feedback</li>
            <li>Zoom to selected region with smooth animation</li>
            <li>Export selected data as CSV or JSON</li>
            <li>Clear selection and reset zoom controls</li>
            <li>Customizable selection appearance</li>
            <li>Keyboard shortcuts (ESC to clear selection)</li>
            <li>Integration with existing chart features (tooltips, pan, zoom)</li>
          </ul>
        </section>

        {/* Usage Example */}
        <section className="mt-12">
          <h2 className="text-2xl font-semibold mb-4">Usage Example</h2>
          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
            <code>{`import { InteractiveUplotChart } from '@/components/charts'

<InteractiveUplotChart
  config={chartConfig}
  enableSelection={true}
  enableZoomToSelection={true}
  enableViewportControl={true}
  selectionOptions={{
    color: '#3B82F6',
    opacity: 0.3,
    minSize: 20,
  }}
  onSelectionChange={(range) => {
    console.log('Selected range:', range)
  }}
  onViewportChange={(viewport) => {
    console.log('Viewport changed:', viewport)
  }}
/>`}</code>
          </pre>
        </section>
      </div>
    </div>
  )
}