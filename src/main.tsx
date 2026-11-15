import React from 'react';
import ReactDOM from 'react-dom/client';
import { MusicProvider } from './app/providers/MusicProvider';
import { App } from './app/App';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary';
import './styles/tokens.css';
import './styles/globals.css';
import './styles/themes.css';
import './styles/settings.css';
import './styles/music.css';
import './styles/viewport.css';
import './styles/github.css';

document.documentElement.classList.toggle(
  'settings-document',
  ['settings', 'music'].includes(
    new URLSearchParams(window.location.search).get('window') ?? '',
  ),
);
document.documentElement.classList.toggle(
  'music-document',
  new URLSearchParams(window.location.search).get('window') === 'music',
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <MusicProvider>
        <App />
      </MusicProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
