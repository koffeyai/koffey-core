import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";
import { EnhancedErrorBoundary } from "@/components/common/EnhancedErrorBoundary";
import LoadingFallback from "@/components/LoadingFallback";

import { queryClient } from "@/lib/cache";

// Platform Admin Components (lazy - only needed for /platform-admin routes)
const PlatformAdminGuard = lazy(() => import("@/components/platform-admin/auth/PlatformAdminGuard").then(m => ({ default: m.PlatformAdminGuard })));
const PlatformAdminLayout = lazy(() => import("@/components/platform-admin/layout/PlatformAdminLayout").then(m => ({ default: m.PlatformAdminLayout })));
const PlatformAdminOrganizations = lazy(() => import("./pages/PlatformAdminOrganizations"));
const PlatformAdminDashboard = lazy(() => import("./pages/PlatformAdmin"));
const PlatformAdminUsers = lazy(() => import("./pages/PlatformAdminUsers"));

// Keep CRM app code-split and load only when /app route is rendered.
const CRMApp = lazy(() => import("./pages/App"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const SetPassword = lazy(() => import("./pages/SetPassword"));
const MySettings = lazy(() => import("./pages/MySettings"));
const NotFound = lazy(() => import("./pages/NotFound"));
const OrganizationSetup = lazy(() => import("./pages/OrganizationSetup"));
const Invite = lazy(() => import("./pages/Invite"));
const AddContact = lazy(() => import("./pages/AddContact"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const SlideStudio = lazy(() => import("./pages/SlideStudio"));
const SlideStudioSettings = lazy(() => import("./pages/SlideStudioSettings"));
const GeneratedPresentations = lazy(() => import("./pages/GeneratedPresentations"));

// Protected Route Component with activity tracking
const ProtectedRoute: React.FC<{ children: React.ReactNode; inverse?: boolean }> = ({ children, inverse = false }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingFallback error={null} />;
  }

  if (inverse) {
    if (user) {
      return <Navigate to="/app" replace />;
    }
    return <>{children}</>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

const AppContent = () => {
  const { loading, error } = useAuth();

  if (loading) {
    return <LoadingFallback error={error} />;
  }

  return (
    <BrowserRouter>
      <EnhancedErrorBoundary level="page" retryable={true}>
        <Suspense fallback={<LoadingFallback error={null} />}>
        <Routes>
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route 
            path="/app" 
            element={
              <ProtectedRoute>
                <EnhancedErrorBoundary level="component">
                  <CRMApp />
                </EnhancedErrorBoundary>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/settings" 
            element={
              <ProtectedRoute>
                <EnhancedErrorBoundary level="component">
                  <MySettings />
                </EnhancedErrorBoundary>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/organization-setup" 
            element={
              <ProtectedRoute>
                <EnhancedErrorBoundary level="component">
                  <OrganizationSetup />
                </EnhancedErrorBoundary>
              </ProtectedRoute>
            } 
          />
          
          {/* === Platform Admin Routes === */}
          <Route 
            path="/platform-admin" 
            element={
              <ProtectedRoute>
                <PlatformAdminGuard>
                  <PlatformAdminLayout />
                </PlatformAdminGuard>
              </ProtectedRoute>
            }
          >
            <Route index element={<PlatformAdminDashboard />} />
            <Route path="organizations" element={<PlatformAdminOrganizations />} />
            <Route path="users" element={<PlatformAdminUsers />} />
            {/* Future sub-routes: /platform-admin/security */}
          </Route>
          {/* =========================== */}

          <Route path="/login" element={
            <ProtectedRoute inverse>
              <Login />
            </ProtectedRoute>
          } />
          <Route path="/auth" element={
            <ProtectedRoute inverse>
              <Signup />
            </ProtectedRoute>
          } />
          <Route path="/signup" element={
            <ProtectedRoute inverse>
              <Signup />
            </ProtectedRoute>
          } />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/invite" element={<Invite />} />
          <Route path="/waitlist" element={<Navigate to="/login" replace />} />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <EnhancedErrorBoundary level="component">
                  <Onboarding />
                </EnhancedErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route 
            path="/app/contacts/new" 
            element={
              <ProtectedRoute>
                <EnhancedErrorBoundary level="component">
                  <AddContact />
                </EnhancedErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route 
            path="/app/leads/new" 
            element={
              <ProtectedRoute>
                <EnhancedErrorBoundary level="component">
                  <AddContact />
                </EnhancedErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route 
            path="/slides" 
            element={
              <ProtectedRoute>
                <EnhancedErrorBoundary level="component">
                  <SlideStudio />
                </EnhancedErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route 
            path="/slides/settings" 
            element={
              <ProtectedRoute>
                <EnhancedErrorBoundary level="component">
                  <SlideStudioSettings />
                </EnhancedErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route 
            path="/slides/generated" 
            element={
              <ProtectedRoute>
                <EnhancedErrorBoundary level="component">
                  <GeneratedPresentations />
                </EnhancedErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </EnhancedErrorBoundary>
    </BrowserRouter>
  );
};

const App = () => (
  <EnhancedErrorBoundary level="page" retryable={true}>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AppContent />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </EnhancedErrorBoundary>
);

export default App;
