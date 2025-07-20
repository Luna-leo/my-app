import React from 'react'
import { DataManagementDialog } from '@/components/data-management/DataManagementDialog'
import { CreateChartDialog, ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { WelcomeDialog } from '@/components/startup/WelcomeDialog'
import { SaveSessionDialog } from '@/components/workspace/SaveSessionDialog'
import { WorkspaceListDialog } from '@/components/workspace/WorkspaceListDialog'
import { ExportWorkspaceDialog } from '@/components/workspace/ExportWorkspaceDialog'
import DatabaseDebugPanel from '@/components/debug/DatabaseDebugPanel'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface DialogsContainerProps {
  // Data Management Dialog
  dataManagementOpen: boolean
  setDataManagementOpen: (open: boolean) => void
  selectedDataIds: number[]
  onSelectionChange: (newIds: number[]) => void
  onImportComplete: () => void
  
  // Create Chart Dialog
  createChartOpen: boolean
  setCreateChartOpen: (open: boolean) => void
  onCreateChart: (config: ChartConfiguration) => void
  
  // Edit Chart Dialog
  editDialogOpen: boolean
  setEditDialogOpen: (open: boolean) => void
  editingChart: (ChartConfiguration & { id: string }) | null
  setEditingChart: (chart: (ChartConfiguration & { id: string }) | null) => void
  onUpdateChart: (updatedChart: ChartConfiguration & { id: string }) => void
  
  // Welcome Dialog
  showWelcomeDialog: boolean
  onWelcomeSelectWorkspace: (workspaceId: string) => void
  onWelcomeCreateNew: () => void
  
  // Save Session Dialog
  showSaveSessionDialog: boolean
  setShowSaveSessionDialog: (open: boolean) => void
  onSaveSession: (name: string, description: string, saveAsNew: boolean) => void
  currentWorkspace: { name?: string; description?: string } | null
  hasData: boolean
  hasCharts: boolean
  
  // Workspace List Dialog
  showWorkspaceListDialog: boolean
  setShowWorkspaceListDialog: (open: boolean) => void
  onSelectWorkspace: (workspaceId: string) => void
  currentWorkspaceId: string
  
  // Export Dialog
  showExportDialog: boolean
  setShowExportDialog: (open: boolean) => void
  onExport: (filename: string) => void
  workspaceName: string
  
  // Delete Confirmation Dialog
  deleteConfirmation: { open: boolean; chartId: string | null }
  setDeleteConfirmation: (value: { open: boolean; chartId: string | null }) => void
  onConfirmDelete: () => void
  
  // Debug Panel
  showDebugPanel: boolean
  setShowDebugPanel: (open: boolean) => void
}

export function DialogsContainer({
  dataManagementOpen,
  setDataManagementOpen,
  selectedDataIds,
  onSelectionChange,
  onImportComplete,
  createChartOpen,
  setCreateChartOpen,
  onCreateChart,
  editDialogOpen,
  setEditDialogOpen,
  editingChart,
  setEditingChart,
  onUpdateChart,
  showWelcomeDialog,
  onWelcomeSelectWorkspace,
  onWelcomeCreateNew,
  showSaveSessionDialog,
  setShowSaveSessionDialog,
  onSaveSession,
  currentWorkspace,
  hasData,
  hasCharts,
  showWorkspaceListDialog,
  setShowWorkspaceListDialog,
  onSelectWorkspace,
  currentWorkspaceId,
  showExportDialog,
  setShowExportDialog,
  onExport,
  workspaceName,
  deleteConfirmation,
  setDeleteConfirmation,
  onConfirmDelete,
  showDebugPanel,
  setShowDebugPanel,
}: DialogsContainerProps) {
  return (
    <>
      <WelcomeDialog
        open={showWelcomeDialog}
        onSelectWorkspace={onWelcomeSelectWorkspace}
        onCreateNew={onWelcomeCreateNew}
      />
      
      <SaveSessionDialog
        open={showSaveSessionDialog}
        onClose={() => setShowSaveSessionDialog(false)}
        onSave={onSaveSession}
        currentName={currentWorkspace?.name}
        currentDescription={currentWorkspace?.description}
        hasData={hasData}
        hasCharts={hasCharts}
      />
      
      <WorkspaceListDialog
        open={showWorkspaceListDialog}
        onClose={() => setShowWorkspaceListDialog(false)}
        onSelectWorkspace={onSelectWorkspace}
        currentWorkspaceId={currentWorkspaceId}
      />
      
      <ExportWorkspaceDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        onExport={onExport}
        workspaceName={workspaceName || 'workspace'}
      />
      
      <DataManagementDialog
        open={dataManagementOpen}
        onOpenChange={setDataManagementOpen}
        selectedDataIds={selectedDataIds}
        onSelectionChange={onSelectionChange}
        onImportComplete={onImportComplete}
      />
      
      <CreateChartDialog
        open={createChartOpen}
        onOpenChange={setCreateChartOpen}
        selectedDataIds={selectedDataIds}
        onCreateChart={onCreateChart}
      />
      
      <CreateChartDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        selectedDataIds={selectedDataIds}
        onCreateChart={() => {}}
        editMode={true}
        chartToEdit={editingChart || undefined}
        onUpdateChart={onUpdateChart}
      />
      
      <AlertDialog 
        open={deleteConfirmation.open} 
        onOpenChange={(open) => setDeleteConfirmation({ open, chartId: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the chart.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Debug Panel - Only visible when enabled */}
      {showDebugPanel && (
        <div className="fixed bottom-4 right-4 max-w-2xl max-h-[80vh] overflow-auto z-50 bg-background border rounded-lg shadow-lg">
          <div className="p-2 border-b flex justify-between items-center">
            <span className="text-sm font-semibold">Database Debug Panel</span>
            <button
              onClick={() => setShowDebugPanel(false)}
              className="text-sm px-2 py-1 hover:bg-gray-100 rounded"
            >
              Close
            </button>
          </div>
          <DatabaseDebugPanel />
        </div>
      )}
      
      {/* Debug Toggle Button */}
      <button
        onClick={() => setShowDebugPanel(!showDebugPanel)}
        className="fixed bottom-4 left-4 px-3 py-2 bg-gray-800 text-white text-xs rounded-md hover:bg-gray-700 z-50"
      >
        {showDebugPanel ? 'Hide' : 'Show'} Debug
      </button>
    </>
  )
}