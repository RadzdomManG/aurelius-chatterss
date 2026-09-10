import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import { ThemeProvider } from 'next-themes';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Inbox from '@/pages/Inbox';
import Models from '@/pages/Models';
import ModelWorkspace from '@/pages/ModelWorkspace';
import Automation from '@/pages/Automation';
import Media from '@/pages/Media';
import Playground from '@/pages/Playground';
import Analytics from '@/pages/Analytics';
import Activity from '@/pages/Activity';
import Settings from '@/pages/Settings';
import FanvueCallback from '@/pages/FanvueCallback';
import CalendarPage from '@/pages/Calendar';
import AppShell from '@/components/AppShell';
import { Toaster as SonnerToaster } from 'sonner';

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
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/fanvue/callback" element={<FanvueCallback />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Inbox />} />
          <Route path="/models" element={<Models />} />
          <Route path="/models/:creatorProfileId" element={<ModelWorkspace />} />
          <Route path="/automation" element={<Automation />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/media" element={<Media />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/settings" element={<Settings />} />
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
            <AuthenticatedApp />
          </Router>
          <Toaster />
          <SonnerToaster position="bottom-right" theme="system" richColors />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App