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

const automationLabels: Record<AutomationType, string> = {
  rating_drop: "Alerte baisse de note",
  negative_review: "Alerte avis negatif",
  volume_drop: "Alerte volume",
  weekly_summary: "Resume hebdo"
};

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
    name: automationLabels[type],
    enabled: true,
    scope: { mode: "all", locationId: null },
    frequency: "daily",
    channel: { inApp: true, email: false },
    params: defaultParamsByType(type),
    createdAt: now,
    updatedAt: now
  };
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
    () => automations.find((item) => item.id === selectedId) ?? null,
    [automations, selectedId]
  );

  const updateAutomation = (id: string, patch: Partial<AutomationConfig>) => {
    setAutomations((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, ...patch, updatedAt: new Date().toISOString() }
          : item
      )
    );
  };

  const updateParams = (id: string, params: AutomationParams) => {
    updateAutomation(id, { params });
  };

  const handleCreate = () => {
    const next = buildAutomation("rating_drop");
    setAutomations((prev) => [next, ...prev]);
    setSelectedId(next.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Automatisations</h2>
        <p className="text-sm text-slate-500">
          Configurez des alertes utiles et actionnables, sans bruit.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Vos automatisations</CardTitle>
              <Button size="sm" onClick={handleCreate}>
                Nouvelle automatisation
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {automations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  <p className="font-semibold text-slate-700">
                    Aucune automatisation active
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Creez votre premiere regle pour declencher des alertes utiles.
                  </p>
                </div>
              ) : (
                automations.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${
                      selectedId === item.id
                        ? "border-ink bg-ink/5"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-800">{item.name}</p>
                      <Badge variant={item.enabled ? "success" : "neutral"}>
                        {item.enabled ? "Actif" : "Inactif"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {automationLabels[item.type]}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {item.frequency === "daily" ? "Quotidien" : "Hebdo"} · {" "}
                      {formatScope(item.scope, locations)}
                    </p>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Editeur</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selected ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  Selectionnez une automatisation pour la configurer.
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="text-xs font-semibold text-slate-600">
                    Nom
                    <input
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={selected.name}
                      onChange={(event) =>
                        updateAutomation(selected.id, { name: event.target.value })
                      }
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Type
                    <select
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={selected.type}
                      onChange={(event) => {
                        const nextType = event.target.value as AutomationType;
                        updateAutomation(selected.id, {
                          type: nextType,
                          name: automationLabels[nextType],
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

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-semibold text-slate-600">
                      Frequence
                      <select
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        value={selected.frequency}
                        onChange={(event) =>
                          updateAutomation(selected.id, {
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
                          updateAutomation(selected.id, {
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
                          updateAutomation(selected.id, {
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

                  <div className="grid gap-3 md:grid-cols-2">
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
                            updateAutomation(selected.id, {
                              enabled: event.target.checked
                            })
                          }
                        />
                        {selected.enabled ? "Active" : "Inactive"}
                      </div>
                    </label>
                  </div>

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
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export { Automation };
