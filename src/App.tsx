import { useEffect, useMemo, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseAnonKey, supabaseUrl } from "./lib/supabase";
import { startGoogleConnection } from "./lib/googleAuth";
import { Sidebar } from "./components/layout/Sidebar";
import { MobileBottomNav } from "./components/layout/MobileBottomNav";
import { Topbar } from "./components/layout/Topbar";
import { Dashboard } from "./pages/Dashboard";
import { Coach } from "./pages/Coach";
import { Inbox } from "./pages/Inbox";
import { Connect } from "./pages/Connect";
import { Analytics } from "./pages/Analytics";
import { Billing } from "./pages/Billing";
import { BrandVoice } from "./pages/BrandVoice";
import { Progress } from "./pages/Progress";
import { Loyalty } from "./pages/Loyalty";
import { LoyaltyScanner } from "./pages/LoyaltyScanner";
import { LoyaltyJoin } from "./pages/LoyaltyJoin";
import { Onboarding } from "./pages/Onboarding";
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
import { OfflineBanner } from "./components/pwa/OfflineBanner";
import { useGoogleConnectionStatus } from "./hooks/useGoogleConnectionStatus";
import { isAdminUser } from "./lib/admin";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { EgiaLogo } from "./components/brand/EgiaLogo";
import { MobileRouteProgress } from "./components/routing/MobileRouteProgress";
import { ScrollToTop } from "./components/routing/ScrollToTop";
import {
  getFriendlyMobileError,
  isBenignBrowserError
} from "./lib/browserErrors";

type OnboardingLocationProgress = {
  locationId: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string | null;
  inserted?: number;
  updated?: number;
  skipped?: number;
};

type SyncFailureRow = {
  location_resource_name: string | null;
  message: string;
};

type SyncTarget = {
  locationId: string;
  label: string;
};

