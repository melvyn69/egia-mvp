import { useEffect, useMemo, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseAnonKey, supabaseUrl } from "./lib/supabase";
import { startGoogleConnection } from "./lib/googleAuth";
import { Sidebar } from "./components/layout/Sidebar";
import { Topbar } from "./components/layout/Topbar";
import { Dashboard } from "./pages/Dashboard";
import { Inbox } from "./pages/Inbox";
import { Connect } from "./pages/Connect";
import { Analytics } from "./pages/Analytics";
import { BrandVoice } from "./pages/BrandVoice";
import { Automation } from "./pages/Automation";
import { AutomationBuilder } from "./pages/AutomationBuilder";
import { TestLab } from "./pages/TestLab";
import { Reports } from "./pages/Reports";
import { TeamRanking } from "./pages/TeamRanking";
import Settings from "./pages/Settings";
import Invite from "./pages/Invite";
import Alerts from "./pages/Alerts";
import { Competitors } from "./pages/Competitors";
import { SyncStatus } from "./pages/SyncStatus";
import AIJobHealth from "./pages/AIJobHealth";
import { OAuthCallback } from "./pages/OAuthCallback";
import { AuthCallback } from "./pages/AuthCallback";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";

type SessionDebugInfo = {
  userId: string | null;
  expiresAt: number | null;
  accessToken: string | null;
  googleConnected: boolean;
};

