import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isBountyHunter: boolean;
  /**
   * True when the user has a client_profiles row. Clients are auto-enrolled in
   * the client referral program, so a person can legitimately hold BOTH a
   * client profile and the bounty_hunter role — the two portals are additive,
   * not mutually exclusive.
   */
  hasClientProfile: boolean;
  loading: boolean;
  adminChecked: boolean;
  bountyChecked: boolean;
  clientChecked: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isBountyHunter, setIsBountyHunter] = useState(false);
  const [hasClientProfile, setHasClientProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminChecked, setAdminChecked] = useState(false);
  const [bountyChecked, setBountyChecked] = useState(false);
  const [clientChecked, setClientChecked] = useState(false);
  const roleCheckRef = useRef<string | null>(null);
  const adminResultRef = useRef(false);
  const bountyResultRef = useRef(false);

  const resetAccess = useCallback(() => {
    setIsAdmin(false);
    setIsBountyHunter(false);
    setHasClientProfile(false);
    adminResultRef.current = false;
    bountyResultRef.current = false;
  }, []);

  const markChecked = useCallback((value: boolean) => {
    setAdminChecked(value);
    setBountyChecked(value);
    setClientChecked(value);
  }, []);

  // One parallel round-trip resolves everything that gates routing: every role
  // row, plus whether the user owns a client profile. These are deliberately
  // independent — a client auto-enrolled in the referral program may also be an
  // approved Bounty Hunter, and must keep access to both portals.
  const checkAccess = useCallback(async (userId: string): Promise<boolean> => {
    // If we already resolved this user, return cached result
    if (roleCheckRef.current === userId) return adminResultRef.current;
    roleCheckRef.current = userId;
    // New user being checked — mark checks as pending so consumers wait
    markChecked(false);
    resetAccess();

    try {
      const [rolesRes, clientRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("client_profiles").select("id").eq("user_id", userId).limit(1),
      ]);

      if (roleCheckRef.current !== userId) return false; // stale
      // `app_role` in the generated types predates 'bounty_hunter' — widen to string
      const roles: string[] = !rolesRes.error && rolesRes.data
        ? rolesRes.data.map((r) => r.role as string)
        : [];
      const adminResult = roles.includes("admin");
      const bountyResult = roles.includes("bounty_hunter");
      const clientResult = !clientRes.error && (clientRes.data?.length ?? 0) > 0;

      adminResultRef.current = adminResult;
      bountyResultRef.current = bountyResult;
      setIsAdmin(adminResult);
      setIsBountyHunter(bountyResult);
      setHasClientProfile(clientResult);
      markChecked(true);
      return adminResult;
    } catch {
      if (roleCheckRef.current === userId) {
        resetAccess();
        markChecked(true);
      }
      return false;
    }
  }, [markChecked, resetAccess]);

  useEffect(() => {
    let mounted = true;

    const processSession = async (newSession: Session | null) => {
      if (!mounted) return;

      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        await checkAccess(newSession.user.id);
      } else {
        roleCheckRef.current = null;
        resetAccess();
        markChecked(true);
      }

      if (mounted) setLoading(false);
    };

    // 1. Set up listener FIRST (captures events during getSession)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        // Recovery links can land on any page (historically the homepage, when
        // the redirect allow-list rejected /reset-password) — the SDK still
        // consumes the token and signs the user in silently. Route them to the
        // set-password screen so the flow always completes visibly.
        if (event === "PASSWORD_RECOVERY" && window.location.pathname !== "/reset-password") {
          window.location.assign("/reset-password");
          return;
        }
        // Don't block the callback — process async
        processSession(newSession);
      }
    );

    // 2. Hydrate current session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      processSession(currentSession);
    }).catch(() => {
      if (mounted) {
        setLoading(false);
        resetAccess();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [checkAccess, resetAccess, markChecked]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  }, []);

  const signOut = useCallback(async () => {
    roleCheckRef.current = null;
    resetAccess();
    markChecked(false);
    await supabase.auth.signOut();
  }, [resetAccess, markChecked]);

  return (
    <AuthContext.Provider
      value={{
        user, session, isAdmin, isBountyHunter, hasClientProfile,
        loading, adminChecked, bountyChecked, clientChecked, signIn, signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
