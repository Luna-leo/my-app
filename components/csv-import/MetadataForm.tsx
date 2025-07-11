'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { DataSource } from '@/lib/db/schema';
import { Loader2 } from 'lucide-react';

export interface MetadataFormData {
  plant: string;
  machineNo: string;
  label?: string;
  event?: string;
  startTime?: string;
  endTime?: string;
  dataStartTime?: string;
  dataEndTime?: string;
  dataSource: DataSource['type'];
}

interface MetadataFormProps {
  value: MetadataFormData;
  onChange: (data: MetadataFormData) => void;
  errors?: Partial<Record<keyof MetadataFormData, string>>;
  onDetectDataRange?: () => void;
  detectingRange?: boolean;
}

export function MetadataForm({ value, onChange, errors, onDetectDataRange, detectingRange }: MetadataFormProps) {
  console.log('MetadataForm props:', { 
    hasOnDetectDataRange: !!onDetectDataRange, 
    detectingRange,
    onDetectDataRangeType: typeof onDetectDataRange 
  });
  const handleChange = (field: keyof MetadataFormData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    onChange({
      ...value,
      [field]: e.target.value
    });
  };

  const handleDataSourceChange = (dataSource: DataSource['type']) => {
    console.log('handleDataSourceChange called with:', dataSource);
    onChange({
      ...value,
      dataSource
    });
    // Trigger data range detection after data source change
    if (onDetectDataRange) {
      console.log('Triggering detectDataRange after data source change');
      setTimeout(onDetectDataRange, 100);
    } else {
      console.log('onDetectDataRange is not provided');
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Data Source *</Label>
        <RadioGroup
          value={value.dataSource}
          onValueChange={handleDataSourceChange}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="CASS" id="cass" />
            <Label htmlFor="cass" className="font-normal">
              CASS (Shift-JIS encoding)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="Chinami" id="chinami" />
            <Label htmlFor="chinami" className="font-normal">
              Chinami (UTF-8 encoding)
            </Label>
          </div>
        </RadioGroup>
        {errors?.dataSource && (
          <p className="text-sm text-destructive">{errors.dataSource}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h3 className="text-sm font-medium">データインポート期間（オプション）</h3>
            <p className="text-xs text-muted-foreground">
              IndexedDBに登録するデータの期間を指定します。未指定の場合、CSVファイル内の全データがインポートされます。
            </p>
          </div>
          {onDetectDataRange && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDetectDataRange}
              disabled={detectingRange}
              className="text-xs"
            >
              {detectingRange ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  検出中
                </>
              ) : (
                '自動検出'
              )}
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="dataStartTime">データ開始時刻</Label>
            <Input
              id="dataStartTime"
              type="datetime-local"
              step="1"
              value={value.dataStartTime || ''}
              onChange={handleChange('dataStartTime')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dataEndTime">データ終了時刻</Label>
            <Input
              id="dataEndTime"
              type="datetime-local"
              step="1"
              value={value.dataEndTime || ''}
              onChange={handleChange('dataEndTime')}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="plant">Plant *</Label>
          <Input
            id="plant"
            value={value.plant}
            onChange={handleChange('plant')}
            placeholder="Enter plant name"
            className={errors?.plant ? "border-destructive" : ""}
          />
          {errors?.plant && (
            <p className="text-sm text-destructive">{errors.plant}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="machineNo">Machine No *</Label>
          <Input
            id="machineNo"
            value={value.machineNo}
            onChange={handleChange('machineNo')}
            placeholder="Enter machine number"
            className={errors?.machineNo ? "border-destructive" : ""}
          />
          {errors?.machineNo && (
            <p className="text-sm text-destructive">{errors.machineNo}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="label">Label (Optional)</Label>
        <Input
          id="label"
          value={value.label || ''}
          onChange={handleChange('label')}
          placeholder="Enter label"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="event">Event (Optional)</Label>
        <Input
          id="event"
          value={value.event || ''}
          onChange={handleChange('event')}
          placeholder="Enter event description"
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">イベント期間（オプション）</h3>
        <p className="text-xs text-muted-foreground">
          実際のイベントが発生した期間（メタ情報として保存されます）
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="startTime">開始時刻</Label>
            <Input
              id="startTime"
              type="datetime-local"
              step="1"
              value={value.startTime || ''}
              onChange={handleChange('startTime')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endTime">終了時刻</Label>
            <Input
              id="endTime"
              type="datetime-local"
              step="1"
              value={value.endTime || ''}
              onChange={handleChange('endTime')}
            />
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        * Required fields
      </p>
    </div>
  );
}