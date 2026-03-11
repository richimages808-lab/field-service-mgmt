import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { Loading } from './components/Loading';
import { PlanProtectedRoute } from './components/PlanProtectedRoute';
import { AdminIntegrations } from './pages/admin/AdminIntegrations';
import { ServicesCatalog } from './pages/admin/ServicesCatalog';
import { SiteAdmin } from './pages/admin/SiteAdmin';
import { TextingSubscription } from './pages/admin/TextingSubscription';
import { AIPhoneAgent } from './pages/admin/AIPhoneAgent';
import { CommunicationsPortal } from './pages/admin/CommunicationsPortal';

// Lazy Load Pages
const Login = React.lazy(() => import('./pages/Login').then(module => ({ default: module.Login })));
const Signup = React.lazy(() => import('./pages/Signup').then(module => ({ default: module.Signup })));
const SignupSuccess = React.lazy(() => import('./pages/SignupSuccess').then(module => ({ default: module.SignupSuccess })));
const JobDetail = React.lazy(() => import('./pages/JobDetail').then(module => ({ default: module.JobDetail }))); // Added
const CreateJob = React.lazy(() => import('./pages/CreateJob').then(module => ({ default: module.CreateJob })));
const CustomerHistory = React.lazy(() => import('./pages/CustomerHistory').then(module => ({ default: module.CustomerHistory })));
const CustomerPortal = React.lazy(() => import('./pages/CustomerPortal').then(module => ({ default: module.CustomerPortal })));

// Customer Portal Pages (Authenticated)
const PublicPortalLayout = React.lazy(() => import('./pages/portal/PublicPortalLayout').then(module => ({ default: module.PublicPortalLayout })));
const CustomerPortalLogin = React.lazy(() => import('./pages/portal/CustomerPortalLogin').then(module => ({ default: module.CustomerPortalLogin })));
const CustomerPortalLayout = React.lazy(() => import('./pages/portal/CustomerPortalLayout').then(module => ({ default: module.CustomerPortalLayout })));
const CustomerPortalDashboard = React.lazy(() => import('./pages/portal/CustomerPortalDashboard').then(module => ({ default: module.CustomerPortalDashboard })));
const CustomerPortalJobs = React.lazy(() => import('./pages/portal/CustomerPortalJobs').then(module => ({ default: module.CustomerPortalJobs, CustomerPortalJobDetail: module.CustomerPortalJobDetail })));
const CustomerPortalJobDetail = React.lazy(() => import('./pages/portal/CustomerPortalJobs').then(module => ({ default: module.CustomerPortalJobDetail })));
const CustomerPortalInvoices = React.lazy(() => import('./pages/portal/CustomerPortalInvoices').then(module => ({ default: module.CustomerPortalInvoices })));
const CustomerPortalInvoiceDetail = React.lazy(() => import('./pages/portal/CustomerPortalInvoices').then(module => ({ default: module.CustomerPortalInvoiceDetail })));
const CustomerPortalMessages = React.lazy(() => import('./pages/portal/CustomerPortalMessages').then(module => ({ default: module.CustomerPortalMessages })));
const CustomerPortalQuotes = React.lazy(() => import('./pages/portal/CustomerPortalQuotes').then(module => ({ default: module.CustomerPortalQuotes })));
const CustomerPortalSettings = React.lazy(() => import('./pages/portal/CustomerPortalSettings').then(module => ({ default: module.CustomerPortalSettings })));
const CustomerPortalPrivacy = React.lazy(() => import('./pages/portal/CustomerPortalPrivacy').then(module => ({ default: module.CustomerPortalPrivacy })));
const Invoices = React.lazy(() => import('./pages/Invoices').then(module => ({ default: module.Invoices })));
const InvoiceDetail = React.lazy(() => import('./pages/InvoiceDetail').then(module => ({ default: module.InvoiceDetail })));
const DataManager = React.lazy(() => import('./pages/DataManager').then(module => ({ default: module.DataManager })));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const TechDashboard = React.lazy(() => import('./pages/TechDashboard').then(module => ({ default: module.TechDashboard })));
const SoloDashboard = React.lazy(() => import('./pages/SoloDashboard').then(module => ({ default: module.SoloDashboard })));
const ScheduleBoard = React.lazy(() => import('./pages/ScheduleBoard').then(module => ({ default: module.ScheduleBoard })));
const KanbanBoard = React.lazy(() => import('./pages/KanbanBoard').then(module => ({ default: module.KanbanBoard })));
const CalendarBoard = React.lazy(() => import('./pages/CalendarBoard').then(module => ({ default: module.CalendarBoard })));
const SoloCalendar = React.lazy(() => import('./pages/SoloCalendar').then(module => ({ default: module.SoloCalendar })));
const SoloScheduler = React.lazy(() => import('./pages/SoloScheduler').then(module => ({ default: module.SoloScheduler })));
const CustomerList = React.lazy(() => import('./pages/CustomerList').then(module => ({ default: module.CustomerList })));
const DispatcherConsole = React.lazy(() => import('./pages/DispatcherConsole').then(module => ({ default: module.DispatcherConsole })));
const TechnicianManager = React.lazy(() => import('./pages/TechnicianManager').then(module => ({ default: module.TechnicianManager })));
const Profile = React.lazy(() => import('./pages/Profile').then(module => ({ default: module.Profile })));
const OrganizationSettings = React.lazy(() => import('./pages/OrganizationSettings').then(module => ({ default: module.OrganizationSettings })));
const JobIntakeDashboard = React.lazy(() => import('./pages/JobIntakeDashboard').then(module => ({ default: module.JobIntakeDashboard })));
const TechnicianProfile = React.lazy(() => import('./pages/TechnicianProfile').then(module => ({ default: module.TechnicianProfile })));
const MaterialsInventory = React.lazy(() => import('./pages/MaterialsInventory').then(module => ({ default: module.MaterialsInventory })));
const ToolsInventory = React.lazy(() => import('./pages/ToolsInventory').then(module => ({ default: module.ToolsInventory })));
const CreateQuote = React.lazy(() => import('./pages/CreateQuote').then(module => ({ default: module.CreateQuote })));
const QuoteView = React.lazy(() => import('./pages/QuoteView').then(module => ({ default: module.QuoteView })));
const QuotesList = React.lazy(() => import('./pages/QuotesList').then(module => ({ default: module.QuotesList })));
const Reports = React.lazy(() => import('./pages/Reports').then(module => ({ default: module.Reports })));
const AddOns = React.lazy(() => import('./pages/AddOns').then(module => ({ default: module.AddOns })));
const HelpCenter = React.lazy(() => import('./pages/HelpCenter').then(module => ({ default: module.HelpCenter })));

