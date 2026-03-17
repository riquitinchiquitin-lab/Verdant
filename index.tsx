import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// PWA Install Logic
window.addEventListener('beforeinstallprompt', (e) => {
  // We NO LONGER call e.preventDefault() here.
  // This allows Chrome to show its own 'Install' option in the 3-dot menu.
  
  // Stash the event so we can still trigger it from our sidebar button
  (window as any).deferredPwaPrompt = e;
  
  // Dispatch a custom event so the UI knows to show the button
  window.dispatchEvent(new CustomEvent('pwa-prompt-available'));
  console.log('Verdant: PWA install prompt ready.');
});

window.addEventListener('appinstalled', (event) => {
  console.log('Verdant: PWA was installed.');
  (window as any).deferredPwaPrompt = null;
  window.dispatchEvent(new CustomEvent('pwa-installed'));
});

// Register Service Worker (Handled by VitePWA in production)
// if ('serviceWorker' in navigator) { ... }

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);