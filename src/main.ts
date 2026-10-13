import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel-decorative/700.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/700.css';
import '@fontsource/roboto-condensed/400.css';
import '@fontsource/roboto-condensed/700.css';
import '@fontsource/pt-sans-narrow/400.css';
import '@fontsource/pt-sans-narrow/700.css';
import './ui/styles/base.css';
import { bootGame } from './game/Game';

bootGame().catch((err) => {
  console.error('[boot] fatal', err);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:20px;color:#f88;background:#100;padding:20px;z-index:99999;white-space:pre-wrap;font:14px monospace';
  el.textContent = 'Oyun başlatılamadı:\n' + (err?.stack || err);
  document.body.appendChild(el);
});
