'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DataSource } from '@/lib/db/schema';

export interface MetadataFormData {
  plant: string;
  machineNo: string;
  label?: string;
  event?: string;
  startTime?: string;
  endTime?: string;
  dataSource: DataSource['type'];
}

interface MetadataFormProps {
  value: MetadataFormData;
  onChange: (data: MetadataFormData) => void;
  errors?: Partial<Record<keyof MetadataFormData, string>>;
}

export function MetadataForm({ value, onChange, errors }: MetadataFormProps) {
  const handleChange = (field: keyof MetadataFormData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    onChange({
      ...value,
      [field]: e.target.value
    });
  };

  const handleDataSourceChange = (dataSource: DataSource['type']) => {
    onChange({
      ...value,
      dataSource
    });
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="startTime">Start Time (Optional)</Label>
          <Input
            id="startTime"
            type="datetime-local"
            value={value.startTime || ''}
            onChange={handleChange('startTime')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="endTime">End Time (Optional)</Label>
          <Input
            id="endTime"
            type="datetime-local"
            value={value.endTime || ''}
            onChange={handleChange('endTime')}
          />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        * Required fields
      </p>
    </div>
  );
}