/** Renderer strings of software WebGL implementations (no GPU, or a blocklisted one). */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|microsoft basic render driver|software/i;

export function isSoftwareRenderer(renderer: string): boolean {
  return SOFTWARE.test(renderer);
}

/**
 * The renderer name of this browser's WebGL, or undefined when there is none. One throwaway probe at
 * startup: it runs before the scene creates its own context, and the context is released right away
 * so it does not count against the browser's limit of live WebGL contexts.
 */
export function webglRenderer(): string | undefined {
  try {
    if (typeof document === 'undefined') return undefined;
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return undefined;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const name = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return typeof name === 'string' ? name : undefined;
  } catch {
    return undefined;
  }
}
