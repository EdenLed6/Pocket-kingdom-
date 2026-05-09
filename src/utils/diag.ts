// Bridge to the in-page diagnostic overlay defined in index.html.
// Shows scene/lifecycle progress as visible text so we can debug on a phone
// without devtools. No-op if the overlay isn't present.

type DiagFn = (text: string, cls?: string) => void;

declare global {
  interface Window {
    __diag?: DiagFn;
  }
}

export function diag(text: string, cls?: 'ok' | 'err'): void {
  if (typeof window !== 'undefined' && typeof window.__diag === 'function') {
    window.__diag(text, cls);
  }
  if (cls === 'err') {
    console.error('[diag]', text);
  } else {
    console.log('[diag]', text);
  }
}
