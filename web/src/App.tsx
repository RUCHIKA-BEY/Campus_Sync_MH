import { lazy, type ComponentType } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { Protected } from './auth/Protected';
import { AuthUrlEffects } from './auth/AuthUrlEffects';
import { AppError } from './components/AppError';
import { isChunkLoadError, reloadForNewVersion } from './lib/staleBuild';

// Code splitting: each page is downloaded only when first visited, so the
// first load stays small (the Admin console never reaches a student's phone).
function page<K extends string>(loader: () => Promise<Record<K, ComponentType<any>>>, name: K) {
  return lazy(() => loader().then(m => ({ default: m[name] }), error => {
    // Old tab after a new deploy: reload to get the new files instead of crashing.
    if (isChunkLoadError(error) && reloadForNewVersion()) return new Promise<never>(() => {});
    throw error;
  }));
}
const HomePage = page(() => import('./features/home/HomePage'), 'HomePage');
const DiscoverPage = page(() => import('./features/discover/DiscoverPage'), 'DiscoverPage');
const EventDetailPage = page(() => import('./features/events/EventDetailPage'), 'EventDetailPage');
const RegistrationsPage = page(() => import('./features/registrations/RegistrationsPage'), 'RegistrationsPage');
const ClubsPage = page(() => import('./features/clubs/ClubsPage'), 'ClubsPage');
const LoginPage = page(() => import('./features/auth/AuthPages'), 'LoginPage');
const SignupPage = page(() => import('./features/auth/AuthPages'), 'SignupPage');
const ForgotPasswordPage = page(() => import('./features/auth/AuthPages'), 'ForgotPasswordPage');
const ResetPasswordPage = page(() => import('./features/auth/AuthPages'), 'ResetPasswordPage');
const ProfilePage = page(() => import('./features/auth/ProfilePage'), 'ProfilePage');
const TimetablePage = page(() => import('./features/timetable/TimetablePage'), 'TimetablePage');
const OrganizerPage = page(() => import('./features/organizer/OrganizerPage'), 'OrganizerPage');
const DsaPage = page(() => import('./features/dsa/DsaPage'), 'DsaPage');
const AdminPage = page(() => import('./features/admin/AdminPage'), 'AdminPage');
const NotificationsPage = page(() => import('./features/notifications/NotificationsPage'), 'NotificationsPage');
const NotFoundPage = page(() => import('./features/misc/StatusPages'), 'NotFoundPage');

const router = createBrowserRouter([
  {
    element: <><AuthUrlEffects /><AppShell /></>,
    errorElement: <AppError />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/discover', element: <DiscoverPage /> },
      { path: '/events/:id', element: <EventDetailPage /> },
      { path: '/clubs', element: <ClubsPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/registrations', element: <Protected access={{ kind: 'signed-in' }}><RegistrationsPage /></Protected> },
      { path: '/profile', element: <Protected access={{ kind: 'signed-in' }}><ProfilePage /></Protected> },
      { path: '/notifications', element: <Protected access={{ kind: 'signed-in' }}><NotificationsPage /></Protected> },
      { path: '/timetable', element: <Protected access={{ kind: 'signed-in' }}><TimetablePage /></Protected> },
      { path: '/organizer', element: <Protected access={{ kind: 'role', roles: ['organizer'] }}><OrganizerPage /></Protected> },
      { path: '/dsa', element: <Protected access={{ kind: 'role', roles: ['dsa'] }}><DsaPage /></Protected> },
      { path: '/admin', element: <Protected access={{ kind: 'role', roles: ['admin'] }}><AdminPage /></Protected> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
