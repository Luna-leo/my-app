'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox, MultiCombobox } from '@/components/ui/combobox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { db } from '@/lib/db';
import { ParameterInfo } from '@/lib/db/schema';
import { AlertCircle, LineChart, ScatterChart } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export interface ChartConfiguration {
  title: string;
  chartType: 'line' | 'scatter';
  xAxisParameter: string;
  yAxisParameters: string[];
  selectedDataIds: number[];
}

interface CreateChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDataIds: number[];
  onCreateChart: (config: ChartConfiguration) => void;
  editMode?: boolean;
  chartToEdit?: ChartConfiguration & { id: string };
  onUpdateChart?: (config: ChartConfiguration & { id: string }) => void;
}

export function CreateChartDialog({ 
  open, 
  onOpenChange, 
  selectedDataIds,
  onCreateChart,
  editMode = false,
  chartToEdit,
  onUpdateChart
}: CreateChartDialogProps) {
  const [chartTitle, setChartTitle] = useState('');
  const [chartType, setChartType] = useState<'line' | 'scatter'>('scatter');
  const [xAxisParameter, setXAxisParameter] = useState('timestamp');
  const [yAxisParameters, setYAxisParameters] = useState<string[]>([]);
  const [availableParameters, setAvailableParameters] = useState<ParameterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('basic');
  
  // Initialize form values when editing
  useEffect(() => {
    if (editMode && chartToEdit && open) {
      setChartTitle(chartToEdit.title);
      setChartType(chartToEdit.chartType || 'line');
      setXAxisParameter(chartToEdit.xAxisParameter);
      setYAxisParameters(chartToEdit.yAxisParameters);
    } else if (!editMode && open) {
      // Reset form for new chart
      setChartTitle('');
      setChartType('scatter');
      setXAxisParameter('timestamp');
      setYAxisParameters([]);
    }
  }, [editMode, chartToEdit, open]);

  // Load available parameters based on selected data
  useEffect(() => {
    const loadParameters = async () => {
      // Use chartToEdit's selectedDataIds in edit mode, otherwise use the prop
      const dataIds = editMode && chartToEdit ? chartToEdit.selectedDataIds : selectedDataIds;
      
      if (dataIds.length === 0) {
        setAvailableParameters([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Get metadata for selected data
        const metadata = await db.metadata
          .where('id')
          .anyOf(dataIds)
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
  }, [open, selectedDataIds, editMode, chartToEdit]);


  const handleCreate = () => {
    if (editMode && chartToEdit && onUpdateChart) {
      const updatedConfig = {
        ...chartToEdit,
        title: chartTitle || 'Untitled Chart',
        chartType,
        xAxisParameter,
        yAxisParameters
      };
      onUpdateChart(updatedConfig);
    } else {
      const config: ChartConfiguration = {
        title: chartTitle || 'Untitled Chart',
        chartType,
        xAxisParameter,
        yAxisParameters,
        selectedDataIds
      };
      onCreateChart(config);
    }
    onOpenChange(false);
    
    // Reset form only for new charts
    if (!editMode) {
      setChartTitle('');
      setChartType('line');
      setXAxisParameter('timestamp');
      setYAxisParameters([]);
      setActiveTab('basic');
    }
  };

  const isValid = yAxisParameters.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{editMode ? 'Edit Chart' : 'Create Chart'}</DialogTitle>
          <DialogDescription>
            Configure your chart by selecting parameters for X and Y axes
          </DialogDescription>
        </DialogHeader>

        {(editMode && chartToEdit ? chartToEdit.selectedDataIds : selectedDataIds).length === 0 ? (
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
                <Label>Chart Type</Label>
                <RadioGroup value={chartType} onValueChange={(value) => setChartType(value as 'line' | 'scatter')}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="line" id="line" />
                    <Label htmlFor="line" className="flex items-center cursor-pointer">
                      <LineChart className="w-4 h-4 mr-2" />
                      Line Chart
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="scatter" id="scatter" />
                    <Label htmlFor="scatter" className="flex items-center cursor-pointer">
                      <ScatterChart className="w-4 h-4 mr-2" />
                      Scatter Plot
                    </Label>
                  </div>
                </RadioGroup>
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
                <Combobox
                  options={[
                    { value: 'timestamp', label: 'Timestamp' },
                    ...availableParameters.map((param) => ({
                      value: param.parameterId,
                      label: param.parameterName,
                      description: `ID: ${param.parameterId} | Unit: ${param.unit}`
                    }))
                  ]}
                  value={xAxisParameter}
                  onChange={setXAxisParameter}
                  placeholder="Select X-axis parameter..."
                  searchPlaceholder="Search parameters..."
                  emptyMessage="No parameters found."
                />
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

              {loading ? (
                <div className="text-center py-8 text-gray-500">
                  Loading parameters...
                </div>
              ) : availableParameters.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No parameters available
                </div>
              ) : (
                <MultiCombobox
                  options={availableParameters
                    .filter(param => param.parameterId !== xAxisParameter)
                    .map((param) => ({
                      value: param.parameterId,
                      label: param.parameterName,
                      description: `ID: ${param.parameterId} | Unit: ${param.unit}`
                    }))}
                  value={yAxisParameters}
                  onChange={setYAxisParameters}
                  placeholder="Select Y-axis parameters..."
                  searchPlaceholder="Search parameters..."
                  emptyMessage="No parameters found."
                />
              )}

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
            disabled={!isValid || (editMode && chartToEdit ? chartToEdit.selectedDataIds : selectedDataIds).length === 0}
          >
            {editMode ? 'Update Chart' : 'Create Chart'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}