'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { db } from '@/lib/db';
import { Workspace, Metadata } from '@/lib/db/schema';
import { RefreshCw, Database, Save } from 'lucide-react';
import { ClearStartupMode } from './ClearStartupMode';

export default function DatabaseDebugPanel() {
  const [dbVersion, setDbVersion] = useState<number>(0);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [metadata, setMetadata] = useState<Metadata[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Get database version
      const version = db.verno;
      setDbVersion(version);

      // Get all workspaces
      const allWorkspaces = await db.workspaces.toArray();
      setWorkspaces(allWorkspaces);

      // Get active workspace
      const active = allWorkspaces.find(w => w.isActive);
      setActiveWorkspace(active || null);

      // Get all metadata
      const allMetadata = await db.metadata.toArray();
      setMetadata(allMetadata);

      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error loading database data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveSelectedDataKeys = async (workspaceId: string, dataKeys: string[]) => {
    try {
      await db.workspaces.update(workspaceId, { 
        selectedDataKeys: dataKeys,
        updatedAt: new Date()
      });
      await loadData();
      console.log('Successfully saved selectedDataKeys:', dataKeys);
    } catch (error) {
      console.error('Error saving selectedDataKeys:', error);
    }
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
  };

  return (
    <Card className="w-full max-w-6xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Debug Panel
          </CardTitle>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Last refresh: {lastRefresh.toLocaleTimeString()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Database Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2">Database Info</h3>
              <div className="space-y-1 text-sm">
                <p>Version: <Badge variant="secondary">{dbVersion}</Badge></p>
                <p>Name: <Badge variant="secondary">GraphDataDB</Badge></p>
              </div>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold mb-2">Active Workspace</h3>
              {activeWorkspace ? (
                <div className="space-y-1 text-sm">
                  <p>Name: <Badge variant="default">{activeWorkspace.name}</Badge></p>
                  <p>ID: <Badge variant="secondary">{activeWorkspace.id}</Badge></p>
                  <p>Selected Data Keys: <Badge variant="secondary">{activeWorkspace.selectedDataKeys?.length || 0}</Badge></p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No active workspace</p>
              )}
            </div>
          </div>

          {/* Tabs for different data views */}
          <Tabs defaultValue="workspaces" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="workspaces">Workspaces ({workspaces.length})</TabsTrigger>
              <TabsTrigger value="metadata">Metadata ({metadata.length})</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="workspaces">
              <ScrollArea className="h-[400px] w-full rounded-md border p-4">
                <div className="space-y-4">
                  {workspaces.map((workspace) => (
                    <div key={workspace.id} className="p-4 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold">{workspace.name}</h4>
                        {workspace.isActive && <Badge variant="default">Active</Badge>}
                      </div>
                      <div className="text-sm space-y-1">
                        <p>ID: <code className="bg-muted px-1 rounded">{workspace.id}</code></p>
                        <p>Description: {workspace.description || 'N/A'}</p>
                        <p>Created: {formatDate(workspace.createdAt)}</p>
                        <p>Updated: {formatDate(workspace.updatedAt)}</p>
                        <div>
                          <p className="font-medium mb-1">Selected Data Keys ({workspace.selectedDataKeys?.length || 0}):</p>
                          {workspace.selectedDataKeys && workspace.selectedDataKeys.length > 0 ? (
                            <div className="space-y-1">
                              {workspace.selectedDataKeys.map((key, index) => (
                                <code key={index} className="block bg-muted px-2 py-1 rounded text-xs">
                                  {key}
                                </code>
                              ))}
                            </div>
                          ) : (
                            <p className="text-muted-foreground text-xs">No data keys selected</p>
                          )}
                        </div>
                        <div className="mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              // Example: Save empty array to test
                              handleSaveSelectedDataKeys(workspace.id!, []);
                            }}
                          >
                            <Save className="h-3 w-3 mr-1" />
                            Clear Selected Keys
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {workspaces.length === 0 && (
                    <p className="text-center text-muted-foreground">No workspaces found</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="metadata">
              <ScrollArea className="h-[400px] w-full rounded-md border p-4">
                <div className="space-y-4">
                  {metadata.map((meta) => (
                    <div key={meta.id} className="p-4 border rounded-lg space-y-2">
                      <h4 className="font-semibold">{meta.plant} - {meta.machineNo}</h4>
                      <div className="text-sm space-y-1">
                        <p>ID: <code className="bg-muted px-1 rounded">{meta.id}</code></p>
                        <p>Data Key: <code className="bg-muted px-2 py-1 rounded text-xs break-all">{meta.dataKey}</code></p>
                        <p>Label: {meta.label || 'N/A'}</p>
                        <p>Event: {meta.event || 'N/A'}</p>
                        <p>Data Source: <Badge variant="outline">{meta.dataSource}</Badge></p>
                        <p>Start Time: {formatDate(meta.startTime)}</p>
                        <p>End Time: {formatDate(meta.endTime)}</p>
                        <p>Data Start: {formatDate(meta.dataStartTime)}</p>
                        <p>Data End: {formatDate(meta.dataEndTime)}</p>
                        <p>Imported At: {formatDate(meta.importedAt)}</p>
                      </div>
                    </div>
                  ))}
                  {metadata.length === 0 && (
                    <p className="text-center text-muted-foreground">No metadata found</p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="settings">
              <div className="p-4 space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Startup Mode Settings</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Clear or reset the default startup mode if you're experiencing issues with session persistence.
                  </p>
                  <ClearStartupMode />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Debug Actions */}
          <div className="mt-4 p-4 border rounded-lg bg-muted/50">
            <h3 className="font-semibold mb-2">Debug Actions</h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  console.log('Current Database State:', {
                    version: dbVersion,
                    workspaces,
                    metadata,
                    activeWorkspace
                  });
                }}
              >
                Log Database State to Console
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const tables = ['workspaces', 'metadata', 'parameters', 'timeSeries', 'chartConfigurations'];
                  for (const table of tables) {
                    const count = await db.table(table).count();
                    console.log(`Table ${table}: ${count} records`);
                  }
                }}
              >
                Log Table Counts
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}