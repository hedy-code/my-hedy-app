import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const originalError = console.error;
console.error = (...args) => {
  originalError(...args);
  const div = document.createElement('div');
  div.style.position = 'fixed';
  div.style.top = '0';
  div.style.left = '0';
  div.style.width = '100vw';
  div.style.backgroundColor = 'rgba(255, 0, 0, 0.9)';
  div.style.color = 'white';
  div.style.padding = '20px';
  div.style.zIndex = '99999';
  div.style.whiteSpace = 'pre-wrap';
  div.style.overflow = 'auto';
  div.style.maxHeight = '100vh';
  div.innerHTML = `<h3>React Console Error</h3><pre>${args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')}</pre>`;
  document.body.appendChild(div);
};

window.addEventListener('error', (event) => {
  const div = document.createElement('div');
  div.style.position = 'fixed';
  div.style.top = '0';
  div.style.left = '0';
  div.style.width = '100vw';
  div.style.backgroundColor = 'rgba(255, 0, 0, 0.9)';
  div.style.color = 'white';
  div.style.padding = '20px';
  div.style.zIndex = '99999';
  div.style.whiteSpace = 'pre-wrap';
  div.style.overflow = 'auto';
  div.style.maxHeight = '100vh';
  div.innerHTML = `<h3>JavaScript Error</h3><pre>${event.error?.stack || event.message}</pre>`;
  document.body.appendChild(div);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
