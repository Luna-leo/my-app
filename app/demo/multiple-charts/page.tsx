'use client'

import { InteractiveUplotChart } from '@/components/charts/InteractiveUplotChart'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'


export default function MultipleChartsDemo() {
  // Create configurations for 4 different charts
  const chartConfigs: ChartConfiguration[] = [
    {
      title: 'Chart 1 - Sine Wave',
      chartType: 'line',
      xAxisParameter: 'index',
      yAxisParameters: ['value1', 'value2'],
      selectedDataIds: [1, 2],
    },
    {
      title: 'Chart 2 - Cosine Wave',
      chartType: 'line',
      xAxisParameter: 'index',
      yAxisParameters: ['value1', 'value2'],
      selectedDataIds: [3, 4],
    },
    {
      title: 'Chart 3 - Mixed Wave',
      chartType: 'scatter',
      xAxisParameter: 'index',
      yAxisParameters: ['value1', 'value2'],
      selectedDataIds: [5, 6],
    },
    {
      title: 'Chart 4 - Random Data',
      chartType: 'line',
      xAxisParameter: 'index',
      yAxisParameters: ['value1', 'value2'],
      selectedDataIds: [7, 8],
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Multiple Charts Demo</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Test selection zoom functionality across multiple charts. 
          Try selecting an area in one chart while dragging to another chart area.
        </p>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {chartConfigs.map((config, index) => (
            <div key={`chart-${index}`} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
              <InteractiveUplotChart
                config={config}
                aspectRatio="16:9"
                className="w-full"
                enableSelection={true}
                enableZoomToSelection={true}
                selectionOptions={{
                  color: ['#4285F4', '#34A853', '#FBBC04', '#EA4335'][index % 4],
                  opacity: 0.2,
                  minSize: 10,
                }}
              />
            </div>
          ))}
        </div>
        
        <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Testing Instructions:</h2>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Click and drag to create a selection box in any chart</li>
            <li>Try dragging from one chart into another chart&apos;s area</li>
            <li>Verify that only the initially clicked chart responds to the selection</li>
            <li>Test that selection zoom works properly for each individual chart</li>
            <li>Confirm that charts don&apos;t interfere with each other during selection</li>
          </ol>
        </div>
      </div>
    </div>
  )
}