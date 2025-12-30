import { useEffect, useState } from "react";
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

type NotificationKind = "review" | "sync" | "connection";

type NotificationSeverity = "critical" | "high" | "medium" | "low" | "info";

type NotificationStatus = "read" | "unread";

type AppNotificationBase = {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  severity: NotificationSeverity;
  createdAt: string; // ISO
  rating?: number | null;
  locationId?: string | null;
};

type AppNotification = AppNotificationBase & {
  status: NotificationStatus;
};

const mockNotifications: AppNotificationBase[] = [
  {
    id: "n1",
    kind: "review",
    title: "Alerte avis négatif critique",
    message: "Service très décevant, je ne reviendrai pas.",
    rating: 1,
    severity: "critical",
    createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString()
  },
  {
    id: "n2",
    kind: "review",
    title: "Nouveau 5★",
    message: "Super accueil, je recommande !",
    rating: 5,
    severity: "low",
    createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString()
  },
  {
    id: "n3",
    kind: "sync",
    title: "Synchronisation terminée",
    message: "5 lieux synchronisés avec succès.",
    severity: "info",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "n4",
    kind: "review",
    title: "Avis à traiter",
    message: "Temps d'attente un peu long aujourd'hui.",
    rating: 3,
    severity: "medium",
    createdAt: new Date(Date.now() - 52 * 60 * 1000).toISOString()
  },
  {
    id: "n5",
    kind: "connection",
    title: "Connexion Google établie",
    message: "Votre compte Business Profile est maintenant connecté.",
    severity: "info",
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
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

const STORAGE_KEY_READ_NOTIFICATIONS = "egia_read_notifications";

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

  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(
    () => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY_READ_NOTIFICATIONS);
        if (stored) {
          const parsed = JSON.parse(stored) as string[];
          return new Set(parsed);
        }
      } catch {
        return new Set<string>();
      }
      return new Set<string>();
    }
  );

  useEffect(() => {
    try {
      const idsArray = Array.from(readNotificationIds);
      window.localStorage.setItem(
        STORAGE_KEY_READ_NOTIFICATIONS,
        JSON.stringify(idsArray)
      );
    } catch {
      // Ignore storage errors
    }
  }, [readNotificationIds]);

  const notificationsWithStatus: AppNotification[] = mockNotifications.map((notif) => ({
    ...notif,
    status: readNotificationIds.has(notif.id) ? ("read" as const) : ("unread" as const)
  }));

  const unreadCount = notificationsWithStatus.filter(
    (n) => n.status === "unread"
  ).length;

  const sortedNotifications = notificationsWithStatus
    .slice()
    .sort((a, b) => {
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

      <section>
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
                            {formatRelativeTime(event.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-slate-900">Notifications</h2>
            {unreadCount > 0 && (
              <Badge variant="success">
                {unreadCount} nouveau{unreadCount > 1 ? "x" : ""}
              </Badge>
            )}
          </div>

          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500">
                Avis & alertes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sortedNotifications.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune notification</p>
              ) : (
                <div className="space-y-4">
                  {sortedNotifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => markAsRead(notif.id)}
                      className="flex cursor-pointer items-start gap-3 border-b border-slate-100 pb-4 transition-colors hover:bg-slate-50 last:border-b-0 last:pb-0"
                    >
                      <div className="mt-0.5">
                        {getNotificationIcon(notif.kind, notif.severity)}
                      </div>

                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">
                            {notif.title || "Notification"}
                          </p>
                          {notif.status === "unread" && (
                            <span className="mt-0.5 inline-flex h-2 w-2 rounded-full bg-amber-500" />
                          )}
                        </div>

                        <p className="mt-1 text-sm text-slate-600">
                          {notif.message || "—"}
                        </p>

                        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                          <span>
                            {notif.rating ? `${notif.rating}★` : "—"}
                          </span>
                          <span>{formatRelativeTime(notif.createdAt)}</span>
                        </div>
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
