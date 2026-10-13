/**
 * One browser launcher for the CLI's 3D figures. Headless Chromium draws WebGL in software (SwiftShader) unless it
 * is told to use the GPU, and the GPU flags can leave no WebGL at all on a server with no GPU. So auto mode asks
 * the browser which renderer it got and falls back to software when that renderer is software or missing.
 */

/** The flags that let headless Chromium use a GPU through ANGLE's OpenGL backend. */
export const GPU_ARGS = ['--enable-gpu', '--use-angle=gl', '--ignore-gpu-blocklist'];
/** The software WebGL flags: they work on a server with no GPU. */
export const SOFTWARE_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

/** How long the renderer probe may take before auto mode treats the renderer as software. */
export const PROBE_TIMEOUT_MS = 10_000;

export type GlMode = 'auto' | 'gpu' | 'software';

/** The slice of Playwright's Browser and Page this module uses; the real objects satisfy it. */
export interface PageLike {
  evaluate(expression: string): Promise<unknown>;
  close(): Promise<void>;
}
export interface BrowserLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}
export interface LaunchOptions { args?: string[]; channel?: string }
/** The launch function; generic so callers get back their own browser type (Playwright's, with page methods). */
export type LaunchFn<B extends BrowserLike = BrowserLike> = (options: LaunchOptions) => Promise<B>;

/**
 * Reads the renderer string with the debug extension. Without a WebGL2 context the answer is null; without the
 * extension the renderer is unknown, so null too: the caller treats null as software, the safe choice.
 */
const RENDERER_PROBE = `(() => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) return null;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  if (!ext) return null;
  return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
})()`;

/** True for a renderer that is software or unknown: null or empty, SwiftShader, or llvmpipe (any case). */
export function isSoftwareRenderer(renderer: string | null): boolean {
  if (!renderer) return true;
  return /swiftshader|llvmpipe/i.test(renderer);
}

/** FLOW_TOWER_GL forces a mode; anything else (unset, empty, a typo) leaves the choice to the probe. */
export function glMode(value: string | undefined): GlMode {
  if (value === 'gpu' || value === 'software') return value;
  return 'auto';
}

/** The bundled Chromium first, then the installed Chrome, as the other CLI launchers do. Null when neither starts. */
async function tryLaunch<B extends BrowserLike>(launch: LaunchFn<B>, args?: string[]): Promise<B | null> {
  const base: LaunchOptions = args ? { args } : {};
  try {
    return await launch(base);
  } catch {
    try {
      return await launch({ ...base, channel: 'chrome' });
    } catch {
      return null;
    }
  }
}

/** Asks a fresh blank page for its WebGL renderer, then closes the page. */
async function probeRenderer(browser: BrowserLike): Promise<string | null> {
  const page = await browser.newPage();
  try {
    const renderer = await page.evaluate(RENDERER_PROBE);
    return typeof renderer === 'string' ? renderer : null;
  } finally {
    await page.close();
  }
}

/**
 * The probe, raced against a timer. A wedged GPU page would otherwise hang the CLI forever. A timeout gives null,
 * which the caller treats as software. The timer is cleared on every path so it never keeps the process alive.
 */
async function probeWithTimeout(browser: BrowserLike, timeoutMs: number): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    return await Promise.race([probeRenderer(browser), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A browser for rendering. Without `webgl` no GPU flags are needed. With it, `software` and `gpu` force a mode,
 * and `auto` keeps the GPU browser only when its renderer is real hardware. Returns null when no browser starts.
 */
export async function launchBrowser<B extends BrowserLike>({ webgl, launch, mode = 'auto', log, probeTimeoutMs = PROBE_TIMEOUT_MS }: {
  webgl: boolean;
  launch: LaunchFn<B>;
  mode?: GlMode;
  log: (line: string) => void;
  probeTimeoutMs?: number;
}): Promise<B | null> {
  if (!webgl) return tryLaunch(launch);
  if (mode === 'software') {
    const browser = await tryLaunch(launch, SOFTWARE_ARGS);
    if (browser) log('3D: software (SwiftShader)');
    return browser;
  }
  if (mode === 'gpu') {
    const browser = await tryLaunch(launch, GPU_ARGS);
    if (browser) log('3D: GPU (not probed; forced by FLOW_TOWER_GL=gpu)');
    return browser;
  }
  const gpu = await tryLaunch(launch, GPU_ARGS);
  if (!gpu) {
    // Some CI boxes abort Chromium on the GPU flags; the software flags still give a working browser there.
    const software = await tryLaunch(launch, SOFTWARE_ARGS);
    if (software) log('3D: software (SwiftShader)');
    return software;
  }
  let renderer: string | null;
  try {
    renderer = await probeWithTimeout(gpu, probeTimeoutMs);
  } catch {
    // A probe that throws means the GPU browser is not usable for WebGL: fall back rather than fail the export.
    renderer = null;
  }
  if (!isSoftwareRenderer(renderer)) {
    log(`3D: GPU (${renderer})`);
    return gpu;
  }
  // Start the software browser before closing the GPU one, so a failed software launch still leaves a browser.
  const software = await tryLaunch(launch, SOFTWARE_ARGS);
  if (software) {
    await gpu.close().catch(() => {});
    log('3D: software (SwiftShader)');
    return software;
  }
  log('3D: software launch failed; keeping the GPU browser, 3D may render in software');
  return gpu;
}
