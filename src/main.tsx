import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './styles/tokens.css';
import './styles/globals.css';
import './styles/themes.css';
import './styles/settings.css';
import './styles/music.css';

document.documentElement.classList.toggle(
  'settings-document',
  new URLSearchParams(window.location.search).get('window') === 'settings',
);
document.documentElement.classList.toggle(
  'music-document',
  new URLSearchParams(window.location.search).get('window') === 'music',
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
