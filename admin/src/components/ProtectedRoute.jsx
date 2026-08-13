import { useAuth } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ profile, allowedRoles, children }) => {
  const { isLoaded, isSignedIn } = useAuth();
  const isLocalDev = import.meta.env.DEV;

  if (!isLoaded || !profile) {
    return <main className="dashboard"><p className="loading-text">Checking access...</p></main>;
  }

  if (!isSignedIn && !isLocalDev) {
    return <Navigate to="/" replace />;
  }

  if (!allowedRoles.includes(profile.role) || (profile.role === "chef" && !profile.isApproved)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default ProtectedRoute;
