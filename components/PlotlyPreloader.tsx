'use client';

import { useEffect } from 'react';
import { plotlyPreloadService } from '@/lib/services/plotlyPreloadService';

export function PlotlyPreloader({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Preload Plotly module when the app starts
    plotlyPreloadService.preload().catch(error => {
      console.error('Failed to preload Plotly:', error);
    });
  }, []);

  return <>{children}</>;
}