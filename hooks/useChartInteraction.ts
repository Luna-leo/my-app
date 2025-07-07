import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ViewportBounds,
  CanvasDimensions,
  ChartMargins,
  Point2D,
  mouseToData,
  mouseToPlotAreaData,
  mouseToPlotData,
  calculateZoomedViewport,
  calculatePannedViewport,
  constrainViewport,
  findNearestDataPoint
} from '@/utils/chartCoordinateUtils';
import { calculatePlotArea } from '@/utils/plotAreaUtils';

export interface ChartInteractionOptions {
  enableZoom?: boolean;
  enablePan?: boolean;
  enableTooltip?: boolean;
  enableCrosshair?: boolean;
  minZoom?: number;
  maxZoom?: number;
  zoomSensitivity?: number;
  dataBounds?: ViewportBounds;
}

export interface ChartInteractionState {
  viewport: ViewportBounds;
  isPanning: boolean;
  mousePosition: Point2D | null;
  hoveredDataPoint: { point: Point2D; index: number; seriesIndex?: number } | null;
  crosshairPosition: Point2D | null;
}

export interface ChartInteractionHandlers {
  onWheel: (event: WheelEvent) => void;
  onMouseDown: (event: MouseEvent) => void;
  onMouseMove: (event: MouseEvent) => void;
  onMouseUp: (event: MouseEvent) => void;
  onMouseLeave: (event: MouseEvent) => void;
  resetViewport: () => void;
  setViewport: (viewport: ViewportBounds) => void;
}

