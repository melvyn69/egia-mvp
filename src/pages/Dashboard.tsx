import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  MapPin,
  MessageSquare,
  RefreshCw,
  Shield,
  Star
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import {
  type AppNotificationBase,
  type AppNotification,
  type NotificationKind,
  type NotificationSeverity,
  addNotificationDedup,
  clearNotifications,
  getNotifications,
  resolveNotificationAction,
  STORAGE_KEY_READ_NOTIFICATIONS,
  getReadNotificationIds,
  dispatchNotificationsUpdated
} from "../lib/notifications";
import { mockGoogleConnected, mockKpis } from "../mock/mockData";

type DashboardProps = {
  session: Session | null;
  googleConnected: boolean | null;
  onConnect: () => void;
  onSyncLocations: () => void;
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
    address_json: unknown | null;
    phone: string | null;
    website_uri: string | null;
  }>;
  locationsLoading: boolean;
  locationsError: string | null;
  syncing: boolean;
};

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return "Bonjour";
  } else if (hour >= 12 && hour < 18) {
    return "Bon après-midi";
  } else {
    return "Bonsoir";
  }
};

const getFirstName = (session: Session | null): string | null => {
  if (!session?.user) {
    return null;
  }

  const metadata = session.user.user_metadata;
  if (metadata?.first_name) {
    return metadata.first_name;
  }

  if (metadata?.full_name) {
    const parts = metadata.full_name.trim().split(/\s+/);
    if (parts.length > 0) {
      return parts[0];
    }
  }

  if (session.user.email) {
    const emailPart = session.user.email.split("@")[0];
    const parts = emailPart.split(/[._-]/);
    if (parts.length > 0 && parts[0]) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    }
  }

  return null;
};

const formatKpiValue = (value: string | number | undefined | null): string => {
  if (value === undefined || value === null || value === "") {
    return "—";
  }
  const stringValue = String(value);
  if (
    stringValue === "undefined%" ||
    stringValue === "NaN%" ||
    stringValue === "-" ||
    stringValue.trim() === ""
  ) {
    return "—";
  }
  return stringValue;
};

type ActivityEvent = {
  id: string;
  message: string;
  timestamp: Date;
  type: "connection" | "sync" | "review";
};

const mockActivityEvents: ActivityEvent[] = [
  {
    id: "1",
    message: "Connexion Google réussie",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    type: "connection"
  },
  {
    id: "2",
    message: "Synchronisation lancée",
    timestamp: new Date(Date.now() - 45 * 60 * 1000),
    type: "sync"
  },
  {
    id: "3",
    message: "Aucun avis négatif détecté",
    timestamp: new Date(Date.now() - 15 * 60 * 1000),
    type: "review"
  }
];

const getSeverityOrder = (severity: NotificationSeverity): number => {
  const order: Record<NotificationSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4
  };
  return order[severity];
};

const getNotificationIcon = (
  kind: NotificationKind,
  severity: NotificationSeverity
) => {
  if (kind === "review") {
    if (severity === "critical" || severity === "high") {
      return <AlertTriangle size={16} className="text-red-600" />;
    }
    return <MessageSquare size={16} className="text-green-600" />;
  }
  if (kind === "sync") {
    return <RefreshCw size={16} className="text-blue-600" />;
  }
  if (kind === "connection") {
    return <CheckCircle size={16} className="text-green-600" />;
  }
  return <Bell size={16} className="text-slate-500" />;
};

const formatRelativeTime = (isoDate: string): string => {
  const now = new Date();
  const date = new Date(isoDate);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return "Il y a moins d'une minute";
  } else if (diffMins < 60) {
    return `Il y a ${diffMins} minute${diffMins > 1 ? "s" : ""}`;
  } else if (diffHours < 24) {
    return `Il y a ${diffHours} heure${diffHours > 1 ? "s" : ""}`;
  } else {
    return `Il y a ${diffDays} jour${diffDays > 1 ? "s" : ""}`;
  }
};

type NotificationDraft = Omit<AppNotificationBase, "id" | "createdAt" | "message"> & {
  message?: string | null;
};