const App = () => {
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleReauthRequired, setGoogleReauthRequired] = useState(false);
  const [syncAllLoading, setSyncAllLoading] = useState(false);
  const [syncAllMessage, setSyncAllMessage] = useState<string | null>(null);
  const [lastLogStatus, setLastLogStatus] = useState<string | null>(null);
  const [lastLogMessage, setLastLogMessage] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<SessionDebugInfo | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [locations, setLocations] = useState<
    Array<{
      id: string;
      location_title: string | null;
      location_resource_name: string;
      address_json: unknown | null;
      phone: string | null;
      website_uri: string | null;
    }>
  >([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [syncingLocations, setSyncingLocations] = useState(false);
  const [syncCooldownUntil, setSyncCooldownUntil] = useState<number | null>(
    () => {
      const stored = window.localStorage.getItem("gbp_sync_cooldown_until");
      if (!stored) {
        return null;
      }
      const parsed = Number(stored);
      return Number.isFinite(parsed) ? parsed : null;
    }
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const envMissing = !supabaseUrl || !supabaseAnonKey;
  const isCallbackPath =
    location.pathname === "/google_oauth_callback" ||
    location.pathname === "/auth/callback";
  const debugExpiresAtLabel =
    debugInfo?.expiresAt && Number.isFinite(debugInfo.expiresAt)
      ? new Date(debugInfo.expiresAt * 1000).toISOString()
      : "—";

  const pageMeta = useMemo(() => {
    if (location.pathname === "/auth/callback") {
      return {
        title: "Connexion",
        subtitle: "Finalisation de la session."
      };
    }

    if (location.pathname === "/google_oauth_callback") {
      return {
        title: "Connexion Google",
        subtitle: "Finalisation du compte Business Profile."
      };
    }

    if (location.pathname === "/connect") {
      return {
        title: "Connexion",
        subtitle: "Reliez vos lieux Google Business Profile."
      };
    }

    if (location.pathname === "/inbox") {
      return {
        title: "Boîte de réception",
        subtitle: "Réponses aux avis et suivi des interactions."
      };
    }

    if (location.pathname === "/analytics") {
      return {
        title: "Analytics",
        subtitle: "Tendances, répartition et thèmes clients."
      };
    }

    if (location.pathname.startsWith("/automation")) {
      return {
        title: "Automatisations",
        subtitle: "Workflows, conditions et brouillons assistés."
      };
    }

    if (location.pathname === "/settings/brand-voice") {
      return {
        title: "Brand Voice",
        subtitle: "Uniformiser le ton des reponses IA."
      };
    }
    if (location.pathname === "/settings/test-lab") {
      return {
        title: "Test Lab",
        subtitle: "Simulation de reponse IA sans ecriture."
      };
    }

    if (location.pathname === "/reports") {
      return {
        title: "Rapports",
        subtitle: "PDF et syntheses pour vos etablissements."
      };
    }

    if (location.pathname === "/alerts") {
      return {
        title: "Alertes intelligentes",
        subtitle: "Signaux prioritaires et suivi des actions."
      };
    }

    return {
      title: "Dashboard",
      subtitle: "Suivi des avis, KPIs et activite en temps reel."
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        console.info("Supabase auth state:", event);
        setSession(nextSession);
      }
    );

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!supabase || !session) {
      setGoogleConnected(null);
      return;
    }

    let isMounted = true;
    setGoogleError(null);

    supabase
      .from("google_connections")
      .select("id")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!isMounted) {
          return;
        }

        if (error) {
          console.error("Google connection lookup error:", error);
          setGoogleError("Impossible de verifier la connexion Google.");
          setGoogleConnected(false);
          return;
        }

        setGoogleConnected(Boolean(data));
      });

    return () => {
      isMounted = false;
    };
  }, [session]);

  useEffect(() => {
    if (!supabase || !session?.user?.id) {
      return;
    }
    const email = session.user.email ?? null;
    if (!email) {
      return;
    }
    (supabase as unknown as { from: (table: string) => any })
      .from("user_profiles")
      .upsert(
        {
          user_id: session.user.id,
          email,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .then((result: { error?: { message?: string } | null }) => {
        const error = result?.error ?? null;
        if (error) {
          console.warn("user_profiles upsert failed:", error.message);
        }
      });
  }, [session]);

  const fetchLocations = async (userId: string) => {
    if (!supabase) {
      return;
    }

    setLocationsLoading(true);
    setLocationsError(null);

    const { data, error } = await supabase
      .from("google_locations")
      .select(
        "id, location_title, location_resource_name, address_json, phone, website_uri"
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("google_locations fetch error:", error);
      setLocationsError("Impossible de charger les lieux Google.");
      setLocations([]);
    } else {
      setLocations(data ?? []);
    }

    setLocationsLoading(false);
  };

  useEffect(() => {
    if (!session) {
      setLocations([]);
      return;
    }

    void fetchLocations(session.user.id);
  }, [session]);

  const handleSignIn = async () => {
    setAuthError(null);
    setAuthMessage(null);

    if (!supabase) {
      const message = "Configuration Supabase manquante.";
      console.error(message);
      setAuthError(message);
      return;
    }

    if (!authEmail.trim()) {
      setAuthError("Email requis.");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      console.error("magic link error:", error);
      setAuthError("Impossible d'envoyer le lien de connexion.");
      return;
    }

    setAuthMessage("Lien de connexion envoye. Verifie ta boite mail.");
  };

  const handleConnectGoogle = async () => {
    setGoogleError(null);
    setGoogleReauthRequired(false);

    if (!supabase) {
      setGoogleError("Connexion Supabase requise.");
      return;
    }

    try {
      await startGoogleConnection(supabase);
    } catch (error) {
      console.error("google oauth error:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Impossible de demarrer la connexion Google.";
      setGoogleError(message);
    }
  };

  const handleSyncLocations = async () => {
    setLocationsError(null);

    if (!supabase || !session || !supabaseUrl || !supabaseAnonKey) {
      setLocationsError("Connexion Supabase requise.");
      return;
    }

    const now = Date.now();
    if (syncCooldownUntil && syncCooldownUntil > now) {
      const secondsLeft = Math.ceil((syncCooldownUntil - now) / 1000);
      setLocationsError(
        `Reessaie dans ${secondsLeft} secondes avant une nouvelle synchronisation.`
      );
      return;
    }

    try {
      setSyncingLocations(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token;
      const response = await fetch("/api/google/gbp/sync", {
        method: "POST",
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : {}
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        if (response.status === 401 && data?.error === "reauth_required") {
          setGoogleReauthRequired(true);
          setLocationsError("Reconnecte Google.");
          return;
        }
        console.error("google gbp sync error:", data);
        setLocationsError("Impossible de synchroniser les lieux.");
        return;
      }

      if (data?.queued) {
        setLocationsError("Synchronisation planifiée.");
      } else {
        const cooldown = Date.now() + 60_000;
        window.localStorage.setItem(
          "gbp_sync_cooldown_until",
          cooldown.toString()
        );
        setSyncCooldownUntil(cooldown);
      }

      setGoogleReauthRequired(false);
      await fetchLocations(session.user.id);
    } catch (error) {
      console.error(error);
      setLocationsError("Impossible de synchroniser les lieux.");
    } finally {
      setSyncingLocations(false);
    }
  };

  const handleSyncAll = async () => {
    setSyncAllMessage(null);
    if (!supabase || !session) {
      setSyncAllMessage("Connecte-toi puis reconnecte Google.");
      setLastLogStatus("error");
      setLastLogMessage("Session Supabase manquante.");
      return;
    }
    if (!googleConnected) {
      setSyncAllMessage("Connexion Google requise avant la synchronisation.");
      setLastLogStatus("error");
      setLastLogMessage("Connexion Google manquante.");
      return;
    }
    setSyncAllLoading(true);
    setLastLogStatus("running");
    setLastLogMessage("Synchronisation en cours...");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token ?? null;
      if (!jwt) {
        throw new Error("Missing Supabase session token.");
      }
      const response = await fetch("/api/google/gbp/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`
        }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        if (response.status === 401 && data?.error === "reauth_required") {
          setSyncAllMessage("Reconnecte Google.");
          setLastLogStatus("error");
          setLastLogMessage("Reconnexion Google requise.");
          setGoogleReauthRequired(true);
          return;
        }
        throw new Error("Sync failed.");
      }
      if (data?.queued) {
        setSyncAllMessage("Synchronisation planifiée.");
        setLastLogStatus("running");
        setLastLogMessage("Synchronisation en file d'attente...");
      } else {
        setSyncAllMessage(
          `Synchronisation terminée: ${data?.locationsCount ?? 0} lieux.`
        );
        setLastLogStatus("success");
        setLastLogMessage("Synchronisation terminée avec succès.");
      }
      setGoogleReauthRequired(false);
    } catch (error) {
      console.error(error);
      setSyncAllMessage("Erreur de synchronisation.");
      setLastLogStatus("error");
      setLastLogMessage("Echec de la synchronisation.");
    }
    setSyncAllLoading(false);
  };

  const handleSignOut = async () => {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    console.info("Supabase auth: signed out");
  };

  const handleDebugSession = async () => {
    if (!supabase) {
      setDebugError("Configuration Supabase manquante.");
      return;
    }
    setDebugError(null);
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      setDebugInfo(null);
      setDebugError("Session introuvable.");
      return;
    }
    const accessToken = data.session.access_token ?? null;
    setDebugInfo({
      userId: data.session.user?.id ?? null,
      expiresAt: data.session.expires_at ?? null,
      accessToken,
      googleConnected: Boolean(googleConnected)
    });
  };

  const handleCopyAccessToken = async () => {
    if (!debugInfo?.accessToken) {
      return;
    }
    try {
      await navigator.clipboard.writeText(debugInfo.accessToken);
      setLastLogStatus("info");
      setLastLogMessage("Access token copié dans le presse-papiers.");
    } catch (error) {
      console.error(error);
      setLastLogStatus("error");
      setLastLogMessage("Impossible de copier le token.");
    }
  };

  const authPanel = (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Bienvenue sur EGIA</CardTitle>
          <p className="text-sm text-slate-500">
            Connectez-vous pour acceder au tableau de bord.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {authError && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
              {authError}
            </div>
          )}
          {authMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {authMessage}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              type="email"
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              placeholder="vous@entreprise.com"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 outline-none focus:border-ink/60 focus:ring-2 focus:ring-ink/10"
            />
          </div>
          <Button onClick={handleSignIn} disabled={envMissing}>
            Recevoir le lien de connexion
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-sand">
      <div className="flex">
        <Sidebar />
        <div className="flex min-h-screen flex-1 flex-col">
          <Topbar
            title={pageMeta.title}
            subtitle={pageMeta.subtitle}
            userEmail={session?.user.email}
            session={session}
            onSignOut={session ? handleSignOut : undefined}
            onDebugSession={session ? handleDebugSession : undefined}
            onToggleMenu={() => setMobileMenuOpen((prev) => !prev)}
            isMenuOpen={mobileMenuOpen}
          />

          <main className="flex-1 space-y-6 bg-gradient-to-br from-sand via-white to-clay px-4 py-6 md:px-6 md:py-8">
            {envMissing && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                Variables d&apos;env Supabase manquantes. Ajoutez
                VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local.
              </div>
            )}
            {googleError && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                {googleError}
              </div>
            )}
            {(debugInfo || debugError) && (
              <Card>
                <CardHeader>
                  <CardTitle>Debug session</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-slate-600">
                  {debugError && <p>{debugError}</p>}
                  {debugInfo && (
                    <>
                      <p>
                        <span className="font-semibold text-slate-700">
                          expires_at:
                        </span>{" "}
                        {debugExpiresAtLabel}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-700">
                          user.id:
                        </span>{" "}
                        {debugInfo.userId ?? "—"}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-700">
                          google_connection:
                        </span>{" "}
                        {debugInfo.googleConnected ? "connected" : "missing"}
                      </p>
                      {import.meta.env.DEV && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCopyAccessToken}
                        >
                          Copier access_token (dev)
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {!session && !isCallbackPath ? (
              authPanel
            ) : (
              <Routes>
                <Route
                  path="/"
                  element={
                    <Dashboard
                      session={session}
                      googleConnected={googleConnected}
                      onConnect={handleConnectGoogle}
                      onSyncLocations={handleSyncLocations}
                      syncDisabled={googleReauthRequired}
                      locations={locations}
                      locationsLoading={locationsLoading}
                      locationsError={locationsError}
                      syncing={syncingLocations}
                    />
                  }
                />
                <Route
                  path="/analytics"
                  element={
                    <Analytics
                      session={session}
                      locations={locations}
                      locationsLoading={locationsLoading}
                      locationsError={locationsError}
                    />
                  }
                />
                <Route
                  path="/connect"
                  element={
                    <Connect
                      onConnect={handleConnectGoogle}
                      onSync={handleSyncAll}
                      syncDisabled={googleReauthRequired}
                      syncLoading={syncAllLoading}
                      syncMessage={syncAllMessage}
                      lastLogStatus={lastLogStatus}
                      lastLogMessage={lastLogMessage}
                    />
                  }
                />
                <Route path="/inbox" element={<Inbox />} />
                <Route
                  path="/automation"
                  element={
                    <Automation
                      session={session}
                      locations={locations}
                      locationsLoading={locationsLoading}
                      locationsError={locationsError}
                    />
                  }
                />
                <Route
                  path="/automation/builder"
                  element={
                    <AutomationBuilder session={session} locations={locations} />
                  }
                />
                <Route
                  path="/settings/brand-voice"
                  element={<BrandVoice session={session} />}
                />
                <Route
                  path="/settings/test-lab"
                  element={<TestLab session={session} />}
                />
                <Route path="/settings" element={<Settings session={session} />} />
                <Route path="/invite" element={<Invite session={session} />} />
                <Route path="/alerts" element={<Alerts session={session} />} />
                <Route
                  path="/competitors"
                  element={<Competitors session={session} />}
                />
                <Route
                  path="/reports"
                  element={<Reports session={session} locations={locations} />}
                />
                <Route
                  path="/team"
                  element={<TeamRanking session={session} />}
                />
                <Route
                  path="/sync-status"
                  element={<SyncStatus session={session} />}
                />
                <Route
                  path="/ai-job-health"
                  element={<AIJobHealth session={session} />}
                />
                <Route
                  path="/google_oauth_callback"
                  element={<OAuthCallback />}
                />
                <Route path="/auth/callback" element={<AuthCallback />} />
              </Routes>
            )}
          </main>
        </div>
      </div>
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Fermer le menu"
          />
          <div className="absolute left-0 top-0 h-full">
            <Sidebar
              variant="mobile"
              className="h-full"
              onNavigate={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
