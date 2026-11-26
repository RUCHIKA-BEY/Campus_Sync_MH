import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { ToastProvider } from './components/Toaster';
import { reloadForNewVersion } from './lib/staleBuild';
import './index.css';

// Vite reports page files that fail to load (usually: this tab predates a new deploy).
window.addEventListener('vite:preloadError', event => { if (reloadForNewVersion()) event.preventDefault(); });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Permission errors (42501) won't fix themselves on retry.
      retry: (count, error) => (error as { code?: string })?.code !== '42501' && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* reducedMotion="user": animations switch off for people who ask their OS for less motion */}
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </MotionConfig>
  </StrictMode>,
);
