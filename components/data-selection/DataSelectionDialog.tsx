'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db } from '@/lib/db';
import { Metadata } from '@/lib/db/schema';
import { Search, Calendar, Factory, Cpu } from 'lucide-react';

interface DataSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDataIds: number[];
  onSelectionChange: (ids: number[]) => void;
}

export function DataSelectionDialog({ 
  open, 
  onOpenChange, 
  selectedDataIds, 
  onSelectionChange 
}: DataSelectionDialogProps) {
  const [metadata, setMetadata] = useState<Metadata[]>([]);
  const [filteredMetadata, setFilteredMetadata] = useState<Metadata[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Load metadata from IndexedDB
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        setLoading(true);
        const data = await db.metadata.toArray();
        setMetadata(data);
        setFilteredMetadata(data);
      } catch (error) {
        console.error('Failed to load metadata:', error);
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      loadMetadata();
    }
  }, [open]);

  // Filter metadata based on search term
  useEffect(() => {
    const filtered = metadata.filter(item => {
      const searchLower = searchTerm.toLowerCase();
      return (
        item.plant.toLowerCase().includes(searchLower) ||
        item.machineNo.toLowerCase().includes(searchLower) ||
        (item.label && item.label.toLowerCase().includes(searchLower)) ||
        (item.event && item.event.toLowerCase().includes(searchLower))
      );
    });
    setFilteredMetadata(filtered);
  }, [searchTerm, metadata]);

  const handleSelectionChange = (id: number, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedDataIds, id]);
    } else {
      onSelectionChange(selectedDataIds.filter(dataId => dataId !== id));
    }
  };

  const handleSelectAll = () => {
    const allIds = filteredMetadata.map(item => item.id!).filter(id => id !== undefined);
    onSelectionChange(allIds);
  };

  const handleDeselectAll = () => {
    onSelectionChange([]);
  };

  const formatDate = (date?: Date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('ja-JP');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Data Selection</DialogTitle>
          <DialogDescription>
            Select the data sources you want to use for creating charts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search by plant, machine, label, or event..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Selection controls */}
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">
              {selectedDataIds.length} of {filteredMetadata.length} selected
            </span>
            <div className="space-x-2">
              <Button 
                onClick={handleSelectAll} 
                variant="outline" 
                size="sm"
                disabled={loading}
              >
                Select All
              </Button>
              <Button 
                onClick={handleDeselectAll} 
                variant="outline" 
                size="sm"
                disabled={loading || selectedDataIds.length === 0}
              >
                Deselect All
              </Button>
            </div>
          </div>

          {/* Data list */}
          <ScrollArea className="h-[400px] border rounded-md p-4">
            {loading ? (
              <div className="text-center py-8 text-gray-500">
                Loading data sources...
              </div>
            ) : filteredMetadata.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No data sources found
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMetadata.map((item) => (
                  <div 
                    key={item.id} 
                    className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-gray-50"
                  >
                    <Checkbox
                      id={`data-${item.id}`}
                      checked={selectedDataIds.includes(item.id!)}
                      onCheckedChange={(checked) => 
                        handleSelectionChange(item.id!, checked as boolean)
                      }
                      className="mt-1"
                    />
                    <div className="flex-1 space-y-1">
                      <Label 
                        htmlFor={`data-${item.id}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Factory className="h-3 w-3" />
                          {item.plant}
                          <Cpu className="h-3 w-3" />
                          {item.machineNo}
                        </div>
                      </Label>
                      
                      {item.label && (
                        <p className="text-xs text-gray-600">Label: {item.label}</p>
                      )}
                      
                      {item.event && (
                        <p className="text-xs text-gray-600">Event: {item.event}</p>
                      )}
                      
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {formatDate(item.startTime)} ~ {formatDate(item.endTime)}
                        </span>
                      </div>
                      
                      <p className="text-xs text-gray-500">
                        Source: {item.dataSource} | Imported: {formatDate(item.importedAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button 
            onClick={() => onOpenChange(false)} 
            variant="outline"
          >
            Cancel
          </Button>
          <Button 
            onClick={() => onOpenChange(false)}
            disabled={selectedDataIds.length === 0}
          >
            Confirm Selection ({selectedDataIds.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}