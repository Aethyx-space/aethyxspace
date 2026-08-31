import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const BountyRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isAdmin, isBountyHunter, loading, adminChecked, bountyChecked } = useAuth();

  // Still resolving auth or roles — show spinner, don't redirect
  if (loading || (user && (!adminChecked || !bountyChecked))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Not signed in — send to the public application page
  if (!user) {
    return <Navigate to="/bounty" replace />;
  }

  // Admins can inspect a hunter's view; hunters get their own portal
  if (!isAdmin && !isBountyHunter) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default BountyRoute;
