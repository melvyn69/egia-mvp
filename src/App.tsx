import { useEffect, useMemo, useState } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseAnonKey, supabaseUrl } from "./lib/supabase";
import { connectGoogle } from "./lib/googleAuth";
import { Sidebar } from "./components/layout/Sidebar";
import { Topbar } from "./components/layout/Topbar";
import { Dashboard } from "./pages/Dashboard";
import { Inbox } from "./pages/Inbox";
import { Connect } from "./pages/Connect";
import { OAuthCallback } from "./pages/OAuthCallback";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";

const App = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [syncAllLoading, setSyncAllLoading] = useState(false);
  const [syncAllMessage, setSyncAllMessage] = useState<string | null>(null);
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
  const envMissing = !supabaseUrl || !supabaseAnonKey;
  const isCallbackPath = location.pathname === "/google_oauth_callback";

  const pageMeta = useMemo(() => {
    if (isCallbackPath) {
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

    return {
      title: "Dashboard",
      subtitle: "Suivi des avis, KPIs et activite en temps reel."
    };
  }, [isCallbackPath, location.pathname]);

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
    if (isCallbackPath) {
      return;
    }

    const params = new URLSearchParams(location.search);
    if (params.get("connected") === "1") {
      setGoogleConnected(true);
      navigate("/", { replace: true });
    }
  }, [isCallbackPath, location.search, navigate]);


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
      .eq("provider", "google")
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
      .eq("provider", "google")
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

    if (!supabase) {
      const message = "Configuration Supabase manquante.";
      console.error(message);
      setAuthError(message);
      return;
    }

    console.info("Supabase auth: starting Google sign-in");
    const { error } = await connectGoogle(supabase);

    if (error) {
      console.error("Supabase auth sign-in error:", error);
      setAuthError("Impossible de se connecter avec Google.");
    }
  };

  const handleConnectGoogle = async () => {
    setGoogleError(null);

    if (!supabase) {
      setGoogleError("Connexion Supabase requise.");
      return;
    }

    try {
      const { error } = await connectGoogle(supabase);
      if (error) {
        console.error("google oauth error:", error);
        setGoogleError("Impossible de demarrer la connexion Google.");
      }
    } catch (error) {
      console.error("google oauth error:", error);
      setGoogleError("Impossible de demarrer la connexion Google.");
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
      const res = await fetch(
        `${supabaseUrl}/functions/v1/google_gbp_sync_locations`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseAnonKey}`,
            apikey: supabaseAnonKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ jwt: session.access_token })
        }
      );

      const text = await res.text();
      if (!res.ok) {
        console.error("google_gbp_sync_locations error:", res.status, text);
        setLocationsError("Impossible de synchroniser les lieux.");
        return;
      }

      const cooldown = Date.now() + 60_000;
      window.localStorage.setItem(
        "gbp_sync_cooldown_until",
        cooldown.toString()
      );
      setSyncCooldownUntil(cooldown);

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
      return;
    }
    if (!session.provider_token) {
      setSyncAllMessage("Token Google manquant. Reconnecte Google.");
      return;
    }
    setSyncAllLoading(true);
    const { data, error } = await supabase.functions.invoke("google_gbp_sync_all", {
      headers: {
        "X-Google-Token": session.provider_token
      }
    });
    if (error) {
      setSyncAllMessage("Erreur de synchronisation.");
    } else if (data?.ok) {
      setSyncAllMessage(
        `Synchronisation terminée: ${data.locationsCount ?? 0} lieux, ${
          data.reviewsCount ?? 0
        } avis.`
      );
    } else {
      setSyncAllMessage("Erreur de synchronisation.");
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
          <Button onClick={handleSignIn} disabled={envMissing}>
            Se connecter avec Google
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
            onSignOut={session ? handleSignOut : undefined}
          />

          <main className="flex-1 space-y-6 bg-gradient-to-br from-sand via-white to-clay px-6 py-8">
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
                      locations={locations}
                      locationsLoading={locationsLoading}
                      locationsError={locationsError}
                      syncing={syncingLocations}
                    />
                  }
                />
                <Route
                  path="/connect"
                  element={
                    <Connect
                      onConnect={handleConnectGoogle}
                      onSync={handleSyncAll}
                      syncLoading={syncAllLoading}
                      syncMessage={syncAllMessage}
                    />
                  }
                />
                <Route path="/inbox" element={<Inbox />} />
                <Route
                  path="/google_oauth_callback"
                  element={<OAuthCallback />}
                />
              </Routes>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default App;
