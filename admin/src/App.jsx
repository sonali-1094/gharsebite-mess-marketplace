import { SignedIn, SignedOut, SignIn, UserButton, useAuth } from "@clerk/clerk-react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import ChefAddFood from "./pages/ChefAddFood.jsx";
import ChefDashboard from "./pages/ChefDashboard.jsx";
import ChefOrders from "./pages/ChefOrders.jsx";
import { createApiClient, getStaffProfile } from "./services/api.js";

const HomeRedirect = ({ profile }) => {
  if (!profile) return <Navigate to="/unauthorized" replace />;
  if (profile.role === "chef" && profile.isApproved) return <Navigate to="/chef/dashboard" replace />;
  if (profile.role === "admin") return <Navigate to="/admin/dashboard" replace />;
  return <Navigate to="/unauthorized" replace />;
};

const localDevAdminProfile = {
  id: "local-dev-admin",
  email: "local-dev-admin@localhost",
  role: "admin",
  approvalStatus: "approved",
  isApproved: true
};

const Unauthorized = ({ profile }) => (
  profile?.role === "admin" ? (
    <Navigate to="/admin/dashboard" replace />
  ) : (
    <main className="setup-card">
      <p className="eyebrow">Access</p>
      <h1>Account not ready</h1>
      <p>
        {profile?.role === "chef" && !profile?.isApproved
          ? "Your chef account is waiting for admin approval."
          : "This account does not have admin or chef access."}
      </p>
    </main>
  )
);

const AppContent = () => {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const api = useMemo(() => createApiClient(getToken), [getToken]);
  const [profile, setProfile] = useState(null);
  const [message, setMessage] = useState("");
  const isLocalDev = import.meta.env.DEV;

  useEffect(() => {
    const loadProfile = async () => {
      if (!isLoaded) {
        return;
      }

      if (!isSignedIn && !isLocalDev) {
        setProfile(null);
        return;
      }

      try {
        setProfile(await getStaffProfile(api));
        setMessage("");
      } catch (error) {
        if (isLocalDev) {
          setProfile(localDevAdminProfile);
          setMessage("");
          return;
        }

        setProfile({ role: "", isApproved: false });
        setMessage(error.message);
      }
    };

    loadProfile();
  }, [api, isLoaded, isLocalDev, isSignedIn]);

  const appRoutes = (
    <>
      <header className="topbar">
        <Link className="brand" to="/">
          <span>GharSe</span>Bite
        </Link>
        <nav className="topnav">
          {profile?.role === "admin" ? <Link to="/admin/dashboard">Admin</Link> : null}
          {profile?.role === "chef" && profile?.isApproved ? (
            <>
              <Link to="/chef/dashboard">Chef</Link>
              <Link to="/chef/add-food">Add Food</Link>
              <Link to="/chef/orders">Orders</Link>
            </>
          ) : null}
        </nav>
        {isSignedIn ? <UserButton afterSignOutUrl="/" /> : null}
      </header>

      {message ? <p className="message">{message}</p> : null}

      <Routes>
        <Route path="/" element={<HomeRedirect profile={profile} />} />
        <Route path="/unauthorized" element={<Unauthorized profile={profile} />} />
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute profile={profile} allowedRoles={["admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chef/dashboard"
          element={
            <ProtectedRoute profile={profile} allowedRoles={["chef"]}>
              <ChefDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chef/add-food"
          element={
            <ProtectedRoute profile={profile} allowedRoles={["chef"]}>
              <ChefAddFood />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chef/orders"
          element={
            <ProtectedRoute profile={profile} allowedRoles={["chef"]}>
              <ChefOrders />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );

  return (
    <div className="admin-shell">
      {isLocalDev ? appRoutes : null}

      {!isLocalDev ? <SignedOut>
        <section className="auth-panel">
          <p className="eyebrow">GharSeBite</p>
          <h1>Sign in to manage kitchens and orders</h1>
          <SignIn routing="hash" />
        </section>
      </SignedOut> : null}

      {!isLocalDev ? <SignedIn>{appRoutes}</SignedIn> : null}
    </div>
  );
};

export default AppContent;