// Dashboard Component (Legacy/Shared Logic could go here, but we are splitting)
const RoleBasedDashboard: React.FC = () => {
    const { user } = useAuth();

    // Access custom properties directly from User type
    const role = user?.role;
    const techType = user?.techType;

    console.log("[RoleBasedDashboard] Routing decision - role:", role, "techType:", techType);

    // Site admin users get redirected to the site admin page
    if (user?.site_admin === true || user?.email?.toLowerCase() === 'rich@richheaton.com') {
        console.log("[RoleBasedDashboard] → Routing to SiteAdmin (site_admin)");
        return <Navigate to="/site-admin" replace />;
    }

    if (role === 'dispatcher') {
        console.log("[RoleBasedDashboard] → Routing to AdminDashboard (dispatcher)");
        return <AdminDashboard />;
    }

    if (role === 'technician') {
        if (techType === 'solopreneur') {
            console.log("[RoleBasedDashboard] → Routing to SoloDashboard (solopreneur)");
            return <SoloDashboard />;
        }
        console.log("[RoleBasedDashboard] → Routing to TechDashboard (corporate technician)");
        return <TechDashboard />;
    }

    // Default fallback (or maybe a generic view)
    console.log("[RoleBasedDashboard] → Routing to AdminDashboard (default fallback)");
    return <AdminDashboard />;
};

// ProtectedRoute Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return <Loading />;
    }

    // Require valid Firebase user object
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return <Layout>{children}</Layout>;
};

