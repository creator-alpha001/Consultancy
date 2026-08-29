import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

/**
 * Where Chromium is, without assuming.
 *
 * Locally this container ships one at a fixed path and Playwright's own
 * download is absent. In CI, `playwright install` puts one where
 * Playwright already looks, and the container path does not exist.
 *
 * Resolution order: an explicit CHROME, then the container's copy if it
 * is really there, then nothing — which lets Playwright use its own.
 * `??` was wrong for this: an empty CHROME is not nullish, so passing
 * `CHROME: ''` to opt out would have set executablePath to the empty
 * string rather than falling through.
 */
const CONTAINER_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export function chromeExecutable() {
  if (process.env.CHROME) return process.env.CHROME;
  if (existsSync(CONTAINER_CHROME)) return CONTAINER_CHROME;
  return undefined;
}

export function launchBrowser(options = {}) {
  const executablePath = chromeExecutable();
  return chromium.launch({ ...(executablePath ? { executablePath } : {}), ...options });
}
