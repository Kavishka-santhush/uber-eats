/** Injects a <script> once and resolves when loaded (rejects on error). */
export function loadScriptOnce(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') return reject(new Error('no document'));
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`failed to load ${src}`)));
      return;
    }
    const el = document.createElement('script');
    el.id = id;
    el.src = src;
    el.async = true;
    el.onload = () => {
      el.dataset.loaded = 'true';
      resolve();
    };
    el.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(el);
  });
}