// RoleProtectedRoute - Restrict access by user role
const RoleProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles: string[] }> = ({ children, allowedRoles }) => {
    const { user } = useAuth();

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (!allowedRoles.includes(user.role || '')) {
        // User doesn't have permission, redirect to their dashboard
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
};

const App: React.FC = () => {
    return (
        <AuthProvider>
            <Toaster position="top-right" />
            <Router>
                <Suspense fallback={<Loading />}>
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/signup" element={<Signup />} />
                        <Route path="/signup-success" element={<SignupSuccess />} />
                        <Route
                            path="/"
                            element={
                                <ProtectedRoute>
                                    <RoleBasedDashboard />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/jobs/:jobId"
                            element={
                                <ProtectedRoute>
                                    <JobDetail />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/jobs/new"
                            element={
                                <ProtectedRoute>
                                    <CreateJob />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/history"
                            element={
                                <ProtectedRoute>
                                    <CustomerHistory />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/invoices"
                            element={
                                <ProtectedRoute>
                                    <Invoices />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/invoices/:id"
                            element={
                                <ProtectedRoute>
                                    <InvoiceDetail />
                                </ProtectedRoute>
                            }
                        />
                        {/* Public quote view (no auth required) */}
                        <Route path="/quote/:token" element={<QuoteView />} />

                        {/* Public Customer Portal (Mini-Site) */}
                        <Route path="/p/:portalSlug" element={<PublicPortalLayout />} />

                        {/* Legacy portal (email-based, for backwards compatibility) */}
                        <Route path="/portal-legacy" element={<CustomerPortal />} />

                        {/* New authenticated portal */}
                        <Route path="/portal/login" element={<CustomerPortalLogin />} />
                        <Route path="/portal" element={<CustomerPortalLayout />}>
                            <Route index element={<CustomerPortalDashboard />} />
                            <Route path="jobs" element={<CustomerPortalJobs />} />
                            <Route path="jobs/:id" element={<CustomerPortalJobDetail />} />
                            <Route path="quotes" element={<CustomerPortalQuotes />} />
                            <Route path="invoices" element={<CustomerPortalInvoices />} />
                            <Route path="invoices/:id" element={<CustomerPortalInvoiceDetail />} />
                            <Route path="messages" element={<CustomerPortalMessages />} />
                            <Route path="settings" element={<CustomerPortalSettings />} />
                            <Route path="privacy" element={<CustomerPortalPrivacy />} />
                        </Route>
                        <Route
                            path="/data-manager"
                            element={
                                <ProtectedRoute>
                                    <DataManager />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/schedule"
                            element={
                                <ProtectedRoute>
                                    <ScheduleBoard />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/kanban"
                            element={
                                <ProtectedRoute>
                                    <KanbanBoard />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/admin"
                            element={
                                <ProtectedRoute>
                                    <AdminDashboard />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/admin/integrations"
                            element={
                                <ProtectedRoute>
                                    <AdminIntegrations />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/admin/services"
                            element={
                                <ProtectedRoute>
                                    <ServicesCatalog />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/admin/texting"
                            element={
                                <ProtectedRoute>
                                    <TextingSubscription />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/admin/ai-phone-agent"
                            element={
                                <ProtectedRoute>
                                    <AIPhoneAgent />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/admin/communications"
                            element={
                                <ProtectedRoute>
                                    <CommunicationsPortal />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/site-admin"
                            element={
                                <ProtectedRoute>
                                    <SiteAdmin />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/calendar"
                            element={
                                <ProtectedRoute>
                                    <PlanProtectedRoute requiredFeature="dispatcher_console">
                                        <CalendarBoard />
                                    </PlanProtectedRoute>
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/solo-scheduler"
                            element={
                                <ProtectedRoute>
                                    <RoleProtectedRoute allowedRoles={['technician']}>
                                        <SoloScheduler />
                                    </RoleProtectedRoute>
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/solo-calendar"
                            element={
                                <ProtectedRoute>
                                    <SoloCalendar />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/job-intake"
                            element={
                                <ProtectedRoute>
                                    <RoleProtectedRoute allowedRoles={['technician', 'dispatcher', 'owner']}>
                                        <JobIntakeDashboard />
                                    </RoleProtectedRoute>
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/contacts"
                            element={
                                <ProtectedRoute>
                                    <CustomerList />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/dispatcher"
                            element={
                                <ProtectedRoute>
                                    <RoleProtectedRoute allowedRoles={['dispatcher', 'owner']}>
                                        <PlanProtectedRoute requiredFeature="dispatcher_console">
                                            <DispatcherConsole />
                                        </PlanProtectedRoute>
                                    </RoleProtectedRoute>
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/techs"
                            element={
                                <ProtectedRoute>
                                    <RoleProtectedRoute allowedRoles={['dispatcher', 'owner']}>
                                        <PlanProtectedRoute requiredFeature="team_management">
                                            <TechnicianManager />
                                        </PlanProtectedRoute>
                                    </RoleProtectedRoute>
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/profile"
                            element={
                                <ProtectedRoute>
                                    <Profile />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/tech-profile"
                            element={
                                <ProtectedRoute>
                                    <TechnicianProfile />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/settings"
                            element={
                                <ProtectedRoute>
                                    <OrganizationSettings />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/materials"
                            element={
                                <ProtectedRoute>
                                    <MaterialsInventory />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/tools"
                            element={
                                <ProtectedRoute>
                                    <ToolsInventory />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/quotes"
                            element={
                                <ProtectedRoute>
                                    <QuotesList />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/reports"
                            element={
                                <ProtectedRoute>
                                    <Reports />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/quotes/new/:jobId"
                            element={
                                <ProtectedRoute>
                                    <CreateQuote />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/addons"
                            element={
                                <ProtectedRoute>
                                    <AddOns />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/help"
                            element={
                                <ProtectedRoute>
                                    <HelpCenter />
                                </ProtectedRoute>
                            }
                        />
                    </Routes>
                </Suspense>
            </Router>
        </AuthProvider>
    );
}

export default App;
