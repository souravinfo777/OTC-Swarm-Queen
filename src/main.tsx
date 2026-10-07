// Ensure window.fetch is writable and handle getter-only edge cases in sandbox environments
if (typeof window !== 'undefined') {
  try {
    let desc = Object.getOwnPropertyDescriptor(window, 'fetch');
    let target: any = window;
    if (!desc && typeof Window !== 'undefined' && Window.prototype) {
      desc = Object.getOwnPropertyDescriptor(Window.prototype, 'fetch');
      if (desc) target = Window.prototype;
    }
    if (desc && !desc.set && !desc.writable) {
      let origFetch = window.fetch ? window.fetch.bind(window) : null;
      Object.defineProperty(target, 'fetch', {
        configurable: true,
        enumerable: true,
        get() {
          return origFetch;
        },
        set(fn) {
          if (typeof fn === 'function') origFetch = fn;
        }
      });
    }
  } catch (e) {}

  window.addEventListener(
    'error',
    (event) => {
      if (event && event.message && event.message.includes('fetch of #<Window> which has only a getter')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return true;
      }
    },
    true
  );
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
