// Animation utilities for charts

export interface AnimationState {
  lastUpdateTime: number
  isUpdating: boolean
}

export function createAnimationState(): AnimationState {
  return {
    lastUpdateTime: 0,
    isUpdating: false
  }
}

export function shouldUpdateAnimation(
  state: AnimationState,
  currentTime: number,
  targetFps: number
): boolean {
  if (state.isUpdating) return false
  const timeSinceLastUpdate = currentTime - state.lastUpdateTime
  const targetFrameTime = 1000 / targetFps
  return timeSinceLastUpdate >= targetFrameTime
}