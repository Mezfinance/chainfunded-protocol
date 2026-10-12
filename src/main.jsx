import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { toast } from 'sonner'

if (import.meta.env.VITE_SCREENSHOTS === 'true') {
  window.__cfToast = toast;
}

// After a deploy, the previous build's content-hashed chunks are purged from
// the server. A browser still holding the old index.html will 404 when it
// tries to load a code-split chunk ("Failed to fetch dynamically imported
// module"). Vite dispatches `vite:preloadError` in that case — reload once to
// fetch the current index.html and its valid chunk hashes. The timestamp guard
// reloads at most once per 10s so we never loop if a chunk is genuinely gone.
window.addEventListener('vite:preloadError', (event) => {
  const last = Number(sessionStorage.getItem('cf-preload-reload-at') || 0);
  if (Date.now() - last < 10_000) return;
  sessionStorage.setItem('cf-preload-reload-at', String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
