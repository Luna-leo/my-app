/**
 * チャートの座標変換ユーティリティ
 * マウス座標、WebGL座標、データ値間の相互変換を提供
 */

export interface ViewportBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface CanvasDimensions {
  width: number;
  height: number;
}

export interface Point2D {
  x: number;
  y: number;
}

/**
 * マウス座標（ピクセル）からWebGL正規化座標（-1から1）に変換
 */
export function mouseToWebGL(
  mouseX: number,
  mouseY: number,
  canvas: CanvasDimensions
): Point2D {
  const normalizedX = (mouseX / canvas.width) * 2 - 1;
  const normalizedY = -((mouseY / canvas.height) * 2 - 1); // Y軸は反転
  return { x: normalizedX, y: normalizedY };
}

/**
 * WebGL正規化座標からマウス座標（ピクセル）に変換
 */
export function webGLToMouse(
  webglX: number,
  webglY: number,
  canvas: CanvasDimensions
): Point2D {
  const mouseX = ((webglX + 1) / 2) * canvas.width;
  const mouseY = ((-webglY + 1) / 2) * canvas.height;
  return { x: mouseX, y: mouseY };
}

/**
 * WebGL正規化座標からデータ値に変換
 */
export function webGLToData(
  webglX: number,
  webglY: number,
  viewport: ViewportBounds
): Point2D {
  const dataX = ((webglX + 1) / 2) * (viewport.xMax - viewport.xMin) + viewport.xMin;
  const dataY = ((webglY + 1) / 2) * (viewport.yMax - viewport.yMin) + viewport.yMin;
  return { x: dataX, y: dataY };
}

/**
 * データ値からWebGL正規化座標に変換
 */
export function dataToWebGL(
  dataX: number,
  dataY: number,
  viewport: ViewportBounds
): Point2D {
  const webglX = ((dataX - viewport.xMin) / (viewport.xMax - viewport.xMin)) * 2 - 1;
  const webglY = ((dataY - viewport.yMin) / (viewport.yMax - viewport.yMin)) * 2 - 1;
  return { x: webglX, y: webglY };
}

/**
 * マウス座標から直接データ値に変換
 */
export function mouseToData(
  mouseX: number,
  mouseY: number,
  canvas: CanvasDimensions,
  viewport: ViewportBounds
): Point2D {
  const webgl = mouseToWebGL(mouseX, mouseY, canvas);
  return webGLToData(webgl.x, webgl.y, viewport);
}

/**
 * データ値から直接マウス座標に変換
 */
export function dataToMouse(
  dataX: number,
  dataY: number,
  canvas: CanvasDimensions,
  viewport: ViewportBounds
): Point2D {
  const webgl = dataToWebGL(dataX, dataY, viewport);
  return webGLToMouse(webgl.x, webgl.y, canvas);
}

/**
 * ズーム変換の計算
 * @param currentViewport 現在のビューポート
 * @param zoomFactor ズーム倍率（1より大きいとズームイン、小さいとズームアウト）
 * @param centerPoint ズームの中心点（データ座標）
 */
export function calculateZoomedViewport(
  currentViewport: ViewportBounds,
  zoomFactor: number,
  centerPoint: Point2D
): ViewportBounds {
  const currentWidth = currentViewport.xMax - currentViewport.xMin;
  const currentHeight = currentViewport.yMax - currentViewport.yMin;
  
  const newWidth = currentWidth / zoomFactor;
  const newHeight = currentHeight / zoomFactor;
  
  // 中心点からの相対位置を維持
  const relativeX = (centerPoint.x - currentViewport.xMin) / currentWidth;
  const relativeY = (centerPoint.y - currentViewport.yMin) / currentHeight;
  
  return {
    xMin: centerPoint.x - newWidth * relativeX,
    xMax: centerPoint.x + newWidth * (1 - relativeX),
    yMin: centerPoint.y - newHeight * relativeY,
    yMax: centerPoint.y + newHeight * (1 - relativeY)
  };
}

/**
 * パン（移動）変換の計算
 * @param currentViewport 現在のビューポート
 * @param deltaX X軸方向の移動量（データ座標）
 * @param deltaY Y軸方向の移動量（データ座標）
 */
