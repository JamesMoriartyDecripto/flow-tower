import { describe, expect, it } from 'vitest';
import {
  GPU_ARGS,
  SOFTWARE_ARGS,
  glMode,
  isSoftwareRenderer,
  launchBrowser,
  type BrowserLike,
  type LaunchOptions,
  type PageLike,
} from '../src/cli/browser.ts';

const IRIS = 'ANGLE (Intel, Mesa Intel(R) Iris(R) Xe Graphics (TGL GT2), OpenGL ES 3.2)';
const SWIFTSHADER = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)';

interface Fake { browser: BrowserLike; closed: boolean }

/** A fake page whose WebGL renderer answer, or failure, is set by the test. */
function fakePage(renderer: string | null | 'throw', calls: string[]): PageLike {
  return {
    async evaluate() {
      if (renderer === 'throw') throw new Error('probe failed');
      return renderer;
    },
    async close() { calls.push('page.close'); },
  };
}

/**
 * A fake `launch`: each call records its options and returns a browser that reports the given renderer.
 * `failFirst` makes the bundled launch fail (no bundled Chromium) so the channel fallback runs.
 */
function fakeLaunch(renderer: string | null | 'throw', opts: { failFirst?: number; failAll?: boolean } = {}) {
  const calls: LaunchOptions[] = [];
  const browsers: Fake[] = [];
  const events: string[] = [];
  let attempts = 0;
  const launch = async (options: LaunchOptions): Promise<BrowserLike> => {
    calls.push(options);
    attempts++;
    if (opts.failAll || attempts <= (opts.failFirst ?? 0)) throw new Error('no browser');
    const fake: Fake = { browser: undefined as unknown as BrowserLike, closed: false };
    fake.browser = {
      async newPage() { return fakePage(renderer, events); },
      async close() { fake.closed = true; events.push('browser.close'); },
    };
    browsers.push(fake);
    return fake.browser;
  };
  return { launch, calls, browsers, events };
}

describe('isSoftwareRenderer', () => {
  it('treats null and empty as software', () => {
    expect(isSoftwareRenderer(null)).toBe(true);
    expect(isSoftwareRenderer('')).toBe(true);
  });
  it('flags SwiftShader and llvmpipe in any case', () => {
    expect(isSoftwareRenderer(SWIFTSHADER)).toBe(true);
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0, 256 bits)')).toBe(true);
    expect(isSoftwareRenderer('SWIFTSHADER')).toBe(true);
  });
  it('accepts the Intel Iris Xe hardware renderer', () => {
    expect(isSoftwareRenderer(IRIS)).toBe(false);
  });
});

describe('glMode', () => {
  it('forces gpu and software', () => {
    expect(glMode('gpu')).toBe('gpu');
    expect(glMode('software')).toBe('software');
  });
  it('is auto for unset, empty, or a typo', () => {
    expect(glMode(undefined)).toBe('auto');
    expect(glMode('')).toBe('auto');
    expect(glMode('softwre')).toBe('auto');
    expect(glMode('GPU')).toBe('auto');
  });
});

