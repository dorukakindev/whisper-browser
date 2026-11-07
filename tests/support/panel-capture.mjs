// Gerçek renderer HTML/CSS/JS'si, kontrollü window.api ile: menü ve panel görünümlerini yakalar (mock; Electron/canlı değil).
import path from 'node:path';
import { launch, stageRenderer, ROOT, sleep } from './chromium-fixture.mjs';
export async function openApp({ width = 1440, height = 900, mode = 'browser', theme = 'dark', locale = 'tr' } = {}) {
  const staged = stageRenderer([path.join(ROOT, 'tests/support/discover-fixture-stub.js'), path.join(ROOT, 'tests/support/dub-panel-fixture-stub.js')], { rootDir: process.env.WB_ROOT || ROOT });
  const browser = await launch({ width, height });
  await browser.goto(staged.url); await sleep(1500);
  await browser.until(`typeof applyUiTheme==='function'&&window.__dub`, 'renderer');
  await browser.evaluate(`window.__fx.setLocale('${locale}');applyUiTheme('${theme}');window.__dub.reset('ready');
    const layer=document.getElementById('playerLayer');layer.classList.remove('hidden');
    ${mode === 'browser' ? "layer.classList.add('workspace-browser');" : ''}true`);
  await sleep(600);
  return { browser, staged, close: async () => { await browser.close?.(); staged.cleanup(); } };
}
