import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import BackofficeLayout from '@/components/BackofficeLayout';
import { LanguageProvider } from '@/lib/i18n';
// Add page imports here
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Home from '@/pages/Home';
import Branches from '@/pages/Branches';
import PropertySetup from '@/pages/PropertySetup';
import Employees from '@/pages/Employees';
import Jobs from '@/pages/Jobs';
import JobDetail from '@/pages/JobDetail';
import Applicants from '@/pages/Applicants';
import Interviews from '@/pages/Interviews';
import Roster from '@/pages/Roster';
import Leave from '@/pages/Leave';
import Attendance from '@/pages/Attendance';
import CompanySettings from '@/pages/CompanySettings';
import Clock from '@/pages/Clock';
import Apply from '@/pages/Apply';
import InterviewBooking from '@/pages/InterviewBooking';
import Onboarding from '@/pages/Onboarding';
import InterviewSettings from '@/pages/InterviewSettings';
import MiniInterview from '@/pages/MiniInterview';
import VideoInterview from '@/pages/VideoInterview';
import EmailTemplates from '@/pages/EmailTemplates';
import TemplateDesign from '@/pages/TemplateDesign';
import JobDesign from '@/pages/JobDesign';
import QrDesign from '@/pages/QrDesign';
import PlatformAdmin from '@/pages/PlatformAdmin';
import Kiosk from '@/pages/Kiosk';

const PUBLIC_PATHS = ['/apply/', '/interview/', '/onboarding/', '/mini-interview/', '/video-interview/', '/kiosk/'];

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const isPublicRoute = PUBLIC_PATHS.some((path) => window.location.pathname.startsWith(path));

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors (applicant pages render without login)
  if (authError && !isPublicRoute) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      {/* Public applicant, interview booking and onboarding surfaces (no login) */}
      <Route path="/apply/:jobId" element={<Apply />} />
      <Route path="/interview/:token" element={<InterviewBooking />} />
      <Route path="/onboarding/:token" element={<Onboarding />} />
      <Route path="/mini-interview/:token" element={<MiniInterview />} />
      <Route path="/video-interview/:token" element={<VideoInterview />} />
      <Route path="/kiosk/:token" element={<Kiosk />} />

      {/* Authentication */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Back office */}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<BackofficeLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/branches" element={<Branches />} />
          <Route path="/property" element={<PropertySetup />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:jobId" element={<JobDetail />} />
          <Route path="/applicants" element={<Applicants />} />
          <Route path="/interviews" element={<Interviews />} />
          <Route path="/roster" element={<Roster />} />
          <Route path="/leave" element={<Leave />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/settings" element={<CompanySettings />} />
          <Route path="/interview-settings" element={<InterviewSettings />} />
          <Route path="/email-templates" element={<EmailTemplates />} />
          <Route path="/template-design" element={<TemplateDesign />} />
          <Route path="/job-design" element={<JobDesign />} />
          <Route path="/qr-design" element={<QrDesign />} />
          <Route path="/clock" element={<Clock />} />
          <Route path="/platform" element={<PlatformAdmin />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <LanguageProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </LanguageProvider>
  )
}

export default App