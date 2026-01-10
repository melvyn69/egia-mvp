import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { supabase } from "../lib/supabase";

type BrandVoiceProps = {
  session: Session | null;
};

type BrandVoiceForm = {
  enabled: boolean;
  tone: "professional" | "friendly" | "warm" | "formal";
  language_level: "tutoiement" | "vouvoiement";
  context: string;
  use_emojis: boolean;
  forbidden_words: string[];
};

type LocationOption = {
  id: string;
  location_title: string | null;
  location_resource_name: string;
};

const defaultForm: BrandVoiceForm = {
  enabled: true,
  tone: "professional",
  language_level: "vouvoiement",
  context: "",
  use_emojis: false,
  forbidden_words: []
};

const BrandVoice = ({ session }: BrandVoiceProps) => {
  const supabaseClient = supabase;
  const [form, setForm] = useState<BrandVoiceForm>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newWord, setNewWord] = useState("");
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [usingGlobalFallback, setUsingGlobalFallback] = useState(false);

  const canSave = Boolean(session?.user?.id);

  useEffect(() => {
    if (!supabaseClient || !session) {
      return;
    }
    let cancelled = false;
    const loadLocations = async () => {
      const { data, error } = await supabaseClient
        .from("google_locations")
        .select("id, location_title, location_resource_name")
        .eq("user_id", session.user.id)
        .order("location_title", { ascending: true });
      if (cancelled) {
        return;
      }
      if (error) {
        console.error("google_locations fetch error:", error);
      }
      setLocations((data ?? []) as LocationOption[]);
    };
    void loadLocations();
    return () => {
      cancelled = true;
    };
  }, [session, supabaseClient]);

  useEffect(() => {
    if (!supabaseClient || !session) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setUsingGlobalFallback(false);
      let data: BrandVoiceForm | null = null;
      if (selectedLocationId) {
        const { data: specific, error } = await supabaseClient
          .from("brand_voice")
          .select(
            "enabled, tone, language_level, context, use_emojis, forbidden_words, location_id"
          )
          .eq("user_id", session.user.id)
          .eq("location_id", selectedLocationId)
          .maybeSingle();
        if (error) {
          console.error("brand_voice fetch error:", error);
          setError("Impossible de charger la configuration.");
        }
        if (specific) {
          data = {
            enabled: Boolean(specific.enabled),
            tone: specific.tone ?? "professional",
            language_level: specific.language_level ?? "vouvoiement",
            context: specific.context ?? "",
            use_emojis: Boolean(specific.use_emojis),
            forbidden_words: Array.isArray(specific.forbidden_words)
              ? specific.forbidden_words.filter(Boolean)
              : []
          };
        }
      }
      if (!data) {
        const { data: globalRow, error } = await supabaseClient
          .from("brand_voice")
          .select(
            "enabled, tone, language_level, context, use_emojis, forbidden_words, location_id"
          )
          .eq("user_id", session.user.id)
          .is("location_id", null)
          .maybeSingle();
        if (error) {
          console.error("brand_voice fetch error:", error);
          setError("Impossible de charger la configuration.");
        }
        if (globalRow) {
          data = {
            enabled: Boolean(globalRow.enabled),
            tone: globalRow.tone ?? "professional",
            language_level: globalRow.language_level ?? "vouvoiement",
            context: globalRow.context ?? "",
            use_emojis: Boolean(globalRow.use_emojis),
            forbidden_words: Array.isArray(globalRow.forbidden_words)
              ? globalRow.forbidden_words.filter(Boolean)
              : []
          };
          if (selectedLocationId) {
            setUsingGlobalFallback(true);
          }
        }
      }
      if (cancelled) {
        return;
      }
      if (data) {
        setForm(data);
      } else {
        setForm(defaultForm);
      }
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [session, supabaseClient, selectedLocationId]);

  const words = useMemo(
    () => form.forbidden_words.filter(Boolean),
    [form.forbidden_words]
  );

  const addWord = () => {
    const value = newWord.trim();
    if (!value) {
      return;
    }
    if (words.includes(value)) {
      setNewWord("");
      return;
    }
    setForm((prev) => ({
      ...prev,
      forbidden_words: [...prev.forbidden_words, value]
    }));
    setNewWord("");
  };

  const removeWord = (word: string) => {
    setForm((prev) => ({
      ...prev,
      forbidden_words: prev.forbidden_words.filter((item) => item !== word)
    }));
  };

  const handleSave = async () => {
    if (!supabaseClient || !session) {
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    const payload = {
      user_id: session.user.id,
      location_id: selectedLocationId,
      enabled: form.enabled,
      tone: form.tone,
      language_level: form.language_level,
      context: form.context.trim() || null,
      use_emojis: form.use_emojis,
      forbidden_words: form.forbidden_words.filter(Boolean)
    };
    const conflictTarget = selectedLocationId
      ? "user_id,location_id"
      : "user_id";
    const { data, error } = await supabaseClient
      .from("brand_voice")
      .upsert(
        {
          ...payload,
          updated_at: new Date().toISOString()
        },
        { onConflict: conflictTarget }
      )
      .select()
      .single();
    if (error || !data) {
      console.error("brand_voice save error:", error);
      setError("Impossible de sauvegarder.");
    } else {
      setSuccess("Enregistre.");
    }
    setSaving(false);
  };

  if (!supabaseClient) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            Brand Voice
          </h2>
          <p className="text-sm text-slate-500">
            Configuration de la voix de marque.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            Configuration Supabase manquante.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Brand Voice</h2>
        <p className="text-sm text-slate-500">
          Uniformisez le ton des réponses IA.
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Appliquer a</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  value={selectedLocationId ?? ""}
                  onChange={(event) => {
                    setSelectedLocationId(event.target.value || null);
                    setSuccess(null);
                    setError(null);
                  }}
                >
                  <option value="">Tous les etablissements</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.location_title || location.location_resource_name}
                    </option>
                  ))}
                </select>
                {usingGlobalFallback && selectedLocationId && (
                  <Badge variant="neutral">Regle globale</Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activation</CardTitle>
            </CardHeader>
            <CardContent>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      enabled: event.target.checked
                    }))
                  }
                />
                Activer la voix de marque
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ton</CardTitle>
            </CardHeader>
            <CardContent>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                value={form.tone}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    tone: event.target.value as BrandVoiceForm["tone"]
                  }))
                }
              >
                <option value="professional">Professionnel</option>
                <option value="friendly">Amical</option>
                <option value="warm">Chaleureux</option>
                <option value="formal">Formel</option>
              </select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Niveau de langue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={form.language_level === "tutoiement" ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      language_level: "tutoiement"
                    }))
                  }
                >
                  Tutoiement
                </Button>
                <Button
                  variant={form.language_level === "vouvoiement" ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      language_level: "vouvoiement"
                    }))
                  }
                >
                  Vouvoiement
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contexte</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                className="min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                value={form.context}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    context: event.target.value
                  }))
                }
                placeholder="Ex: Toujours remercier pour la visite, mentionner notre equipe."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Emojis</CardTitle>
            </CardHeader>
            <CardContent>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.use_emojis}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      use_emojis: event.target.checked
                    }))
                  }
                />
                Autoriser les emojis
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mots a eviter</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <input
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  value={newWord}
                  onChange={(event) => setNewWord(event.target.value)}
                  placeholder="Ajouter un mot"
                />
                <Button variant="outline" onClick={addWord}>
                  Ajouter
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {words.length > 0 ? (
                  words.map((word) => (
                    <Badge
                      key={word}
                      variant="neutral"
                      className="flex items-center gap-2"
                    >
                      {word}
                      <button
                        type="button"
                        onClick={() => removeWord(word)}
                        className="text-xs text-slate-500"
                      >
                        ×
                      </button>
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">Aucun</span>
                )}
              </div>
            </CardContent>
          </Card>

          {(error || success) && (
            <Card>
              <CardContent className="pt-6 text-sm">
                {error && <span className="text-amber-700">{error}</span>}
                {success && <span className="text-emerald-700">{success}</span>}
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving ? "Sauvegarde..." : "Enregistrer"}
            </Button>
            {!canSave && (
              <span className="text-xs text-slate-500">
                Connectez-vous pour sauvegarder.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export { BrandVoice };
