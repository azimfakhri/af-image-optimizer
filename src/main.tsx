import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const root = document.getElementById('root')!;
createRoot(root).render(
  <StrictMode>
    <App initialPreset={root.dataset.preset} />
  </StrictMode>,
);