export function useChartInteraction(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  initialViewport: ViewportBounds,
  margins: ChartMargins,
  dataPoints?: { series: Point2D[]; name?: string }[],
  options: ChartInteractionOptions = {}
): [ChartInteractionState, ChartInteractionHandlers] {
  const {
    enableZoom = true,
    enablePan = true,
    enableTooltip = true,
    enableCrosshair = true,
    minZoom = 1,
    maxZoom = 100,
    zoomSensitivity = 0.002,
    dataBounds
  } = options;

  const [viewport, setViewport] = useState<ViewportBounds>(initialViewport);
  const [isPanning, setIsPanning] = useState(false);
  const [mousePosition, setMousePosition] = useState<Point2D | null>(null);
  const [hoveredDataPoint, setHoveredDataPoint] = useState<{
    point: Point2D;
    index: number;
    seriesIndex?: number;
  } | null>(null);
  const [crosshairPosition, setCrosshairPosition] = useState<Point2D | null>(null);

  const panStartRef = useRef<Point2D | null>(null);
  const viewportStartRef = useRef<ViewportBounds | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // キャンバスの寸法を取得
  const getCanvasDimensions = useCallback((): CanvasDimensions | null => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height
    };
  }, [canvasRef]);

  // ビューポートの制約を適用
  const applyViewportConstraints = useCallback(
    (newViewport: ViewportBounds): ViewportBounds => {
      const bounds = dataBounds || initialViewport;
      return constrainViewport(newViewport, bounds, minZoom, maxZoom);
    },
    [dataBounds, initialViewport, minZoom, maxZoom]
  );

  // ホイールイベントハンドラー（ズーム）
  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (!enableZoom || !canvasRef.current) return;
      event.preventDefault();

      const canvas = getCanvasDimensions();
      if (!canvas) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      
      // Calculate plot area
      const plotArea = calculatePlotArea(canvas.width, canvas.height);

      const zoomCenter = mouseToPlotData(mouseX, mouseY, plotArea, viewport);
      if (!zoomCenter) return; // Mouse is outside plot area
      const zoomFactor = 1 - event.deltaY * zoomSensitivity;
      
      console.log('Zoom calculation:', { 
        mouseX, mouseY, 
        zoomCenter, 
        zoomFactor, 
        currentViewport: viewport 
      });
      
      const newViewport = calculateZoomedViewport(viewport, zoomFactor, zoomCenter);
      const constrainedViewport = applyViewportConstraints(newViewport);
      
      console.log('New viewport after zoom:', constrainedViewport);
      
      setViewport(constrainedViewport);
    },
    [enableZoom, canvasRef, getCanvasDimensions, viewport, zoomSensitivity, applyViewportConstraints]
  );

  // マウスダウンイベントハンドラー（パン開始）
  const handleMouseDown = useCallback(
    (event: MouseEvent) => {
      if (!enablePan || !canvasRef.current) return;
      
      const rect = canvasRef.current.getBoundingClientRect();
      panStartRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      viewportStartRef.current = { ...viewport };
      setIsPanning(true);
      
      // カーソルスタイルを変更
      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'grabbing';
      }
    },
    [enablePan, canvasRef, viewport]
  );

  // マウス移動イベントハンドラー
  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!canvasRef.current) return;

      const canvas = getCanvasDimensions();
      if (!canvas) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const currentMousePos = { x: mouseX, y: mouseY };

      // マウス位置を更新
      setMousePosition(currentMousePos);
      
      // Calculate plot area
      const plotArea = calculatePlotArea(canvas.width, canvas.height);

      // データ座標でのマウス位置（プロットエリア内のみ）
      const dataPos = mouseToPlotData(mouseX, mouseY, plotArea, viewport);
      
      // マウスがプロットエリア外の場合
      if (!dataPos) {
        setCrosshairPosition(null);
        setHoveredDataPoint(null);
        return;
      }

      // クロスヘアの更新
      if (enableCrosshair) {
        setCrosshairPosition(dataPos);
      }

      // ツールチップのための最近傍点検索
      if (enableTooltip && dataPoints && dataPoints.length > 0) {
        let nearestPoint = null;
        let minDistance = Number.MAX_VALUE;
        let foundSeriesIndex = -1;

        dataPoints.forEach((series, seriesIndex) => {
          if (series.series.length > 0) {
            // dataPosは既にビューポート座標なので、データポイントは正規化座標のまま比較
            const result = findNearestDataPoint(dataPos, series.series);
            if (result && result.distance < minDistance) {
              minDistance = result.distance;
              nearestPoint = {
                point: series.series[result.index], // 元の正規化座標を保持
                index: result.index,
                seriesIndex
              };
              foundSeriesIndex = seriesIndex;
            }
          }
        });

        // データ座標での閾値を設定（ビューポートサイズに基づく）
        // ズーム時は閾値を調整（全体の範囲に対する比率で計算）
        const fullRange = 2; // 正規化座標の全範囲（-1〜1）
        const viewportRatio = Math.max(
          (viewport.xMax - viewport.xMin) / fullRange,
          (viewport.yMax - viewport.yMin) / fullRange
        );
        const threshold = 0.02 * viewportRatio; // ズームレベルに応じた閾値

        if (nearestPoint && minDistance < threshold) {
          setHoveredDataPoint(nearestPoint);
        } else {
          setHoveredDataPoint(null);
        }
      }

      // パン処理
      if (isPanning && enablePan && panStartRef.current && viewportStartRef.current) {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        animationFrameRef.current = requestAnimationFrame(() => {
          // 再度チェックして、参照が有効であることを確認
          if (!panStartRef.current || !viewportStartRef.current) return;
          
          const deltaX = mouseX - panStartRef.current.x;
          const deltaY = mouseY - panStartRef.current.y;

          // Calculate plot area
          const plotArea = calculatePlotArea(canvas.width, canvas.height);
          
          // ピクセル差分をデータ座標差分に変換（プロットエリアのサイズを使用）
          const xScale = (viewportStartRef.current.xMax - viewportStartRef.current.xMin) / plotArea.plotWidth;
          const yScale = (viewportStartRef.current.yMax - viewportStartRef.current.yMin) / plotArea.plotHeight;

          const dataDeltaX = deltaX * xScale;
          const dataDeltaY = -deltaY * yScale; // Y軸は反転

          const newViewport = calculatePannedViewport(
            viewportStartRef.current,
            dataDeltaX,
            dataDeltaY
          );
          const constrainedViewport = applyViewportConstraints(newViewport);
          
          setViewport(constrainedViewport);
        });
      }
    },
    [
      canvasRef,
      getCanvasDimensions,
      viewport,
      isPanning,
      enablePan,
      enableTooltip,
      enableCrosshair,
      dataPoints,
      applyViewportConstraints
    ]
  );

  // マウスアップイベントハンドラー（パン終了）
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
    viewportStartRef.current = null;
    
    // カーソルスタイルを元に戻す
    if (canvasRef.current && enablePan) {
      canvasRef.current.style.cursor = 'grab';
    }
  }, [canvasRef, enablePan]);

  // マウスリーブイベントハンドラー
  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
    setMousePosition(null);
    setHoveredDataPoint(null);
    setCrosshairPosition(null);
    panStartRef.current = null;
    viewportStartRef.current = null;
    
    // カーソルスタイルを元に戻す
    if (canvasRef.current) {
      canvasRef.current.style.cursor = 'default';
    }
  }, [canvasRef]);

  // ビューポートのリセット
  const resetViewport = useCallback(() => {
    setViewport(initialViewport);
  }, [initialViewport]);

  // カーソルスタイルの初期設定
  useEffect(() => {
    if (canvasRef.current && enablePan) {
      canvasRef.current.style.cursor = 'grab';
    }
    
    return () => {
      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'default';
      }
    };
  }, [canvasRef, enablePan]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const state: ChartInteractionState = {
    viewport,
    isPanning,
    mousePosition,
    hoveredDataPoint,
    crosshairPosition
  };

  const handlers: ChartInteractionHandlers = {
    onWheel: handleWheel,
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
    onMouseLeave: handleMouseLeave,
    resetViewport,
    setViewport
  };

  return [state, handlers];
}