export function calculatePannedViewport(
  currentViewport: ViewportBounds,
  deltaX: number,
  deltaY: number
): ViewportBounds {
  return {
    xMin: currentViewport.xMin - deltaX,
    xMax: currentViewport.xMax - deltaX,
    yMin: currentViewport.yMin - deltaY,
    yMax: currentViewport.yMax - deltaY
  };
}

/**
 * ビューポートの境界制限を適用
 * @param viewport 調整前のビューポート
 * @param bounds データの全体範囲
 * @param minZoom 最小ズームレベル（全体表示に対する比率）
 * @param maxZoom 最大ズームレベル（全体表示に対する比率）
 */
export function constrainViewport(
  viewport: ViewportBounds,
  bounds: ViewportBounds,
  minZoom: number = 0.1,
  maxZoom: number = 100
): ViewportBounds {
  const fullWidth = bounds.xMax - bounds.xMin;
  const fullHeight = bounds.yMax - bounds.yMin;
  const viewWidth = viewport.xMax - viewport.xMin;
  const viewHeight = viewport.yMax - viewport.yMin;
  
  // ズーム制限の適用
  const maxWidth = fullWidth / minZoom;
  const minWidth = fullWidth / maxZoom;
  const maxHeight = fullHeight / minZoom;
  const minHeight = fullHeight / maxZoom;
  
  let constrainedWidth = Math.max(minWidth, Math.min(maxWidth, viewWidth));
  let constrainedHeight = Math.max(minHeight, Math.min(maxHeight, viewHeight));
  
  // アスペクト比を維持
  const aspectRatio = viewWidth / viewHeight;
  if (constrainedWidth / constrainedHeight > aspectRatio) {
    constrainedHeight = constrainedWidth / aspectRatio;
  } else {
    constrainedWidth = constrainedHeight * aspectRatio;
  }
  
  // 中心点を計算
  const centerX = (viewport.xMin + viewport.xMax) / 2;
  const centerY = (viewport.yMin + viewport.yMax) / 2;
  
  // 新しいビューポートを計算
  let newViewport: ViewportBounds = {
    xMin: centerX - constrainedWidth / 2,
    xMax: centerX + constrainedWidth / 2,
    yMin: centerY - constrainedHeight / 2,
    yMax: centerY + constrainedHeight / 2
  };
  
  // パン制限の適用（データ範囲外に出ないように）
  if (newViewport.xMin < bounds.xMin) {
    const shift = bounds.xMin - newViewport.xMin;
    newViewport.xMin += shift;
    newViewport.xMax += shift;
  }
  if (newViewport.xMax > bounds.xMax) {
    const shift = bounds.xMax - newViewport.xMax;
    newViewport.xMin += shift;
    newViewport.xMax += shift;
  }
  if (newViewport.yMin < bounds.yMin) {
    const shift = bounds.yMin - newViewport.yMin;
    newViewport.yMin += shift;
    newViewport.yMax += shift;
  }
  if (newViewport.yMax > bounds.yMax) {
    const shift = bounds.yMax - newViewport.yMax;
    newViewport.yMin += shift;
    newViewport.yMax += shift;
  }
  
  return newViewport;
}

/**
 * 最も近いデータポイントを検索
 * @param mousePoint マウス位置（データ座標）
 * @param dataPoints データポイントの配列
 * @param threshold 検出閾値（データ座標での距離）
 */
export function findNearestDataPoint(
  mousePoint: Point2D,
  dataPoints: Point2D[],
  threshold?: number
): { point: Point2D; index: number; distance: number } | null {
  if (dataPoints.length === 0) return null;
  
  let nearestPoint = dataPoints[0];
  let nearestIndex = 0;
  let minDistance = Number.MAX_VALUE;
  
  for (let i = 0; i < dataPoints.length; i++) {
    const point = dataPoints[i];
    const distance = Math.sqrt(
      Math.pow(point.x - mousePoint.x, 2) + 
      Math.pow(point.y - mousePoint.y, 2)
    );
    
    if (distance < minDistance) {
      minDistance = distance;
      nearestPoint = point;
      nearestIndex = i;
    }
  }
  
  if (threshold !== undefined && minDistance > threshold) {
    return null;
  }
  
  return {
    point: nearestPoint,
    index: nearestIndex,
    distance: minDistance
  };
}