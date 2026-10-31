import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useApp } from "./context/AppContext.jsx";

// Existing pages
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Profile from "./pages/Profile.jsx";
import ProfileView from "./pages/ProfileView.jsx";
import Dashboard from "./pages/dashboard.jsx";

// New pages
import PropertyDetails from "./pages/PropertyDetails.jsx";
import TourScheduling from "./pages/TourScheduling.jsx";
import TourRequests from "./pages/TourRequests.jsx";
import LeaseDeposit from "./pages/LeaseDeposit.jsx";
import RentCollection from "./pages/RentCollection.jsx";
import Inbox from "./pages/Inbox.jsx";
import LandlordDashboard from "./pages/LandlordDashboard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import Applications from "./pages/Applications.jsx";
import Contracts from "./pages/Contracts.jsx";
import SavedListings from "./pages/SavedListings.jsx";
import TenantDashboard from "./pages/TenantDashboard.jsx";
import Notifications from "./pages/Notifications.jsx";
import BackToTop from "./components/BackToTop.jsx";

// Simple placeholder for unlisted routes
function SimplePage({ title, text }) {
  return (
    <section className="container mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <p className="text-slate-600 mt-2">{text}</p>
    </section>
  );
}

// Route guard for admin-only pages
// Admin pages: decided from the live session (see RequireAuth below), not a cached role.
function AdminRoute({ children }) {
  return <RequireAuth roles={["admin"]}>{children}</RequireAuth>;
}

// Route guard for pages that need a signed-in user.
//
// Waits for authReady before deciding. currentUser is null both while
// the "who am I" request is still in flight and when the visitor is
// genuinely signed out, so redirecting on currentUser alone would kick
// every signed-in user to /login on a slow connection or a hard refresh.
//
// The attempted URL travels to /login as `state.from` so Login can
// return them there after signing in.
// The role-specific home for a signed-in user (same rule the login redirect uses).
const homeFor = (u) => (u?.isAdmin ? "/admin" : u?.isLandlord ? "/landlord" : "/tenant");
const hasRole = (u, role) => (role === "admin" ? u?.isAdmin : role === "landlord" ? u?.isLandlord : u?.isTenant);

// `roles` restricts a page to those roles. Checked against the live session,
// so a refresh after someone else logs in can't reach another role's page.
function RequireAuth({ children, roles }) {
  const { currentUser, authReady } = useApp();
  const location = useLocation();

  if (!authReady) return null;
  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (roles && !roles.some((r) => hasRole(currentUser, r))) {
    return <Navigate to={homeFor(currentUser)} replace />;
  }
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/users/:id" element={<RequireAuth><ProfileView /></RequireAuth>} />
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Property browsing */}
        <Route path="/listings" element={<Dashboard />} />
        <Route path="/browse" element={<Dashboard />} />   
        <Route path="/property/:id" element={<PropertyDetails />} />
        {/* Legacy route kept for ApartmentCard links */}
        <Route path="/apartments/:id" element={<PropertyDetails />} />

        {/* Feature modules — every one of these calls an authenticated
            endpoint, so a signed-out visitor is sent to sign in before
            the page renders rather than after filling in a form. */}
        <Route path="/tour/:propertyId" element={<RequireAuth><TourScheduling /></RequireAuth>} />
        <Route path="/tour-requests" element={<RequireAuth roles={["landlord"]}><TourRequests /></RequireAuth>} />
        <Route path="/lease/:propertyId" element={<RequireAuth><LeaseDeposit /></RequireAuth>} />
        <Route path="/rent" element={<RequireAuth roles={["tenant"]}><RentCollection /></RequireAuth>} />
        <Route path="/inbox" element={<RequireAuth><Inbox /></RequireAuth>} />
        <Route path="/applications" element={<RequireAuth><Applications /></RequireAuth>} />
        <Route path="/contracts" element={<RequireAuth><Contracts /></RequireAuth>} />
        <Route path="/landlord" element={<RequireAuth roles={["landlord"]}><LandlordDashboard /></RequireAuth>} />
        <Route path="/tenant" element={<RequireAuth roles={["tenant"]}><TenantDashboard /></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
        <Route path="/saved" element={<RequireAuth roles={["tenant"]}><SavedListings /></RequireAuth>} />

        {/* Admin-only */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />

        {/* Legacy placeholder routes */}
        <Route path="/contact" element={<SimplePage title="Contact" text="Get in touch with us." />} />
        <Route path="/wishlist" element={<Navigate to="/saved" replace />} />
        <Route path="/map-view" element={<SimplePage title="Map View" text="Map view coming soon." />} />
        <Route path="/my-apartment" element={<SimplePage title="My Current Apartment" text="Your current apartment details." />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BackToTop />
    </BrowserRouter>
  );
}

export default App;