const App = () => {
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [passwordSignInLoading, setPasswordSignInLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [syncAllLoading, setSyncAllLoading] = useState(false);
  const [syncAllMessage, setSyncAllMessage] = useState<string | null>(null);
  const [retryFailedLoading, setRetryFailedLoading] = useState(false);
  const [lastLogStatus, setLastLogStatus] = useState<string | null>(null);
  const [lastLogMessage, setLastLogMessage] = useState<string | null>(null);
  const [onboardingProgress, setOnboardingProgress] = useState<
    OnboardingLocationProgress[]
  >([]);
  const [importFailures, setImportFailures] = useState<SyncFailureRow[]>([]);
  const [errorToast, setErrorToast] = useState<string | null>(null);
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
  const isPublicLoyaltyPath = location.pathname.startsWith("/loyalty/join/");
  const usesAppShell = !isPublicLoyaltyPath;
  const isAdminSession = isAdminUser(session?.user.email);
  const passwordLoginEnabled =
    import.meta.env.VITE_ENABLE_PASSWORD_LOGIN === "true";
  const googleConnection = useGoogleConnectionStatus(session);
  const googleConnected = googleConnection.status === "connected";
  const googleReauthRequired = googleConnection.status === "reauth_required";

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

    if (location.pathname === "/coach") {
      return {
        title: "Coach EGIA",
        subtitle: "Score réputation, priorités et prochaines actions."
      };
    }

    if (location.pathname === "/analytics") {
      return {
        title: "Analytics",
        subtitle: "Tendances, répartition et thèmes clients."
      };
    }

    if (location.pathname === "/billing") {
      return {
        title: "Abonnement & Facturation",
        subtitle: "Gérez votre offre et vos factures en toute transparence."
      };
    }

    if (location.pathname === "/progress") {
      return {
        title: "Progression",
        subtitle: "Trophées, niveaux et montée en puissance business."
      };
    }

    if (location.pathname === "/loyalty/scanner") {
      return {
        title: "Scanner fidélité",
        subtitle: "Enregistrer une visite et mettre à jour les points."
      };
    }

    if (location.pathname === "/loyalty") {
      return {
        title: "Fidélité",
        subtitle: "Programme simple, membres, visites et récompenses."
      };
    }

    if (location.pathname === "/onboarding") {
      return {
        title: "Bienvenue dans EGIA",
        subtitle: "Construisons votre système réputation."
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
        title: "Voix de marque",
        subtitle: "Uniformiser le ton des réponses IA."
      };
    }
    if (location.pathname === "/settings/test-lab") {
      return {
        title: "Laboratoire de test",
        subtitle: "Simulation de réponse IA sans écriture."
      };
    }

    if (location.pathname === "/reports") {
      return {
        title: "Rapports",
        subtitle: "PDF et synthèses pour vos établissements."
      };
    }

    if (location.pathname === "/team") {
      return {
        title: "Équipe",
        subtitle: "Classement, rôles et suivi des membres."
      };
    }

    if (location.pathname === "/alerts") {
      return {
        title: "Alertes intelligentes",
        subtitle: "Signaux prioritaires et suivi des actions."
      };
    }

    if (location.pathname === "/competitors") {
      return {
        title: "Veille concurrentielle",
        subtitle: "Benchmark local, concurrents et opportunités."
      };
    }

    if (location.pathname === "/settings") {
      return {
        title: "Paramètres",
        subtitle: "Profil, entreprise, équipe et préférences."
      };
    }

    if (location.pathname === "/invite") {
      return {
        title: "Invitation",
        subtitle: "Finalisation de l'accès équipe."
      };
    }

    if (location.pathname === "/sync-status") {
      return {
        title: "Statut de synchronisation",
        subtitle: "Suivi des synchronisations Google et erreurs."
      };
    }

    if (location.pathname === "/ai-job-health") {
      return {
        title: "Santé des jobs IA",
        subtitle: "État des jobs IA, files et traitements."
      };
    }

    return {
      title: "Dashboard",
      subtitle: "Suivi des avis, KPIs et activité en temps réel."
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

  // user_profiles is now created via DB trigger; no client writes.

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      const error = event.error ?? event.message;
      if (isBenignBrowserError(error)) {
        if (import.meta.env.DEV) {
          console.info("[browser-error] ignored benign error", error);
        }
        event.preventDefault();
        return;
      }
      const message = getFriendlyMobileError(
        error,
        "Une action a échoué. Réessayez après chargement des données."
      );
      if (!message) {
        event.preventDefault();
        return;
      }
      setErrorToast(message);
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isBenignBrowserError(event.reason)) {
        if (import.meta.env.DEV) {
          console.info("[browser-error] ignored benign rejection", event.reason);
        }
        event.preventDefault();
        return;
      }
      const message = getFriendlyMobileError(
        event.reason,
        "Une action a échoué. Réessayez après chargement des données."
      );
      if (!message) {
        event.preventDefault();
        return;
      }
      setErrorToast(message);
    };
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    if (!errorToast) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setErrorToast(null);
    }, 6000);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [errorToast]);

  const showErrorToast = (message: string) => {
    setErrorToast(message);
  };

  const getApiErrorMessage = (payload: unknown, fallback: string) => {
    if (!payload || typeof payload !== "object") {
      return fallback;
    }
    const candidate = payload as {
      error?: string | { message?: string };
      message?: string;
    };
    if (typeof candidate.error === "string") {
      return candidate.error;
    }
    if (
      candidate.error &&
      typeof candidate.error === "object" &&
      typeof candidate.error.message === "string"
    ) {
      return candidate.error.message;
    }
    if (typeof candidate.message === "string") {
      return candidate.message;
    }
    return fallback;
  };

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

    setAuthMessage("Lien de connexion envoyé. Vérifiez votre boîte mail.");
  };

  const handlePasswordSignIn = async () => {
    setAuthError(null);
    setAuthMessage(null);

    if (!supabase || envMissing) {
      setAuthError(
        "Auth Supabase non configurée. Vérifiez les variables d'environnement."
      );
      return;
    }

    if (!authEmail.trim()) {
      setAuthError("Email requis.");
      return;
    }
    if (!authPassword) {
      setAuthError("Mot de passe requis.");
      return;
    }

    setPasswordSignInLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail.trim(),
      password: authPassword
    });
    setPasswordSignInLoading(false);

    if (!error) {
      setAuthPassword("");
      return;
    }

    const lowerMessage = error.message.toLowerCase();
    if (
      lowerMessage.includes("invalid login credentials") ||
      lowerMessage.includes("invalid credentials")
    ) {
      setAuthError("Mot de passe incorrect ou email inconnu.");
      return;
    }
    if (lowerMessage.includes("email not confirmed")) {
      setAuthError(
        "Email non confirmé. Confirmez l'email Supabase avant de vous connecter."
      );
      return;
    }

    setAuthError(error.message || "Connexion admin impossible.");
  };

  const handleConnectGoogle = async () => {
    setGoogleError(null);

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
          : "Impossible de démarrer la connexion Google.";
      setGoogleError(message);
      showErrorToast(message);
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
      const message = `Reessaie dans ${secondsLeft} secondes avant une nouvelle synchronisation.`;
      setLocationsError(message);
      showErrorToast(message);
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
        const apiMessage = getApiErrorMessage(
          data,
          "Impossible de synchroniser les lieux."
        );
        if (response.status === 401 && apiMessage === "reauth_required") {
          setLocationsError("Reconnectez Google.");
          showErrorToast("Reconnectez Google.");
          void googleConnection.refresh();
          return;
        }
        console.error("google gbp sync error:", data);
        setLocationsError(apiMessage);
        showErrorToast(apiMessage);
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

      void googleConnection.refresh();
      await fetchLocations(session.user.id);
    } catch (error) {
      console.error(error);
      const message = "Impossible de synchroniser les lieux.";
      setLocationsError(message);
      showErrorToast(message);
    } finally {
      setSyncingLocations(false);
    }
  };

  const runReviewSyncForLocations = async (
    jwt: string,
    targets: Array<{ locationId: string; label: string }>
  ) => {
    let done = 0;
    let failed = 0;

    for (const target of targets) {
      setOnboardingProgress((prev) =>
        prev.map((row) =>
          row.locationId === target.locationId
            ? { ...row, status: "running", detail: "Sync avis en cours..." }
            : row
        )
      );

      try {
        const response = await fetch("/api/google/gbp/reviews/sync", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${jwt}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ location_id: target.locationId })
        });
        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.ok) {
          const message = getApiErrorMessage(
            data,
            "Echec de synchronisation des avis."
          );
          failed += 1;
          setOnboardingProgress((prev) =>
            prev.map((row) =>
              row.locationId === target.locationId
                ? {
                    ...row,
                    status: "error",
                    detail: message,
                    inserted: 0,
                    updated: 0,
                    skipped: 0
                  }
                : row
            )
          );
          continue;
        }

        const runResult = Array.isArray(data?.locationResults)
          ? data.locationResults.find(
              (item: { location_id?: string }) =>
                item.location_id === target.locationId
            ) ?? data.locationResults[0]
          : null;
        const hasError =
          runResult?.status === "error" || Number(data?.locationsFailed ?? 0) > 0;

        if (hasError) {
          failed += 1;
          const message =
            typeof runResult?.error === "string"
              ? runResult.error
              : "Echec de synchronisation des avis.";
          setOnboardingProgress((prev) =>
            prev.map((row) =>
              row.locationId === target.locationId
                ? {
                    ...row,
                    status: "error",
                    detail: message,
                    inserted: Number(runResult?.inserted ?? 0),
                    updated: Number(runResult?.updated ?? 0),
                    skipped: Number(runResult?.skipped ?? 0)
                  }
                : row
            )
          );
          continue;
        }

        done += 1;
        const pages = Number(runResult?.pages ?? 0);
        setOnboardingProgress((prev) =>
          prev.map((row) =>
            row.locationId === target.locationId
              ? {
                  ...row,
                  status: "done",
                  detail: `Pages synchronisees: ${pages}`,
                  inserted: Number(runResult?.inserted ?? data?.inserted ?? 0),
                  updated: Number(runResult?.updated ?? data?.updated ?? 0),
                  skipped: Number(runResult?.skipped ?? data?.skipped ?? 0)
                }
              : row
          )
        );
      } catch (error) {
        const message = getApiErrorMessage(
          error,
          "Erreur reseau pendant la synchronisation."
        );
        failed += 1;
        setOnboardingProgress((prev) =>
          prev.map((row) =>
            row.locationId === target.locationId
              ? {
                  ...row,
                  status: "error",
                  detail: message,
                  inserted: 0,
                  updated: 0,
                  skipped: 0
                }
              : row
          )
        );
      }
    }

    return { done, failed };
  };

  const handleSyncAll = async () => {
    setSyncAllMessage(null);
    setImportFailures([]);
    setOnboardingProgress([]);

    if (!supabase || !session) {
      const message = "Connectez-vous puis reconnectez Google.";
      setSyncAllMessage(message);
      setLastLogStatus("error");
      setLastLogMessage("Session Supabase manquante.");
      showErrorToast(message);
      return;
    }
    if (googleConnection.status === "reauth_required") {
      const message = "Reconnectez Google avant la synchronisation.";
      setSyncAllMessage(message);
      setLastLogStatus("error");
      setLastLogMessage("Reconnexion Google requise.");
      showErrorToast(message);
      return;
    }
    if (!googleConnected) {
      const message = "Connexion Google requise avant la synchronisation.";
      setSyncAllMessage(message);
      setLastLogStatus("error");
      setLastLogMessage("Connexion Google manquante.");
      showErrorToast(message);
      return;
    }

    setSyncAllLoading(true);
    setLastLogStatus("running");
    setLastLogMessage("Import des établissements...");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token ?? null;
      if (!jwt) {
        throw new Error("Session Supabase manquante.");
      }

      const importResponse = await fetch("/api/google/gbp/sync?sync_now=1", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ sync_now: true })
      });
      const importData = await importResponse.json().catch(() => null);

      if (!importResponse.ok || !importData?.ok) {
        const message = getApiErrorMessage(importData, "Import des lieux impossible.");
        if (importResponse.status === 401 && message === "reauth_required") {
          setSyncAllMessage("Reconnectez Google.");
          setLastLogStatus("error");
          setLastLogMessage("Reconnexion Google requise.");
          showErrorToast("Reconnectez Google.");
          void googleConnection.refresh();
          return;
        }
        throw new Error(message);
      }

      const failures = Array.isArray(importData?.failures)
        ? (importData.failures as SyncFailureRow[])
        : [];
      setImportFailures(failures);

      const listResponse = await fetch("/api/google/gbp/sync", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwt}`
        }
      });
      const listData = await listResponse.json().catch(() => null);
      if (!listResponse.ok || !listData?.ok) {
        throw new Error(
          getApiErrorMessage(listData, "Impossible de charger les établissements.")
        );
      }

      const targets: SyncTarget[] = Array.isArray(listData?.locations)
        ? listData.locations.map(
            (item: { location_resource_name: string; location_title?: string | null }) => ({
              locationId: item.location_resource_name,
              label: item.location_title ?? item.location_resource_name
            })
          )
        : [];

      if (targets.length === 0) {
        setSyncAllMessage("Aucun établissement à synchroniser.");
        setLastLogStatus(failures.length > 0 ? "error" : "success");
        setLastLogMessage(
          failures.length > 0
            ? "Import partiel terminé avec erreurs."
            : "Import terminé."
        );
        return;
      }

      setOnboardingProgress(
        targets.map((target) => ({
          locationId: target.locationId,
          label: target.label,
          status: "pending",
          detail: "En attente..."
        }))
      );

      setLastLogMessage("Synchronisation des avis par établissement...");
      const result = await runReviewSyncForLocations(jwt, targets);
      await fetchLocations(session.user.id);

      const summary =
        `Synchronisation terminée : ${result.done}/${targets.length} OK` +
        (result.failed > 0 ? `, ${result.failed} en erreur.` : ".");
      setSyncAllMessage(summary);
      setLastLogStatus(result.failed > 0 || failures.length > 0 ? "error" : "success");
      setLastLogMessage(summary);
      if (result.failed > 0 || failures.length > 0) {
        showErrorToast("Certaines synchronisations ont échoué.");
      }
      void googleConnection.refresh();
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : "Erreur de synchronisation.";
      setSyncAllMessage(message);
      setLastLogStatus("error");
      setLastLogMessage(message);
      showErrorToast(message);
    } finally {
      setSyncAllLoading(false);
    }
  };

  const handleRetryFailed = async () => {
    if (!supabase || !session) {
      const message = "Session Supabase manquante.";
      setSyncAllMessage(message);
      showErrorToast(message);
      return;
    }

    const failedTargets = onboardingProgress
      .filter((item) => item.status === "error")
      .map((item) => ({ locationId: item.locationId, label: item.label }));

    if (failedTargets.length === 0) {
      setSyncAllMessage("Aucun établissement en échec à relancer.");
      return;
    }

    setRetryFailedLoading(true);
    setLastLogStatus("running");
    setLastLogMessage("Relance des établissements en échec...");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData.session?.access_token ?? null;
      if (!jwt) {
        throw new Error("Session Supabase manquante.");
      }
      const result = await runReviewSyncForLocations(jwt, failedTargets);
      const summary =
        `Relance terminée : ${result.done}/${failedTargets.length} OK` +
        (result.failed > 0 ? `, ${result.failed} en erreur.` : ".");
      setSyncAllMessage(summary);
      setLastLogStatus(result.failed > 0 ? "error" : "success");
      setLastLogMessage(summary);
      if (result.failed > 0) {
        showErrorToast("Des établissements restent en erreur.");
      }
      void googleConnection.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Relance impossible.";
      setSyncAllMessage(message);
      setLastLogStatus("error");
      setLastLogMessage(message);
      showErrorToast(message);
    } finally {
      setRetryFailedLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    console.info("Supabase auth: signed out");
  };

  const handleDebugSession = () => {
    if (!session) {
      showErrorToast("Aucune session active.");
      return;
    }
    console.info("[debug_session]", {
      user_id: session.user.id,
      email: session.user.email ?? null,
      google_status: googleConnection.status,
      google_reason: googleConnection.reason,
      google_expires_at: googleConnection.expiresAt ?? null,
      google_last_error: googleConnection.lastError ?? null,
      google_last_checked_at: googleConnection.lastCheckedAt ?? null
    });
    showErrorToast("Diagnostic de session journalisé dans la console.");
  };

  const authPanel = (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <div className="mb-2 flex items-center gap-3">
            <EgiaLogo variant="icon" size="md" />
            <EgiaLogo variant="light" size="md" showSuite />
          </div>
          <CardTitle>Bienvenue sur EGIA</CardTitle>
          <p className="text-sm text-slate-500">
            Connectez-vous pour accéder au tableau de bord.
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
          {passwordLoginEnabled && (
            <div className="space-y-3 border-t border-slate-200 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Mot de passe admin
                </label>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="Mot de passe"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 outline-none focus:border-ink/60 focus:ring-2 focus:ring-ink/10"
                />
              </div>
              <Button
                variant="outline"
                onClick={handlePasswordSignIn}
                disabled={envMissing || passwordSignInLoading}
              >
                {passwordSignInLoading
                  ? "Connexion..."
                  : "Connexion admin"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-sand">
      <ScrollToTop />
      <MobileRouteProgress />
      <div className={usesAppShell ? "flex" : ""}>
        {session && usesAppShell && <Sidebar showAdminLinks={isAdminSession} />}
        <div
          className={
            usesAppShell
              ? "flex min-h-screen min-w-0 flex-1 flex-col"
              : "min-h-screen flex-1"
          }
        >
          {usesAppShell && (
            <Topbar
              title={pageMeta.title}
              subtitle={pageMeta.subtitle}
              userEmail={session?.user.email}
              session={session}
              onSignOut={session ? handleSignOut : undefined}
              onDebugSession={isAdminSession ? handleDebugSession : undefined}
              onToggleMenu={
                session ? () => setMobileMenuOpen((prev) => !prev) : undefined
              }
              isMenuOpen={mobileMenuOpen}
            />
          )}

          <main
            data-route-scroll-container
            className={
              usesAppShell
                ? "min-w-0 flex-1 space-y-4 overflow-x-hidden bg-gradient-to-br from-sand via-white to-clay px-3 py-3 pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:px-6 md:py-8 lg:space-y-6 lg:pb-8"
                : "min-h-screen min-w-0 overflow-x-hidden bg-gradient-to-br from-sand via-white to-clay"
            }
          >
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
            {!session && !isCallbackPath && !isPublicLoyaltyPath ? (
              authPanel
            ) : (
              <Routes>
                <Route path="/loyalty/join/:publicToken" element={<LoyaltyJoin />} />
                <Route
                  path="/"
                  element={
                    <Dashboard
                      session={session}
                      googleStatus={googleConnection.status}
                      googleLastError={googleConnection.lastError}
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
                  path="/coach"
                  element={
                    <Coach
                      session={session}
                      googleStatus={googleConnection.status}
                      locations={locations}
                      locationsLoading={locationsLoading}
                      locationsError={locationsError}
                    />
                  }
                />
                <Route
                  path="/billing"
                  element={<Billing isAdmin={isAdminSession} />}
                />
                <Route
                  path="/progress"
                  element={
                    <Progress
                      session={session}
                      googleStatus={googleConnection.status}
                      locations={locations}
                    />
                  }
                />
                <Route
                  path="/loyalty"
                  element={
                    <Loyalty
                      session={session}
                      locations={locations}
                      locationsLoading={locationsLoading}
                      locationsError={locationsError}
                    />
                  }
                />
                <Route
                  path="/loyalty/scanner"
                  element={
                    <LoyaltyScanner
                      session={session}
                      locations={locations}
                      locationsLoading={locationsLoading}
                      locationsError={locationsError}
                    />
                  }
                />
                <Route
                  path="/onboarding"
                  element={
                    <Onboarding
                      googleStatus={googleConnection.status}
                      locations={locations}
                    />
                  }
                />
                <Route
                  path="/connect"
                  element={
                    <Connect
                      onConnect={handleConnectGoogle}
                      onSync={handleSyncAll}
                      onRetryFailed={handleRetryFailed}
                      syncDisabled={googleConnection.status !== "connected"}
                      syncLoading={syncAllLoading}
                      syncMessage={syncAllMessage}
                      lastLogStatus={lastLogStatus}
                      lastLogMessage={lastLogMessage}
                      locationProgress={onboardingProgress}
                      importFailures={importFailures}
                      retryLoading={retryFailedLoading}
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
                  element={
                    <Competitors session={session} isAdmin={isAdminSession} />
                  }
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
      {session && usesAppShell && mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Fermer le menu"
          />
          <div className="absolute left-0 top-0 h-full max-w-full">
            <Sidebar
              variant="mobile"
              className="h-full"
              onNavigate={() => setMobileMenuOpen(false)}
              showAdminLinks={isAdminSession}
            />
          </div>
        </div>
      )}
      {session && usesAppShell && <MobileBottomNav />}
      <OfflineBanner />
      {errorToast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <span>{errorToast}</span>
            <button
              type="button"
              className="font-semibold text-rose-800"
              onClick={() => setErrorToast(null)}
              aria-label="Fermer l'erreur"
            >
              X
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
