import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Auto-recover from stale chunk 404s after a new deployment
const handleChunkError = (reason: string) => {
    const key = 'last_chunk_reload';
    const last = sessionStorage.getItem(key);
    const now = Date.now();
    if (!last || now - Number(last) > 10000) {
        sessionStorage.setItem(key, String(now));
        console.warn(`[App] Stale chunk detected (${reason}), reloading latest assets...`);
        window.location.reload();
    }
};

window.addEventListener('vite:preloadError', (event) => {
    handleChunkError('vite:preloadError');
});

window.addEventListener('error', (event) => {
    const msg = event?.message || '';
    if (msg.includes('Failed to fetch dynamically imported module') || msg.includes('Importing a module script failed')) {
        handleChunkError('dynamic import failure');
    }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)

