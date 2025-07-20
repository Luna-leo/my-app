import { useState } from 'react'

export function useDialogManagement() {
  const [dataManagementOpen, setDataManagementOpen] = useState(false)
  const [createChartOpen, setCreateChartOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false)
  const [showSaveSessionDialog, setShowSaveSessionDialog] = useState(false)
  const [showWorkspaceListDialog, setShowWorkspaceListDialog] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  
  return {
    dataManagementOpen,
    setDataManagementOpen,
    createChartOpen,
    setCreateChartOpen,
    editDialogOpen,
    setEditDialogOpen,
    showWelcomeDialog,
    setShowWelcomeDialog,
    showSaveSessionDialog,
    setShowSaveSessionDialog,
    showWorkspaceListDialog,
    setShowWorkspaceListDialog,
    showExportDialog,
    setShowExportDialog,
    showDebugPanel,
    setShowDebugPanel,
  }
}