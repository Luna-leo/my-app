'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { db } from '@/lib/db';
import { ParameterInfo } from '@/lib/db/schema';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export interface ChartConfiguration {
  title: string;
  xAxisParameter: string;
  yAxisParameters: string[];
  selectedDataIds: number[];
}

interface CreateChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDataIds: number[];
  onCreateChart: (config: ChartConfiguration) => void;
}

export function CreateChartDialog({ 
  open, 
  onOpenChange, 
  selectedDataIds,
  onCreateChart 
}: CreateChartDialogProps) {
  const [chartTitle, setChartTitle] = useState('');
  const [xAxisParameter, setXAxisParameter] = useState('timestamp');
  const [yAxisParameters, setYAxisParameters] = useState<string[]>([]);
  const [availableParameters, setAvailableParameters] = useState<ParameterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('basic');

  // Load available parameters based on selected data
  useEffect(() => {
    const loadParameters = async () => {
      if (selectedDataIds.length === 0) {
        setAvailableParameters([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Get metadata for selected data
        const metadata = await db.metadata
          .where('id')
          .anyOf(selectedDataIds)
          .toArray();

        // Get unique plant-machine combinations
        const plantMachinePairs = new Set(
          metadata.map(m => `${m.plant}-${m.machineNo}`)
        );

        // Load parameters for each plant-machine combination
        const allParameters: ParameterInfo[] = [];
        for (const pair of plantMachinePairs) {
          const [plant, machineNo] = pair.split('-');
          const params = await db.getParametersByPlantAndMachine(plant, machineNo);
          allParameters.push(...params);
        }

        // Remove duplicates based on parameterId
        const uniqueParameters = Array.from(
          new Map(allParameters.map(p => [p.parameterId, p])).values()
        );

        setAvailableParameters(uniqueParameters);
      } catch (error) {
        console.error('Failed to load parameters:', error);
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      loadParameters();
    }
  }, [open, selectedDataIds]);

  const handleYAxisToggle = (parameterId: string, checked: boolean) => {
    if (checked) {
      setYAxisParameters([...yAxisParameters, parameterId]);
    } else {
      setYAxisParameters(yAxisParameters.filter(id => id !== parameterId));
    }
  };

  const handleCreate = () => {
    const config: ChartConfiguration = {
      title: chartTitle || 'Untitled Chart',
      xAxisParameter,
      yAxisParameters,
      selectedDataIds
    };
    onCreateChart(config);
    onOpenChange(false);
    
    // Reset form
    setChartTitle('');
    setXAxisParameter('timestamp');
    setYAxisParameters([]);
    setActiveTab('basic');
  };

  const isValid = yAxisParameters.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Create Chart</DialogTitle>
          <DialogDescription>
            Configure your chart by selecting parameters for X and Y axes
          </DialogDescription>
        </DialogHeader>

        {selectedDataIds.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Please select data sources first using the Data Selection button
            </AlertDescription>
          </Alert>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Basic Settings</TabsTrigger>
              <TabsTrigger value="xaxis">X-Axis</TabsTrigger>
              <TabsTrigger value="yaxis">Y-Axis</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="chart-title">Chart Title</Label>
                <Input
                  id="chart-title"
                  placeholder="Enter chart title..."
                  value={chartTitle}
                  onChange={(e) => setChartTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Selected Data Sources</Label>
                <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
                  {selectedDataIds.length} data source(s) selected
                </div>
              </div>
            </TabsContent>

            <TabsContent value="xaxis" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="x-axis">X-Axis Parameter</Label>
                <Select value={xAxisParameter} onValueChange={setXAxisParameter}>
                  <SelectTrigger id="x-axis">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="timestamp">Timestamp</SelectItem>
                    {availableParameters.map((param) => (
                      <SelectItem key={param.parameterId} value={param.parameterId}>
                        {param.parameterName} ({param.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {xAxisParameter !== 'timestamp' && (
                <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-md">
                  Using {availableParameters.find(p => p.parameterId === xAxisParameter)?.parameterName} as X-axis
                </div>
              )}
            </TabsContent>

            <TabsContent value="yaxis" className="space-y-4">
              <div className="space-y-2">
                <Label>Y-Axis Parameters</Label>
                <p className="text-sm text-gray-600">
                  Select one or more parameters to display on the Y-axis
                </p>
              </div>

              <ScrollArea className="h-[300px] border rounded-md p-4">
                {loading ? (
                  <div className="text-center py-8 text-gray-500">
                    Loading parameters...
                  </div>
                ) : availableParameters.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No parameters available
                  </div>
                ) : (
                  <div className="space-y-3">
                    {availableParameters.map((param) => (
                      <div 
                        key={param.parameterId}
                        className="flex items-center space-x-3 p-2 rounded hover:bg-gray-50"
                      >
                        <Checkbox
                          id={`param-${param.parameterId}`}
                          checked={yAxisParameters.includes(param.parameterId)}
                          onCheckedChange={(checked) => 
                            handleYAxisToggle(param.parameterId, checked as boolean)
                          }
                          disabled={param.parameterId === xAxisParameter}
                        />
                        <Label 
                          htmlFor={`param-${param.parameterId}`}
                          className={`flex-1 cursor-pointer ${
                            param.parameterId === xAxisParameter ? 'text-gray-400' : ''
                          }`}
                        >
                          <div className="font-medium">{param.parameterName}</div>
                          <div className="text-xs text-gray-600">
                            ID: {param.parameterId} | Unit: {param.unit}
                          </div>
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {yAxisParameters.length > 0 && (
                <div className="text-sm text-gray-600 bg-green-50 p-3 rounded-md">
                  {yAxisParameters.length} parameter(s) selected for Y-axis
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button 
            onClick={handleCreate}
            disabled={!isValid || selectedDataIds.length === 0}
          >
            Create Chart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}