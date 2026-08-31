import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const ClientRoute = ({ children }: { children: React.ReactNode }) => {
  const {
    user, loading, isAdmin, isBountyHunter, hasClientProfile,
    adminChecked, bountyChecked, clientChecked,
  } = useAuth();
  const [searchParams] = useSearchParams();
  const viewAs = searchParams.get("viewAs");

  // Access must resolve before we decide, or a bounty hunter briefly renders the
  // client portal shell (and an admin briefly fails the viewAs check).
  if (loading || (user && (!adminChecked || !bountyChecked || !clientChecked))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;
  if (viewAs && !isAdmin) return <Navigate to="/admin/login" replace />;
  // Dual roles are expected: clients are auto-enrolled in the referral program,
  // and a client may also be an approved Bounty Hunter. Only redirect someone
  // who is a hunter and NOTHING else — a client keeps their portal either way.
  if (isBountyHunter && !isAdmin && !hasClientProfile) {
    return <Navigate to="/bounty/portal" replace />;
  }

  return <>{children}</>;
};

export default ClientRoute;
