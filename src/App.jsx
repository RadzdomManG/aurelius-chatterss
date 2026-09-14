import React, { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import { ThemeProvider } from 'next-themes';
import ProtectedRoute from '@/components/ProtectedRoute';
import ErrorBoundary, { DefaultFallback } from '@/components/ErrorBoundary';
import { Toaster as SonnerToaster } from 'sonner';

// Core pages — eager (landing + primary flows)
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import FanvueCallback from '@/pages/FanvueCallback';
import AppShell from '@/components/AppShell';
import Inbox from '@/pages/Inbox';
import Models from '@/pages/Models';
import ModelWorkspace from '@/pages/ModelWorkspace';
import Automation from '@/pages/Automation';

// Heavy / secondary pages — lazy loaded for crash isolation + smaller initial bundle
const CalendarPage = lazy(() => import('@/pages/Calendar'));
const MassMessages = lazy(() => import('@/pages/MassMessages'));
const Posts = lazy(() => import('@/pages/Posts'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const Subscribers = lazy(() => import('@/pages/Subscribers'));
const Media = lazy(() => import('@/pages/Media'));
const Playground = lazy(() => import('@/pages/Playground'));
const Templates = lazy(() => import('@/pages/Templates'));
const Webhooks = lazy(() => import('@/pages/Webhooks'));
const Analytics = lazy(() => import('@/pages/Analytics'));
const Activity = lazy(() => import('@/pages/Activity'));
const Diagnostics = lazy(() => import('@/pages/Diagnostics'));
const Settings = lazy(() => import('@/pages/Settings'));
const PpvContent = lazy(() => import('@/pages/PpvContent'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const Billing = lazy(() => import('@/pages/Billing'));
const PlatformDashboard = lazy(() => import('@/pages/PlatformDashboard'));

function PageSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
    </div>
  );
}

// Per-route isolation: a crash in one page shows a recoverable fallback
// instead of a blank black screen, and never kills sibling routes.
function PageWrapper({ children }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<PageWrapper><Login /></PageWrapper>} />
      <Route path="/register" element={<PageWrapper><Register /></PageWrapper>} />
      <Route path="/forgot-password" element={<PageWrapper><ForgotPassword /></PageWrapper>} />
      <Route path="/reset-password" element={<PageWrapper><ResetPassword /></PageWrapper>} />
      <Route path="/fanvue/callback" element={<PageWrapper><FanvueCallback /></PageWrapper>} />
      <Route path="/onboarding" element={<PageWrapper><Onboarding /></PageWrapper>} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<PageWrapper><Inbox /></PageWrapper>} />
          <Route path="/models" element={<PageWrapper><Models /></PageWrapper>} />
          <Route path="/models/:creatorProfileId" element={<PageWrapper><ModelWorkspace /></PageWrapper>} />
          <Route path="/automation" element={<PageWrapper><Automation /></PageWrapper>} />
          <Route path="/calendar" element={<PageWrapper><CalendarPage /></PageWrapper>} />
          <Route path="/mass-messages" element={<PageWrapper><MassMessages /></PageWrapper>} />
          <Route path="/posts" element={<PageWrapper><Posts /></PageWrapper>} />
          <Route path="/notifications" element={<PageWrapper><Notifications /></PageWrapper>} />
          <Route path="/subscribers" element={<PageWrapper><Subscribers /></PageWrapper>} />
          <Route path="/media" element={<PageWrapper><Media /></PageWrapper>} />
          <Route path="/ppv-content" element={<PageWrapper><PpvContent /></PageWrapper>} />
          <Route path="/playground" element={<PageWrapper><Playground /></PageWrapper>} />
          <Route path="/templates" element={<PageWrapper><Templates /></PageWrapper>} />
          <Route path="/webhooks" element={<PageWrapper><Webhooks /></PageWrapper>} />
          <Route path="/analytics" element={<PageWrapper><Analytics /></PageWrapper>} />
          <Route path="/activity" element={<PageWrapper><Activity /></PageWrapper>} />
          <Route path="/diagnostics" element={<PageWrapper><Diagnostics /></PageWrapper>} />
          <Route path="/settings" element={<PageWrapper><Settings /></PageWrapper>} />
          <Route path="/billing" element={<PageWrapper><Billing /></PageWrapper>} />
          <Route path="/platform" element={<PageWrapper><PlatformDashboard /></PageWrapper>} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <ErrorBoundary fallback={({ error, errorId, reset }) => (
              <div className="fixed inset-0">
                <DefaultFallback error={error} errorId={errorId} reset={reset} />
              </div>
            )}>
              <AuthenticatedApp />
            </ErrorBoundary>
          </Router>
          <Toaster />
          <SonnerToaster position="bottom-right" theme="system" richColors />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App