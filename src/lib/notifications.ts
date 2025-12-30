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
  requiresAction?: boolean;
  rating?: number | null;
  locationId?: string | null;
};

export type AppNotification = AppNotificationBase & {
  status: NotificationStatus;
};

export const STORAGE_KEY_READ_NOTIFICATIONS = "egia_read_notifications";
export const STORAGE_KEY_NOTIFICATIONS = "egia_notifications";
export const STORAGE_KEY_NOTIFICATIONS_DEDUP = "egia_notifications_dedup";

export const NOTIFICATIONS_UPDATED_EVENT = "notifications-updated";

export const deriveReviewMeta = (
  rating: number | null
): {
  severity: NotificationSeverity;
  requiresAction: boolean;
} => {
  if (rating === null) {
    return { severity: "info", requiresAction: false };
  }
  if (rating <= 2) {
    return { severity: "critical", requiresAction: true };
  }
  if (rating === 3) {
    return { severity: "medium", requiresAction: true };
  }
  return { severity: "low", requiresAction: false };
};

export const mockNotifications: AppNotificationBase[] = [
  {
    id: "n1",
    kind: "review",
    title: "Alerte avis négatif critique",
    message: "Service très décevant, je ne reviendrai pas.",
    rating: 1,
    ...deriveReviewMeta(1),
    createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString()
  },
  {
    id: "n2",
    kind: "review",
    title: "Nouveau 5★",
    message: "Super accueil, je recommande !",
    rating: 5,
    ...deriveReviewMeta(5),
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
    ...deriveReviewMeta(3),
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

export const getNotifications = (): AppNotificationBase[] => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY_NOTIFICATIONS);
    if (stored) {
      const parsed = JSON.parse(stored) as AppNotificationBase[];
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // fall through to seed
  }
  const seed = mockNotifications;
  setNotifications(seed);
  return seed;
};

export const setNotifications = (notifications: AppNotificationBase[]): void => {
  const trimmed = notifications.slice(0, 50);
  try {
    window.localStorage.setItem(
      STORAGE_KEY_NOTIFICATIONS,
      JSON.stringify(trimmed)
    );
  } catch {
    return;
  }
  dispatchNotificationsUpdated();
};

export const updateNotification = (
  id: string,
  patch: Partial<AppNotificationBase>
): void => {
  const notifications = getNotifications();
  const index = notifications.findIndex((notif) => notif.id === id);
  if (index === -1) {
    return;
  }
  const updated = notifications.slice();
  updated[index] = { ...notifications[index], ...patch };
  setNotifications(updated);
};

export const resolveNotificationAction = (id: string): void => {
  updateNotification(id, { requiresAction: false });
};

export const addNotificationDedup = (
  notification: AppNotificationBase,
  opts?: { key?: string; cooldownMs?: number }
): void => {
  const dedupKey =
    opts?.key ??
    `${notification.kind}|${notification.severity}|${notification.title}|${notification.message}`;
  const cooldownMs = opts?.cooldownMs ?? 30_000;
  let dedupMap: Record<string, string> = {};

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY_NOTIFICATIONS_DEDUP);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, string>;
      if (parsed && typeof parsed === "object") {
        dedupMap = parsed;
      }
    }
  } catch {
    dedupMap = {};
  }

  const lastTimestampIso = dedupMap[dedupKey];
  const lastTimestamp = lastTimestampIso ? Date.parse(lastTimestampIso) : 0;
  const now = Date.now();
  if (!Number.isNaN(lastTimestamp) && now - lastTimestamp < cooldownMs) {
    return;
  }

  setNotifications([notification, ...getNotifications()]);
  dedupMap[dedupKey] = new Date(now).toISOString();
  try {
    window.localStorage.setItem(
      STORAGE_KEY_NOTIFICATIONS_DEDUP,
      JSON.stringify(dedupMap)
    );
  } catch {
    // ignore storage errors
  }
  dispatchNotificationsUpdated();
};

export const clearNotifications = (): void => {
  try {
    window.localStorage.removeItem(STORAGE_KEY_NOTIFICATIONS);
    window.localStorage.removeItem(STORAGE_KEY_READ_NOTIFICATIONS);
    window.localStorage.removeItem(STORAGE_KEY_NOTIFICATIONS_DEDUP);
  } catch {
    // ignore storage errors
  }
  setNotifications(mockNotifications);
};