const createNotification = (
  partial: NotificationDraft,
  opts?: { key?: string; cooldownMs?: number }
): void => {
  const rawMessage = partial.message;
  const normalizedMessage =
    typeof rawMessage === "string" ? rawMessage.trim().toLowerCase() : "";
  const message =
    normalizedMessage === "" ||
    normalizedMessage === "undefined" ||
    normalizedMessage === "null"
      ? "Une erreur est survenue"
      : (rawMessage as string);

  const notification: AppNotificationBase = {
    ...partial,
    message,
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString()
  };

  addNotificationDedup(notification, opts);
};

const Dashboard = ({
  session,
  googleConnected,
  onConnect,
  onSyncLocations,
  locations,
  locationsLoading,
  locationsError,
  syncing
}: DashboardProps) => {
  const connectedStatus = googleConnected ?? mockGoogleConnected;
  const greeting = getGreeting();
  const firstName = getFirstName(session);
  const greetingText = firstName ? `${greeting}, ${firstName}` : `${greeting}`;
  const prevGoogleConnectedRef = useRef<boolean | null>(googleConnected);
  const prevSyncingRef = useRef<boolean>(syncing);
  const prevLocationsErrorRef = useRef<string | null>(locationsError);
  const didMountRef = useRef(false);

  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(
    getReadNotificationIds
  );

  useEffect(() => {
    try {
      const idsArray = Array.from(readNotificationIds);
      window.localStorage.setItem(
        STORAGE_KEY_READ_NOTIFICATIONS,
        JSON.stringify(idsArray)
      );
      dispatchNotificationsUpdated();
    } catch {
      // Ignore storage errors
    }
  }, [readNotificationIds]);

  useEffect(() => {
    const prevGoogleConnected = prevGoogleConnectedRef.current;
    if (!didMountRef.current) {
      didMountRef.current = true;
      prevGoogleConnectedRef.current = googleConnected;
      return;
    }

    if (prevGoogleConnected !== googleConnected) {
      if (prevGoogleConnected !== true && googleConnected === true) {
        createNotification({
          kind: "connection",
          severity: "info",
          title: "Connexion Google établie",
          message: "Votre compte Google Business Profile est connecté."
        });
      } else if (prevGoogleConnected === true && googleConnected !== true) {
        createNotification({
          kind: "connection",
          severity: "high",
          title: "Connexion Google perdue",
          message: "Reconnecte ton compte pour synchroniser."
        });
      }
    }

    prevGoogleConnectedRef.current = googleConnected;
  }, [googleConnected]);

  useEffect(() => {
    const prevSyncing = prevSyncingRef.current;
    if (prevSyncing !== syncing) {
      if (!prevSyncing && syncing) {
        createNotification({
          kind: "sync",
          severity: "info",
          title: "Synchronisation lancée",
          message: "Synchronisation des lieux en cours…"
        });
      } else if (prevSyncing && !syncing) {
        if (locationsError) {
          createNotification({
            kind: "sync",
            severity: "high",
            title: "Erreur de synchronisation",
            message: locationsError
          });
        } else {
          const count = locations.length;
          createNotification({
            kind: "sync",
            severity: "info",
            title: "Synchronisation terminée",
            message: `${count} ${count === 1 ? "lieu disponible" : "lieux disponibles"}.`
          });
        }
      }
    }
    prevSyncingRef.current = syncing;
  }, [syncing, locationsError, locations.length]);

  useEffect(() => {
    const currentError = locationsError?.trim() ?? "";
    const prevError = prevLocationsErrorRef.current?.trim() ?? "";
    if (!syncing && currentError && !prevError) {
      createNotification({
        kind: "sync",
        severity: "high",
        title: "Erreur",
        message: locationsError ?? "Une erreur est survenue"
      });
    }
    prevLocationsErrorRef.current = locationsError;
  }, [locationsError, syncing]);

  const notificationsWithStatus: AppNotification[] = getNotifications().map((notif) => ({
    ...notif,
    status: readNotificationIds.has(notif.id) ? ("read" as const) : ("unread" as const)
  }));

  const unreadCount = notificationsWithStatus.filter(
    (n) => n.status === "unread"
  ).length;
  const urgentActionsCount = notificationsWithStatus.filter(
    (n) => n.requiresAction === true && n.status === "unread"
  ).length;

  const sortedNotifications = notificationsWithStatus
    .slice()
    .sort((a, b) => {
      const aRequiresAction = a.requiresAction === true;
      const bRequiresAction = b.requiresAction === true;
      if (aRequiresAction !== bRequiresAction) {
        return aRequiresAction ? -1 : 1;
      }
      if (a.status !== b.status) {
        return a.status === "unread" ? -1 : 1;
      }
      const severityDiff = getSeverityOrder(a.severity) - getSeverityOrder(b.severity);
      if (severityDiff !== 0) {
        return severityDiff;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const markAsRead = (id: string) => {
    setReadNotificationIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const markAllAsRead = () => {
    setReadNotificationIds(new Set(notificationsWithStatus.map((n) => n.id)));
  };

  const handleReplyToReview = () => {
    alert("Bientôt disponible");
  };

  const handleViewLocation = (locationId?: string | null) => {
    const locationTarget = locationId
      ? document.getElementById(`location-${locationId}`)
      : null;
    const sectionTarget = document.getElementById("locations-section");
    const target = locationTarget ?? sectionTarget;

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const getLocationName = (locationId?: string | null): string => {
    if (!locationId) {
      return "—";
    }

    const location = locations.find((loc) => loc.id === locationId);
    if (!location) {
      return "—";
    }

    return location.location_title ?? location.location_resource_name ?? "—";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">{greetingText}</h2>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {mockKpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500">
                {kpi.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-semibold text-slate-900">
                  {formatKpiValue(kpi.value)}
                </p>
                <p className="text-xs text-slate-500">{formatKpiValue(kpi.caption)}</p>
              </div>
              <Badge variant={kpi.trend === "up" ? "success" : "warning"}>
                {formatKpiValue(kpi.delta)}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Statut Google Business Profile</CardTitle>
            <p className="text-sm text-slate-500">
              Liez vos etablissements pour synchroniser avis, photos et
              messages.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              {googleConnected === null ? (
                <Skeleton className="h-8 w-40" />
              ) : (
                <Badge variant={connectedStatus ? "success" : "warning"}>
                  {connectedStatus ? "Google connecte" : "Connexion requise"}
                </Badge>
              )}
              <p className="text-sm text-slate-600">
                {connectedStatus
                  ? "Synchronisation active."
                  : "Aucune connexion active."}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={onConnect}>
                {connectedStatus ? "Actualiser la connexion" : "Connecter Google"}
              </Button>
              <Button variant="outline">Voir les permissions</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compte actif</CardTitle>
            <p className="text-sm text-slate-500">
              Session Supabase en cours.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Utilisateur
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {session?.user.email ?? "Non connecte"}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <RefreshCw size={14} />
              Derniere verification il y a 2 minutes
            </div>
          </CardContent>
        </Card>
      </section>

      <section id="locations-section">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-slate-900">
            Lieux connectes
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onSyncLocations} disabled={syncing}>
              {syncing ? "Synchronisation..." : "Synchroniser les lieux"}
            </Button>
          </div>
        </div>
        {locationsError && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            {locationsError}
          </div>
        )}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {locationsLoading &&
            Array.from({ length: 2 }).map((_, index) => (
              <Card key={`skeleton-${index}`}>
                <CardContent className="space-y-3 pt-6">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          {!locationsLoading && locations.length === 0 && (
            <Card>
              <CardContent className="space-y-2 pt-6 text-sm text-slate-500">
                <p>Aucun lieu synchronise pour le moment.</p>
                <p>Utilisez le bouton de synchronisation pour charger vos lieux.</p>
              </CardContent>
            </Card>
          )}
          {!locationsLoading &&
            locations.map((location) => (
              <Card key={location.id}>
                <CardContent className="flex items-center justify-between gap-4 pt-6">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {location.location_title ??
                        location.location_resource_name}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                      <MapPin size={14} />
                      {location.phone ?? "Telephone non renseigne"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1 text-sm font-semibold text-slate-900">
                      <Star size={14} className="text-amber-500" />
                      Actif
                    </div>
                    <p className="text-xs text-slate-500">
                      {location.website_uri ?? "Site non renseigne"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Flux d'activité</h2>
          <Card className="mt-4">
            <CardContent className="pt-6">
              {mockActivityEvents.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune activité récente</p>
              ) : (
                <div className="space-y-4">
                  {mockActivityEvents
                    .slice()
                    .sort(
                      (a, b) =>
                        b.timestamp.getTime() - a.timestamp.getTime()
                    )
                    .map((event) => (
                      <div
                        key={event.id}
                        className="flex items-start gap-3 border-b border-slate-100 pb-4 last:border-b-0 last:pb-0"
                      >
                        <div className="mt-0.5">
                          {event.type === "connection" && (
                            <CheckCircle
                              size={16}
                              className="text-green-600"
                            />
                          )}
                          {event.type === "sync" && (
                            <RefreshCw size={16} className="text-blue-600" />
                          )}
                          {event.type === "review" && (
                            <Shield size={16} className="text-amber-600" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">
                            {event.message ?? "Événement"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatRelativeTime(
                              event.timestamp instanceof Date
                                ? event.timestamp.toISOString()
                                : event.timestamp
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div id="notifications-section">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-slate-900">Notifications</h2>
            <div className="flex items-center gap-2">
              {import.meta.env.DEV && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    clearNotifications();
                    setReadNotificationIds(new Set());
                  }}
                >
                  Reset (dev)
                </Button>
              )}
              {unreadCount > 0 && (
                <Badge variant="success">
                  {unreadCount} nouveau{unreadCount > 1 ? "x" : ""}
                </Badge>
              )}
            </div>
          </div>
          {urgentActionsCount > 0 && (
            <p className="mt-2 text-sm font-semibold text-red-700">
              🔴 {urgentActionsCount} action
              {urgentActionsCount > 1 ? "s urgentes" : " urgente"} à traiter
            </p>
          )}
          {urgentActionsCount === 0 && notificationsWithStatus.length > 0 && (
            <p className="mt-2 text-sm font-semibold text-emerald-700">
              ✅ Aucune action urgente pour le moment
            </p>
          )}

          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500">
                Avis & alertes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sortedNotifications.length === 0 ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-700">
                    💤 Aucune notification pour le moment
                  </p>
                  <p className="text-xs text-slate-500">
                    Tout est à jour. Revenez plus tard.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sortedNotifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`flex items-start gap-3 border-b border-slate-100 pb-4 last:border-b-0 last:pb-0 ${
                        notif.requiresAction && notif.severity === "critical"
                          ? "rounded-2xl border border-red-200 bg-red-50 p-3"
                          : ""
                      }`}
                    >
                      <div
                        onClick={() => markAsRead(notif.id)}
                        className="flex flex-1 cursor-pointer items-start gap-3 transition-colors hover:bg-slate-50"
                      >
                        <div className="mt-0.5">
                          {getNotificationIcon(notif.kind, notif.severity)}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">
                                {notif.title || "Notification"}
                              </p>
                              {notif.requiresAction && (
                                <Badge className="border-red-600 bg-red-600 text-white">
                                  Action requise
                                </Badge>
                              )}
                            </div>
                            {notif.status === "unread" && (
                              <span className="mt-0.5 inline-flex h-2 w-2 rounded-full bg-amber-500" />
                            )}
                          </div>

                          <p className="mt-1 text-sm text-slate-600">
                            {notif.message || "—"}
                          </p>

                          {notif.locationId && (
                            <p className="mt-2 text-xs text-slate-500">
                              Lieu : {getLocationName(notif.locationId)}
                            </p>
                          )}

                          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                            <span>
                              {notif.rating ? `${notif.rating}★` : "—"}
                            </span>
                            <span>{formatRelativeTime(notif.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 pt-1">
                        {notif.requiresAction && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(notif.id);
                              resolveNotificationAction(notif.id);
                            }}
                          >
                            Marquer comme traité
                          </Button>
                        )}
                        {notif.kind === "review" && (
                          <Button
                            variant={notif.requiresAction ? "default" : "outline"}
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReplyToReview();
                            }}
                          >
                            Répondre
                          </Button>
                        )}
                        {notif.locationId && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewLocation(notif.locationId);
                            }}
                          >
                            Voir le lieu
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={markAllAsRead}
                  disabled={unreadCount === 0}
                >
                  Tout marquer comme lu
                </Button>
                <Button variant="outline" disabled>
                  Voir tous les avis
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export { Dashboard };