describe('launchBrowser', () => {
  it('launches with no extra args when WebGL is not needed', async () => {
    const f = fakeLaunch(IRIS);
    const log: string[] = [];
    const browser = await launchBrowser({ webgl: false, launch: f.launch, log: (l) => log.push(l) });
    expect(browser).not.toBeNull();
    expect(f.calls).toEqual([{}]);
    expect(f.browsers[0].closed).toBe(false);
  });

  it('auto keeps the GPU browser for the Iris Xe renderer', async () => {
    const f = fakeLaunch(IRIS);
    const log: string[] = [];
    const browser = await launchBrowser({ webgl: true, launch: f.launch, mode: 'auto', log: (l) => log.push(l) });
    expect(browser).toBe(f.browsers[0].browser);
    expect(f.calls).toEqual([{ args: GPU_ARGS }]);
    expect(f.browsers[0].closed).toBe(false);
    expect(log).toEqual([`3D: GPU (${IRIS})`]);
  });

  it('auto relaunches with software args and closes the first browser for SwiftShader', async () => {
    const f = fakeLaunch(SWIFTSHADER);
    const log: string[] = [];
    const browser = await launchBrowser({ webgl: true, launch: f.launch, mode: 'auto', log: (l) => log.push(l) });
    expect(browser).toBe(f.browsers[1].browser);
    expect(f.calls).toEqual([{ args: GPU_ARGS }, { args: SOFTWARE_ARGS }]);
    expect(f.browsers[0].closed).toBe(true);
    expect(f.browsers[1].closed).toBe(false);
    expect(log).toEqual(['3D: software (SwiftShader)']);
  });

  it('auto relaunches with software args when there is no renderer (null)', async () => {
    const f = fakeLaunch(null);
    const browser = await launchBrowser({ webgl: true, launch: f.launch, mode: 'auto', log: () => {} });
    expect(browser).toBe(f.browsers[1].browser);
    expect(f.calls[1]).toEqual({ args: SOFTWARE_ARGS });
    expect(f.browsers[0].closed).toBe(true);
  });

  it('auto relaunches with software args when the probe throws', async () => {
    const f = fakeLaunch('throw');
    const browser = await launchBrowser({ webgl: true, launch: f.launch, mode: 'auto', log: () => {} });
    expect(browser).toBe(f.browsers[1].browser);
    expect(f.calls[1]).toEqual({ args: SOFTWARE_ARGS });
    expect(f.browsers[0].closed).toBe(true);
    // The probe page is still closed even though it threw.
    expect(f.events).toContain('page.close');
  });

  it('software mode uses software args and skips the probe', async () => {
    const f = fakeLaunch(IRIS);
    const browser = await launchBrowser({ webgl: true, launch: f.launch, mode: 'software', log: () => {} });
    expect(browser).toBe(f.browsers[0].browser);
    expect(f.calls).toEqual([{ args: SOFTWARE_ARGS }]);
    expect(f.events).not.toContain('page.close');
  });

  it('gpu mode uses GPU args and skips the probe even for SwiftShader', async () => {
    const f = fakeLaunch(SWIFTSHADER);
    const browser = await launchBrowser({ webgl: true, launch: f.launch, mode: 'gpu', log: () => {} });
    expect(browser).toBe(f.browsers[0].browser);
    expect(f.calls).toEqual([{ args: GPU_ARGS }]);
    expect(f.events).not.toContain('page.close');
  });

  it('falls back to the installed Chrome when the bundled Chromium fails', async () => {
    const f = fakeLaunch(IRIS, { failFirst: 1 });
    const browser = await launchBrowser({ webgl: true, launch: f.launch, mode: 'gpu', log: () => {} });
    expect(browser).not.toBeNull();
    expect(f.calls).toEqual([{ args: GPU_ARGS }, { args: GPU_ARGS, channel: 'chrome' }]);
  });

  it('returns null when neither the bundled nor the installed Chrome starts', async () => {
    const f = fakeLaunch(IRIS, { failAll: true });
    const browser = await launchBrowser({ webgl: true, launch: f.launch, mode: 'auto', log: () => {} });
    expect(browser).toBeNull();
    expect(f.calls.length).toBe(4);
  });

  it('a probe that never resolves falls back after the timeout and closes the GPU browser', async () => {
    const f = fakeLaunch(IRIS);
    // The GPU browser's page never answers, so only the timer can end the probe.
    const launch = async (options: LaunchOptions): Promise<BrowserLike> => {
      if (options.args !== GPU_ARGS) return f.launch(options);
      const b = await f.launch(options);
      return { newPage: () => new Promise<PageLike>(() => {}), close: () => b.close() };
    };
    const log: string[] = [];
    const browser = await launchBrowser({ webgl: true, launch, mode: 'auto', probeTimeoutMs: 20, log: (l) => log.push(l) });
    expect(browser).toBe(f.browsers[1].browser);
    expect(f.browsers[0].closed).toBe(true);
    expect(log).toEqual(['3D: software (SwiftShader)']);
  });

  it('GPU launch null then software ok returns the software browser', async () => {
    const f = fakeLaunch(IRIS, { failFirst: 2 });
    const log: string[] = [];
    const browser = await launchBrowser({ webgl: true, launch: f.launch, mode: 'auto', log: (l) => log.push(l) });
    expect(browser).not.toBeNull();
    expect(f.calls).toEqual([
      { args: GPU_ARGS },
      { args: GPU_ARGS, channel: 'chrome' },
      { args: SOFTWARE_ARGS },
    ]);
    expect(log).toEqual(['3D: software (SwiftShader)']);
  });

  it('software launch null after a software probe keeps the GPU browser open', async () => {
    const f = fakeLaunch(SWIFTSHADER, { failFirst: 0 });
    const origLaunch = f.launch;
    const launch = async (options: LaunchOptions): Promise<BrowserLike> => {
      if (options.args === SOFTWARE_ARGS) throw new Error('no software');
      return origLaunch(options);
    };
    const log: string[] = [];
    const browser = await launchBrowser({ webgl: true, launch, mode: 'auto', log: (l) => log.push(l) });
    expect(browser).toBe(f.browsers[0].browser);
    expect(f.browsers[0].closed).toBe(false);
    expect(log.at(-1)).toMatch(/keeping the GPU browser/);
  });

  it('a timed-out probe does not keep the process waiting on its timer', async () => {
    const launch = async (): Promise<BrowserLike> => ({
      newPage: () => new Promise<PageLike>(() => {}),
      close: async () => {},
    });
    const started = Date.now();
    const browser = await launchBrowser({ webgl: true, launch, mode: 'auto', probeTimeoutMs: 5, log: () => {} });
    expect(browser).not.toBeNull();
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
