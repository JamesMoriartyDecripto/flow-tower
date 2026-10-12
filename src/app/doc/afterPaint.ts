/**
 * Resolves once the fonts are loaded and the browser has painted the current DOM. One frame commits the
 * layout that React just wrote; the second makes sure those pixels exist before a print or a screenshot.
 * The frame scheduler is injected so the wait can be tested without a browser.
 */
export function afterPaint(fontsReady: Promise<unknown>, nextFrame: (cb: () => void) => void): Promise<void> {
  return fontsReady.then(() => new Promise<void>((done) => nextFrame(() => nextFrame(done))));
}
