export type NotificationKind = "review" | "sync" | "connection";

export type NotificationSeverity = "critical" | "high" | "medium" | "low" | "info";

export type NotificationStatus = "read" | "unread";

export type AppNotificationBase = {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  severity: NotificationSeverity;
  createdAt: string; // ISO
  rating?: number | null;
  locationId?: string | null;
};

export type AppNotification = AppNotificationBase & {
  status: NotificationStatus;
};

export const STORAGE_KEY_READ_NOTIFICATIONS = "egia_read_notifications";

export const NOTIFICATIONS_UPDATED_EVENT = "notifications-updated";

export const mockNotifications: AppNotificationBase[] = [
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

export const getReadNotificationIds = (): Set<string> => {
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
};

export const getUnreadNotificationCount = (
  notifications: AppNotificationBase[] = mockNotifications
): number => {
  try {
    const readIds = getReadNotificationIds();
    return notifications.filter((notif) => !readIds.has(notif.id)).length;
  } catch {
    return notifications.length;
  }
};

export const dispatchNotificationsUpdated = (): void => {
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_UPDATED_EVENT));
};

