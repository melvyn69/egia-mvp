import { useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { supabase } from "../lib/supabase";
import type { Database } from "../database.types";

type ReportsProps = {
  session: Session | null;
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
  }>;
};

type ReportRow = Database["public"]["Tables"]["reports"]["Row"];

type Preset =
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "last_month"
  | "last_year"
  | "this_year"
  | "all_time"
  | "custom";

type RenderMode = "classic" | "premium";

const Reports = ({ session, locations }: ReportsProps) => {
  const supabaseClient = supabase;
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [preset, setPreset] = useState<Preset>("last_30_days");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [renderMode, setRenderMode] = useState<RenderMode>("premium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reportsQuery = useQuery({
    queryKey: ["reports", session?.user?.id ?? null],
    queryFn: async () => {
      if (!supabaseClient || !session?.user?.id) {
        return [] as ReportRow[];
      }
      const { data, error: queryError } = await supabaseClient
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (queryError) {
        throw queryError;
      }
      return (data ?? []) as ReportRow[];
    },
    enabled: Boolean(supabaseClient) && Boolean(session?.user?.id)
  });

  const locationOptions = useMemo(
    () =>
      locations.map((location) => ({
        id: location.location_resource_name,
        label: location.location_title ?? location.location_resource_name
      })),
    [locations]
  );

  const resetForm = () => {
    setName("");
    setNotes("");
    setPreset("last_30_days");
    setFrom("");
    setTo("");
    setSelectedLocations([]);
    setRenderMode("premium");
    setEditingId(null);
  };

  const handleEdit = (report: ReportRow) => {
    setEditingId(report.id);
    setName(report.name ?? "");
    setNotes(report.notes ?? "");
    setPreset((report.period_preset as Preset) ?? "last_30_days");
    setFrom(report.from_date ? report.from_date.slice(0, 10) : "");
    setTo(report.to_date ? report.to_date.slice(0, 10) : "");
    setSelectedLocations(report.locations ?? []);
    setRenderMode(
      report.render_mode === "classic" ? "classic" : "premium"
    );
  };

  const handleSave = async () => {
    if (!supabaseClient || !session?.user?.id) {
      setError("Connectez-vous pour enregistrer.");
      return;
    }
    if (!name.trim()) {
      setError("Ajoutez un nom de rapport.");
      return;
    }
    if (selectedLocations.length === 0) {
      setError("Sélectionnez au moins un établissement.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      id: editingId ?? undefined,
      user_id: session.user.id,
      name: name.trim(),
      locations: selectedLocations,
      period_preset: preset,
      from_date: preset === "custom" && from ? new Date(from).toISOString() : null,
      to_date: preset === "custom" && to ? new Date(to).toISOString() : null,
      status: "draft",
      render_mode: renderMode,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString()
    };
    const { error: saveError } = await supabaseClient
      .from("reports")
      .upsert(payload)
      .select()
      .single();
    if (saveError) {
      setError("Impossible de sauvegarder le rapport.");
    } else {
      resetForm();
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    }
    setSaving(false);
  };

  const handleGenerate = async (report: ReportRow) => {
    if (!session?.access_token) {
      setError("Connectez-vous pour générer.");
      return;
    }
    setError(null);
    const mode = report.render_mode === "classic" ? "classic" : "premium";
    const endpoint =
      mode === "premium" ? "/api/reports/generate_html" : "/api/reports/generate";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ report_id: report.id })
    });
    if (!res.ok) {
      setError("Impossible de générer le PDF.");
      return;
    }
    if (mode === "premium") {
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; pdf?: { url?: string | null } }
        | null;
      const signedUrl = data?.pdf?.url ?? null;
      if (signedUrl) {
        window.open(signedUrl, "_blank", "noopener");
      }
    }
    void queryClient.invalidateQueries({ queryKey: ["reports"] });
  };

  const handleDownload = async (report: ReportRow) => {
    if (!supabaseClient || !report.storage_path) {
      return;
    }
    const { data, error: urlError } = await supabaseClient.storage
      .from("reports")
      .createSignedUrl(report.storage_path, 60);
    if (urlError || !data?.signedUrl) {
      setError("Impossible de télécharger le PDF.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const handleDelete = async (report: ReportRow) => {
    if (!supabaseClient) {
      return;
    }
    const { error: deleteError } = await supabaseClient
      .from("reports")
      .delete()
      .eq("id", report.id);
    if (deleteError) {
      setError("Impossible de supprimer le rapport.");
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["reports"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Rapports</h2>
        <p className="text-sm text-slate-500">
          Génération de rapports PDF pour vos établissements.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Modifier un rapport" : "Créer un rapport"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Nom du rapport
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Rapport mensuel"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Établissements
            </label>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {locationOptions.map((location) => (
                <label
                  key={location.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"
                >
                  <input
                    type="checkbox"
                    checked={selectedLocations.includes(location.id)}
                    onChange={(event) => {
                      setSelectedLocations((prev) =>
                        event.target.checked
                          ? [...prev, location.id]
                          : prev.filter((id) => id !== location.id)
                      );
                    }}
                  />
                  {location.label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-500">Période</label>
              <select
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                value={preset}
                onChange={(event) => setPreset(event.target.value as Preset)}
              >
                <option value="last_7_days">7 derniers jours</option>
                <option value="last_30_days">30 derniers jours</option>
                <option value="this_month">Ce mois</option>
                <option value="last_month">Mois précédent</option>
                <option value="last_year">Année dernière</option>
                <option value="this_year">Cette année</option>
                <option value="all_time">Depuis toujours</option>
                <option value="custom">Personnalisé</option>
              </select>
            </div>
          </div>
          {preset === "custom" && (
            <div className="grid gap-2 md:grid-cols-2">
              <input
                type="date"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
              <input
                type="date"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-500">Notes</label>
            <textarea
              className="mt-2 min-h-[100px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Notes internes à inclure dans le rapport."
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Template PDF
            </label>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="render_mode"
                  value="classic"
                  checked={renderMode === "classic"}
                  onChange={() => setRenderMode("classic")}
                />
                Classique
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="render_mode"
                  value="premium"
                  checked={renderMode === "premium"}
                  onChange={() => setRenderMode("premium")}
                />
                Premium
              </label>
            </div>
          </div>
          {error && <p className="text-sm text-amber-700">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={resetForm}>
                Annuler
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rapports existants</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {reportsQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : reportsQuery.data && reportsQuery.data.length > 0 ? (
            reportsQuery.data.map((report) => (
              <div
                key={report.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-3 text-sm"
              >
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900">{report.name}</p>
                  <p className="text-xs text-slate-500">
                    {report.period_preset ?? "—"} · {report.locations.length} lieux
                  </p>
                  {report.last_generated_at && (
                    <p className="text-xs text-slate-500">
                      Généré le {report.last_generated_at.slice(0, 10)}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="neutral">{report.status}</Badge>
                  <Button variant="outline" size="sm" onClick={() => handleEdit(report)}>
                    Éditer
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleGenerate(report)}>
                    Générer
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!report.storage_path}
                    onClick={() => handleDownload(report)}
                  >
                    Télécharger
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(report)}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">Aucun rapport pour le moment.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export { Reports };
