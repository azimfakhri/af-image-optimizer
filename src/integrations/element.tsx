import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from '../App';
import css from '../index.css?inline';
import { SETTING_PARAMS, settingsFromParams } from '../lib/params';
import type { Item } from '../store';

/** Rewrite the page stylesheet for a shadow root: :root/body → :host. */
function shadowCss(src: string): string {
  return src
    .replace(/:root:not\(\[data-theme='light'\]\)/g, ":host(:not([data-theme='light']))")
    .replace(/:root\[data-theme='dark'\]/g, ":host([data-theme='dark'])")
    .replace(/:root/g, ':host')
    .replace(/(^|[}\s])body\s*\{/g, '$1:host{display:block;');
}

/** @property rules are ignored inside shadow roots, so register them on the document once. */
function hoistProperties(src: string) {
  if (document.getElementById('af-image-optimizer-props')) return;
  const rules = src.match(/@property[^{]+\{[^}]*\}/g);
  if (!rules) return;
  const style = document.createElement('style');
  style.id = 'af-image-optimizer-props';
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
}

export interface OptimizedEventDetail {
  files: File[];
  /** Per-file details: original name, sizes, dimensions, format, quality. */
  results: {
    original: File;
    file: File;
    path: string;
    width: number;
    height: number;
    format: string;
    quality?: number;
  }[];
}

/**
 * `<image-optimizer preset="og" theme="dark">`
 *
 * Full optimizer UI. When the user clicks "Use N images" it dispatches
 * `optimized` (CustomEvent<OptimizedEventDetail>, bubbles, composed).
 *
 * Attributes: `preset` (preset id), `theme` (light | dark; default follows the OS), and settings that stay fixed
 * whichever preset the user picks: `max-width`, `max-height`, `fit`, `format`, `mode`, `quality`, `target-kb`,
 * `min-aspect` (e.g. "4:3": crop anything taller), `max-aspect`, `crop-position` (center | top | bottom | left | right).
 */
export class ImageOptimizerElement extends HTMLElement {
  static observedAttributes = ['preset', 'theme', ...SETTING_PARAMS];
  private root: Root | null = null;
  private mount: HTMLDivElement | null = null;

  connectedCallback() {
    if (!this.shadowRoot) {
      const shadow = this.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = shadowCss(css);
      this.mount = document.createElement('div');
      shadow.append(style, this.mount);
      hoistProperties(css);
    }
    this.syncTheme();
    this.render();
  }

  disconnectedCallback() {
    // Defer so a quick move in the DOM doesn't tear down state.
    queueMicrotask(() => {
      if (!this.isConnected) {
        this.root?.unmount();
        this.root = null;
      }
    });
  }

  attributeChangedCallback(name: string) {
    if (name === 'theme') this.syncTheme();
    if (name !== 'theme' && this.root) {
      // Preset and settings are initial values; remount so they apply.
      this.root.unmount();
      this.root = null;
      this.render();
    }
  }

  private syncTheme() {
    const t = this.getAttribute('theme');
    if (t === 'light' || t === 'dark') this.dataset.theme = t;
    else delete this.dataset.theme;
  }

  private render() {
    if (!this.mount) return;
    this.root ??= createRoot(this.mount);
    const { settings, errors } = settingsFromParams((n) => this.getAttribute(n));
    for (const e of errors) console.warn(`<image-optimizer> ignored ${e}`);
    this.root.render(
      <StrictMode>
        <App initialPreset={this.getAttribute('preset') ?? undefined} settings={settings} embedded onUse={(items) => this.emit(items)} />
      </StrictMode>,
    );
  }

  private emit(items: Item[]) {
    const results = items.map((it) => ({
      original: it.file,
      file: it.result!.blob,
      path: it.result!.path,
      width: it.result!.width,
      height: it.result!.height,
      format: it.result!.format,
      quality: it.result!.quality,
    }));
    this.dispatchEvent(
      new CustomEvent<OptimizedEventDetail>('optimized', {
        detail: { files: results.map((r) => r.file), results },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

export function defineImageOptimizer(tag = 'image-optimizer') {
  if (!customElements.get(tag)) customElements.define(tag, class extends ImageOptimizerElement {});
}

declare global {
  interface HTMLElementTagNameMap {
    'image-optimizer': ImageOptimizerElement;
  }
}
