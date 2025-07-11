import { Button } from '@/components/ui/button'
import { Database } from 'lucide-react'

interface DataButtonProps {
  onClick: () => void
}

export function DataButton({ onClick }: DataButtonProps) {
  return (
    <Button onClick={onClick} variant="outline">
      <Database className="mr-2 h-4 w-4" />
      Data
    </Button>
  )
}