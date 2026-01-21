import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

type AutomationProps = {
  session: Session | null;
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
  }>;
  locationsLoading: boolean;
  locationsError: string | null;
};

type AutomationType =
  | "rating_drop"
  | "negative_review"
  | "volume_drop"
  | "weekly_summary";

type AutomationFrequency = "daily" | "weekly";

type AutomationScope = {
  mode: "all" | "location";
  locationId: string | null;
};

type AutomationParams =
  | { threshold: number }
  | { maxStars: number; unresolvedHours: number }
  | { minReviews: number; windowDays: number }
  | { placeholder: true };

type AutomationConfig = {
  id: string;
  type: AutomationType;
  name: string;
  enabled: boolean;
  scope: AutomationScope;
  frequency: AutomationFrequency;
  channel: { inApp: true; email: boolean };
  params: AutomationParams;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "egia:automations:v1";
const ALERTS_STORAGE_KEY = "egia:alerts:v1";

const automationLabels: Record<AutomationType, string> = {
  rating_drop: "Alerte baisse de note",
  negative_review: "Alerte avis negatif",
  volume_drop: "Alerte volume",
  weekly_summary: "Resume hebdo"
};

const templates = [
  {
    id: "vip",
    title: "Fidelisation VIP",
    description:
      "Generer une reponse enthousiaste et taguer les avis 5 etoiles.",
    type: "rating_drop" as AutomationType,
    params: { threshold: 5 }
  },
  {
    id: "social",
    title: "Social Booster 5★",
    description: "Publier automatiquement les meilleurs avis.",
    type: "rating_drop" as AutomationType,
    params: { threshold: 4.8 }
  },
  {
    id: "recovery",
    title: "Recuperation Client",
    description: "Alerte immediate pour avis negatif (win-back).",
    type: "negative_review" as AutomationType,
    params: { maxStars: 2, unresolvedHours: 24 }
  },
  {
    id: "autopilot",
    title: "Pilote Automatique",
    description: "Responder automatiquement aux avis positifs.",
    type: "weekly_summary" as AutomationType,
    params: { placeholder: true }
  }
];

const defaultParamsByType = (type: AutomationType): AutomationParams => {
  switch (type) {
    case "rating_drop":
      return { threshold: 4.6 };
    case "negative_review":
      return { maxStars: 2, unresolvedHours: 48 };
    case "volume_drop":
      return { minReviews: 3, windowDays: 7 };
    case "weekly_summary":
      return { placeholder: true };
    default:
      return { placeholder: true };
  }
};

const buildAutomation = (type: AutomationType): AutomationConfig => {
  const now = new Date().toISOString();
  return {
    id: `auto_${Date.now()}`,
    type,
    name: "",
    enabled: true,
    scope: { mode: "all", locationId: null },
    frequency: "daily",
    channel: { inApp: true, email: false },
    params: defaultParamsByType(type),
    createdAt: now,
    updatedAt: now
  };
};

const getDisplayName = (automation: AutomationConfig) => {
  const trimmed = automation.name.trim();
  if (trimmed) return trimmed;
  return automationLabels[automation.type] ?? "Nouvelle automatisation";
};

const formatScope = (scope: AutomationScope, locations: AutomationProps["locations"]) => {
  if (scope.mode === "all") return "Tous les etablissements";
  if (!scope.locationId) return "Etablissement non defini";
  const match = locations.find((loc) => loc.id === scope.locationId);
  return match?.location_title ?? match?.location_resource_name ?? "Etablissement";
};

const Automation = ({ locations, locationsLoading, locationsError }: AutomationProps) => {
  const [automations, setAutomations] = useState<AutomationConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AutomationConfig | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as AutomationConfig[];
      if (Array.isArray(parsed)) {
        setAutomations(parsed);
        setSelectedId(parsed[0]?.id ?? null);
      }
    } catch {
      setAutomations([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(automations));
  }, [automations]);

  const selected = useMemo(
    () => {
      if (draft && draft.id === selectedId) return draft;
      return automations.find((item) => item.id === selectedId) ?? null;
    },
    [automations, selectedId, draft]
  );

  const updateDraft = (id: string, patch: Partial<AutomationConfig>) => {
    setDraft((prev) => {
      if (!prev || prev.id !== id) return prev;
      return { ...prev, ...patch, updatedAt: new Date().toISOString() };
    });
    setDraftDirty(true);
  };

  const updateParams = (id: string, params: AutomationParams) => {
    updateDraft(id, { params });
  };

  const handleCreate = () => {
    const next = buildAutomation("rating_drop");
    setDraft(next);
    setDraftDirty(false);
    setSelectedId(next.id);
  };

  const handleCreateFromTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    const next = buildAutomation(template.type);
    const name = template.title;
    setDraft({
      ...next,
      name,
      params: template.params as AutomationParams
    });
    setDraftDirty(true);
    setSelectedId(next.id);
  };

  const handleSelect = (id: string) => {
    const existing = automations.find((item) => item.id === id);
    setSelectedId(id);
    setDraft(existing ? { ...existing } : null);
    setDraftDirty(false);
  };

  const handleSave = () => {
    if (!draft) return;
    const next = {
      ...draft,
      name: draft.name.trim(),
      updatedAt: new Date().toISOString()
    };
    setAutomations((prev) => {
      const exists = prev.some((item) => item.id === next.id);
      if (exists) {
        return prev.map((item) => (item.id === next.id ? next : item));
      }
      return [next, ...prev];
    });
    setDraft(next);
    setDraftDirty(false);
  };

  const handleCancel = () => {
    if (!draft) return;
    const existing = automations.find((item) => item.id === draft.id);
    if (existing) {
      setDraft({ ...existing });
      setDraftDirty(false);
      return;
    }
    setDraft(null);
    setDraftDirty(false);
    setSelectedId(automations[0]?.id ?? null);
  };

  const handleDelete = (id: string) => {
    setAutomations((prev) => prev.filter((item) => item.id !== id));
    if (selectedId === id) {
      setSelectedId(automations.find((item) => item.id !== id)?.id ?? null);
      setDraft(null);
      setDraftDirty(false);
    }
  };

  const persistMockAlert = (alert: Record<string, unknown>) => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(ALERTS_STORAGE_KEY);
    const parsed = stored ? (JSON.parse(stored) as Record<string, unknown>[]) : [];
    const next = [alert, ...(Array.isArray(parsed) ? parsed : [])].slice(0, 20);
    window.localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("egia:alerts:updated"));
  };

  const handleTestAutomation = () => {
    if (!draft || !draft.enabled || draftDirty) return;
    const locationName = formatScope(draft.scope, locations);
    const automationName = getDisplayName(draft);
    const message =
      draft.type === "rating_drop"
        ? `Note sous ${(draft.params as { threshold: number }).threshold} pour ${locationName}.`
        : draft.type === "negative_review"
          ? `Avis ≤ ${(draft.params as { maxStars: number }).maxStars}★ sans réponse (${(draft.params as { unresolvedHours: number }).unresolvedHours}h).`
          : draft.type === "volume_drop"
            ? `Moins de ${(draft.params as { minReviews: number }).minReviews} avis sur ${(draft.params as { windowDays: number }).windowDays} jours.`
            : "Résumé hebdomadaire prêt à consulter.";
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      automation_id: draft.id,
      title: automationName,
      message,
      severity:
        draft.type === "negative_review"
          ? "critical"
          : draft.type === "weekly_summary"
            ? "info"
            : "warn",
      created_at: new Date().toISOString(),
      location_name: locationName,
      location_id: draft.scope.locationId ?? null
    };
    persistMockAlert(alert);
    setTestFeedback("Alerte de test envoyee.");
    setTimeout(() => setTestFeedback(null), 1500);
  };

  const handleTestFromList = (automation: AutomationConfig) => {
    if (!automation.enabled || (draftDirty && automation.id === selectedId)) return;
    const locationName = formatScope(automation.scope, locations);
    const automationName = getDisplayName(automation);
    const message =
      automation.type === "rating_drop"
        ? `Note sous ${(automation.params as { threshold: number }).threshold} pour ${locationName}.`
        : automation.type === "negative_review"
          ? `Avis ≤ ${(automation.params as { maxStars: number }).maxStars}★ sans réponse (${(automation.params as { unresolvedHours: number }).unresolvedHours}h).`
          : automation.type === "volume_drop"
            ? `Moins de ${(automation.params as { minReviews: number }).minReviews} avis sur ${(automation.params as { windowDays: number }).windowDays} jours.`
            : "Résumé hebdomadaire prêt à consulter.";
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      automation_id: automation.id,
      title: automationName,
      message,
      severity:
        automation.type === "negative_review"
          ? "critical"
          : automation.type === "weekly_summary"
            ? "info"
            : "warn",
      created_at: new Date().toISOString(),
      location_name: locationName,
      location_id: automation.scope.locationId ?? null
    };
    persistMockAlert(alert);
    setTestFeedback("Alerte de test envoyee.");
    setTimeout(() => setTestFeedback(null), 1500);
  };

  const toggleEnabled = (automation: AutomationConfig, checked: boolean) => {
    if (draft && automation.id === draft.id) {
      updateDraft(automation.id, { enabled: checked });
      return;
    }
    setAutomations((prev) =>
      prev.map((item) =>
        item.id === automation.id ? { ...item, enabled: checked } : item
      )
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold text-slate-900">Automatisation</h2>
            <Badge variant="neutral">PRO</Badge>
          </div>
          <p className="text-sm text-slate-500">
            Configurez le pilote automatique pour votre e-reputation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => selected && handleTestAutomation()}
            disabled={!selected || !selected.enabled || draftDirty}
            title={
              draftDirty ? "Enregistre d'abord avant de tester" : "Actionner l'auto maintenant"
            }
          >
            Actionner l'auto maintenant
          </Button>
          <Button onClick={handleCreate}>Creer manuellement</Button>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Modeles prets a l'emploi</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => handleCreateFromTemplate(template.id)}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  ✦
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-900">
                  {template.title}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {template.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-700">Vos scenarios actifs</h3>
          {automations.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              <p className="font-semibold text-slate-700">
                Aucune automatisation active
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Creez votre premiere regle pour declencher des alertes utiles.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {automations.map((item) => (
                <Card key={item.id} className="border border-indigo-200">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="success">Pilote automatique</Badge>
                      <CardTitle className="text-base">{getDisplayName(item)}</CardTitle>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-emerald-600">
                        {item.enabled ? "ON" : "OFF"}
                      </span>
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={(event) => toggleEnabled(item, event.target.checked)}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Badge variant="neutral">Source</Badge>
                      <Badge variant="neutral">{automationLabels[item.type]}</Badge>
                      <Badge variant="neutral">
                        {item.frequency === "daily" ? "Quotidien" : "Hebdo"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestFromList(item)}
                        disabled={!item.enabled || (draftDirty && selectedId === item.id)}
                        title={
                          draftDirty && selectedId === item.id
                            ? "Enregistre d'abord avant de tester"
                            : "Actionner l'auto maintenant"
                        }
                      >
                        Actionner l'auto maintenant
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSelect(item.id)}
                      >
                        Configurer
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(item.id)}
                      >
                        Supprimer
                      </Button>
                      {testFeedback && (
                        <span className="text-xs font-semibold text-emerald-600">
                          {testFeedback}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <Card>
            <CardHeader className="sticky top-4 z-10 rounded-t-2xl border-b border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  Modifier le workflow
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleCancel}>
                    Annuler
                  </Button>
                  <Button onClick={handleSave} disabled={!draftDirty}>
                    Enregistrer
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {!selected ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  Selectionnez une automatisation pour la configurer.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-800">
                    {getDisplayName(selected)}
                  </div>
                  {draftDirty && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      Modifications non enregistrees.
                    </div>
                  )}
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      Declencheur
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <label className="text-xs font-semibold text-slate-600">
                        Nom du workflow
                        <input
                          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          value={selected.name}
                          onChange={(event) =>
                            updateDraft(selected.id, { name: event.target.value })
                          }
                          placeholder="Nouvelle automatisation"
                        />
                      </label>
                      <label className="text-xs font-semibold text-slate-600">
                        Quand...
                        <select
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          value={selected.type}
                          onChange={(event) => {
                            const nextType = event.target.value as AutomationType;
                            updateDraft(selected.id, {
                              type: nextType,
                              params: defaultParamsByType(nextType)
                            });
                          }}
                        >
                          <option value="rating_drop">Alerte baisse de note</option>
                          <option value="negative_review">Alerte avis negatif</option>
                          <option value="volume_drop">Alerte volume</option>
                          <option value="weekly_summary">Resume hebdo</option>
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-800">
                        Conditions (si)
                      </div>
                      <Button variant="outline" size="sm" disabled>
                        + Ajouter
                      </Button>
                    </div>
                    <div className="mt-4 space-y-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-xs font-semibold text-slate-600">
                          Frequence
                          <select
                            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            value={selected.frequency}
                            onChange={(event) =>
                              updateDraft(selected.id, {
                                frequency: event.target.value as AutomationFrequency
                              })
                            }
                          >
                            <option value="daily">Quotidien</option>
                            <option value="weekly">Hebdomadaire</option>
                          </select>
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Portee
                          <select
                            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            value={selected.scope.mode}
                            onChange={(event) =>
                              updateDraft(selected.id, {
                                scope: {
                                  mode: event.target.value as AutomationScope["mode"],
                                  locationId:
                                    event.target.value === "all"
                                      ? null
                                      : selected.scope.locationId
                                }
                              })
                            }
                          >
                            <option value="all">Tous les etablissements</option>
                            <option value="location">Etablissement selectionne</option>
                          </select>
                        </label>
                      </div>

                      {selected.scope.mode === "location" && (
                        <label className="text-xs font-semibold text-slate-600">
                          Etablissement
                          <select
                            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            value={selected.scope.locationId ?? ""}
                            onChange={(event) =>
                              updateDraft(selected.id, {
                                scope: {
                                  mode: "location",
                                  locationId: event.target.value || null
                                }
                              })
                            }
                          >
                            <option value="">Selectionner...</option>
                            {locations.map((location) => (
                              <option key={location.id} value={location.id}>
                                {location.location_title ?? location.location_resource_name}
                              </option>
                            ))}
                          </select>
                          {locationsLoading && (
                            <p className="mt-1 text-[11px] text-slate-400">
                              Chargement des etablissements...
                            </p>
                          )}
                          {locationsError && (
                            <p className="mt-1 text-[11px] text-rose-500">
                              {locationsError}
                            </p>
                          )}
                        </label>
                      )}

                      {selected.type === "rating_drop" && (
                        <label className="text-xs font-semibold text-slate-600">
                          Alerte si note passe sous
                          <input
                            type="number"
                            step="0.1"
                            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            value={
                              (selected.params as { threshold: number }).threshold ?? 4.6
                            }
                            onChange={(event) =>
                              updateParams(selected.id, {
                                threshold: Number(event.target.value)
                              })
                            }
                          />
                        </label>
                      )}

                      {selected.type === "negative_review" && (
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="text-xs font-semibold text-slate-600">
                            Note max
                            <input
                              type="number"
                              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                              value={
                                (selected.params as { maxStars: number }).maxStars ?? 2
                              }
                              onChange={(event) =>
                                updateParams(selected.id, {
                                  maxStars: Number(event.target.value),
                                  unresolvedHours: (selected.params as {
                                    unresolvedHours: number;
                                  }).unresolvedHours
                                })
                              }
                            />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">
                            Sans reponse depuis (h)
                            <input
                              type="number"
                              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                              value={
                                (selected.params as { unresolvedHours: number })
                                  .unresolvedHours ?? 48
                              }
                              onChange={(event) =>
                                updateParams(selected.id, {
                                  maxStars: (selected.params as { maxStars: number }).maxStars,
                                  unresolvedHours: Number(event.target.value)
                                })
                              }
                            />
                          </label>
                        </div>
                      )}

                      {selected.type === "volume_drop" && (
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="text-xs font-semibold text-slate-600">
                            Moins de
                            <input
                              type="number"
                              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                              value={
                                (selected.params as { minReviews: number }).minReviews ??
                                3
                              }
                              onChange={(event) =>
                                updateParams(selected.id, {
                                  minReviews: Number(event.target.value),
                                  windowDays: (selected.params as {
                                    windowDays: number;
                                  }).windowDays
                                })
                              }
                            />
                          </label>
                          <label className="text-xs font-semibold text-slate-600">
                            Sur (jours)
                            <input
                              type="number"
                              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                              value={
                                (selected.params as { windowDays: number }).windowDays ??
                                7
                              }
                              onChange={(event) =>
                                updateParams(selected.id, {
                                  minReviews: (selected.params as { minReviews: number })
                                    .minReviews,
                                  windowDays: Number(event.target.value)
                                })
                              }
                            />
                          </label>
                        </div>
                      )}

                      {selected.type === "weekly_summary" && (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                          Resume hebdomadaire en preparation (configuration bientot).
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-800">
                        Actions (alors)
                      </div>
                      <Button variant="outline" size="sm" disabled>
                        + Ajouter
                      </Button>
                    </div>
                    <div className="mt-4 space-y-3">
                      <label className="text-xs font-semibold text-slate-600">
                        Canal
                        <div className="mt-2 space-y-2 text-xs text-slate-500">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked readOnly />
                            In-app (obligatoire)
                          </label>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={selected.channel.email} disabled />
                            Email (bientot)
                          </label>
                        </div>
                      </label>
                      <label className="text-xs font-semibold text-slate-600">
                        Actif
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                          <input
                            type="checkbox"
                            checked={selected.enabled}
                            onChange={(event) =>
                              updateDraft(selected.id, {
                                enabled: event.target.checked
                              })
                            }
                          />
                          {selected.enabled ? "Active" : "Inactive"}
                        </div>
                      </label>
                    </div>
                  </div>

                  {selected.type === "rating_drop" && (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleSave} disabled={!draftDirty}>
                      Enregistrer
                    </Button>
                    <Button variant="outline" onClick={handleCancel}>
                      Annuler
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleTestAutomation}
                      disabled={!selected.enabled || draftDirty}
                      title={
                        draftDirty
                          ? "Enregistre d'abord avant de tester"
                          : selected.enabled
                            ? "Generer une alerte de test"
                            : "Activez l'automatisation pour tester"
                      }
                    >
                      Tester cette automatisation
                    </Button>
                    {testFeedback && (
                      <span className="text-xs font-semibold text-emerald-600">
                        {testFeedback}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export { Automation };

// Manual test plan:
// 1) Nouvelle automatisation -> nom vide, modifications non enregistrees visibles.
// 2) Editer, puis Annuler -> retour au dernier etat sauvegarde.
// 3) Enregistrer -> persistence localStorage (egia:automations:v1).
// 4) Tester cette automatisation -> ajoute une alerte mock (egia:alerts:v1).
// 5) Tester desactive tant que modifications non enregistrees.
