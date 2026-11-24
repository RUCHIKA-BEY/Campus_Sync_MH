import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { Protected } from './auth/Protected';
import { HomePage } from './features/home/HomePage';
import { DiscoverPage } from './features/discover/DiscoverPage';
import { EventDetailPage } from './features/events/EventDetailPage';
import { RegistrationsPage } from './features/registrations/RegistrationsPage';
import { ClubsPage } from './features/clubs/ClubsPage';
import { LoginPage, SignupPage, ForgotPasswordPage, ResetPasswordPage } from './features/auth/AuthPages';
import { ProfilePage } from './features/auth/ProfilePage';
import { ComingNextPage, NotFoundPage } from './features/misc/StatusPages';
import { AuthUrlEffects } from './auth/AuthUrlEffects';

const router = createBrowserRouter([
  {
    element: <><AuthUrlEffects /><AppShell /></>,
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
      { path: '/timetable', element: <Protected access={{ kind: 'signed-in' }}><ComingNextPage area="timetable" /></Protected> },
      { path: '/organizer', element: <Protected access={{ kind: 'role', roles: ['organizer'] }}><ComingNextPage area="organizer" /></Protected> },
      { path: '/dsa', element: <Protected access={{ kind: 'role', roles: ['dsa'] }}><ComingNextPage area="dsa" /></Protected> },
      { path: '/admin', element: <Protected access={{ kind: 'role', roles: ['admin'] }}><ComingNextPage area="admin" /></Protected> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
