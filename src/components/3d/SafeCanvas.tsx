import React from 'react';
import { Canvas } from '@react-three/fiber';

type CanvasProps = React.ComponentProps<typeof Canvas>;

let webglSupport: boolean | null = null;

/** True if the browser can create a WebGL context (false when hardware acceleration is off or the GPU is blocklisted). */
export function isWebGLAvailable(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    webglSupport = !!gl;
    (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

class CanvasErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.warn('[SafeCanvas] 3D view disabled:', error.message);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Drop-in replacement for <Canvas> that renders `fallback` instead of crashing the app when WebGL is unavailable. */
export const SafeCanvas: React.FC<CanvasProps & { fallback?: React.ReactNode }> = ({ fallback = null, ...props }) => {
  if (!isWebGLAvailable()) return <>{fallback}</>;
  return (
    <CanvasErrorBoundary fallback={fallback}>
      <Canvas {...props} />
    </CanvasErrorBoundary>
  );
};
