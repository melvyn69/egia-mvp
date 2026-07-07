import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
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

const panelClass =
  "overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.06)]";

const sectionHeaderClass = "border-b border-slate-100 px-4 py-4 sm:px-6";

const fieldClass =
  "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100";

const BrandVoice = ({ session }: BrandVoiceProps) => {
  const queryClient = useQueryClient();
  const supabaseClient = supabase;
  const [form, setForm] = useState<BrandVoiceForm>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newWord, setNewWord] = useState("");
  const [testInput, setTestInput] = useState("");
  const [testOutput, setTestOutput] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
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
    const { data, error } = await supabaseClient
      .from("brand_voice")
      .upsert(
        {
          ...payload,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id,location_id" }
      )
      .select()
      .single();
    if (error || !data) {
      console.error("brand_voice save error:", error);
      setError("Impossible de sauvegarder.");
    } else {
      setSuccess("Enregistré.");
      void queryClient.invalidateQueries({
        queryKey: ["brand-voice-status", session.user.id]
      });
    }
    setSaving(false);
  };

  const handleTest = async () => {
    if (!supabaseClient || !session?.access_token) {
      setTestError("Connectez-vous pour tester.");
      return;
    }
    const input = testInput.trim();
    if (!input) {
      setTestError("Ajoutez une situation ou un avis.");
      return;
    }
    setTestLoading(true);
    setTestError(null);
    try {
      const response = await fetch("/api/google/reply", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: "test",
          review_text: input,
          rating: null,
          location_id: selectedLocationId,
          allow_identity_override: true,
          brand_voice_override: {
            enabled: form.enabled,
            tone: form.tone,
            language_level: form.language_level,
            context: form.context,
            use_emojis: form.use_emojis,
            forbidden_words: form.forbidden_words
          }
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.reply_text) {
        setTestError("Impossible de générer une réponse pour le moment.");
        return;
      }
      setTestOutput(payload.reply_text);
    } catch {
      setTestError("Erreur lors de la génération.");
    } finally {
      setTestLoading(false);
    }
  };

  if (!supabaseClient) {
    return (
      <div className="space-y-4">
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
    <div className="space-y-4">
      <div className="rounded-[1.35rem] border border-slate-200/80 bg-white px-4 py-4 shadow-sm sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Identité IA</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Définissez la voix de marque et testez vos réponses.
            </p>
          </div>
          <Badge variant={form.enabled ? "success" : "neutral"}>
            {form.enabled ? "Active" : "Inactive"}
          </Badge>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <Card className={panelClass}>
            <CardHeader className={sectionHeaderClass}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base font-semibold sm:text-lg">Appliquer à</CardTitle>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Choisissez une règle globale ou propre à un établissement.
                  </p>
                </div>
                {usingGlobalFallback && selectedLocationId && (
                  <Badge variant="neutral">Règle globale</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 py-4 sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className={fieldClass}
                  value={selectedLocationId ?? ""}
                  onChange={(event) => {
                    setSelectedLocationId(event.target.value || null);
                    setSuccess(null);
                    setError(null);
                  }}
                >
                  <option value="">Tous les établissements</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.location_title || location.location_resource_name}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card className={panelClass}>
            <CardHeader className={sectionHeaderClass}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base font-semibold sm:text-lg">Activer l'identité IA</CardTitle>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Détermine si cette voix doit guider les réponses générées.
                  </p>
                </div>
                <Badge variant={form.enabled ? "success" : "neutral"}>
                  {form.enabled ? "Activée" : "Désactivée"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 py-4 sm:px-6">
              <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-600">
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

          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-4">
              <Card className={panelClass}>
                <CardHeader className={sectionHeaderClass}>
                  <CardTitle className="text-base font-semibold sm:text-lg">Paramètres de voix</CardTitle>
                  <p className="text-sm leading-6 text-slate-500">
                    Ton, langage, contexte et contraintes éditoriales.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4 px-4 py-4 sm:px-6">
                  <div>
                    <label className="text-xs font-semibold text-slate-500">
                      Ton
                    </label>
                    <select
                      className={fieldClass}
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
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">
                      Niveau de langue
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant={
                          form.language_level === "tutoiement"
                            ? "default"
                            : "outline"
                        }
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
                        variant={
                          form.language_level === "vouvoiement"
                            ? "default"
                            : "outline"
                        }
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
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">
                      Contexte établissement
                    </label>
                    <textarea
                      className={`${fieldClass} min-h-[120px]`}
                      value={form.context}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          context: event.target.value
                        }))
                      }
                      placeholder="Ex: Toujours remercier pour la visite, mentionner notre equipe."
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">
                      Emojis
                    </label>
                    <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
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
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">
                      Mots à éviter
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        className="min-w-[180px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                        value={newWord}
                        onChange={(event) => setNewWord(event.target.value)}
                        placeholder="Ajouter un mot"
                      />
                      <Button variant="outline" onClick={addWord}>
                        Ajouter
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
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
                              className="text-xs text-slate-500 hover:text-slate-900"
                              aria-label={`Retirer ${word}`}
                            >
                              ×
                            </button>
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">Aucun</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="space-y-4">
              <Card className={panelClass}>
                <CardHeader className={sectionHeaderClass}>
                  <CardTitle className="text-base font-semibold sm:text-lg">Laboratoire de test</CardTitle>
                  <p className="text-sm leading-6 text-slate-500">
                    Simulez une réponse sans écrire dans Google.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3 px-4 py-4 sm:px-6">
                  <div>
                    <label className="text-xs font-semibold text-slate-500">
                      Situation (avis reçu ou message)
                    </label>
                    <textarea
                      className={`${fieldClass} min-h-[140px]`}
                      value={testInput}
                      onChange={(event) => setTestInput(event.target.value)}
                      placeholder="Collez ici un avis client pour tester la réponse."
                    />
                  </div>
                  <Button
                    onClick={handleTest}
                    disabled={testLoading || !testInput.trim()}
                  >
                    {testLoading ? "Génération..." : "Générer une réponse test"}
                  </Button>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">
                      Réponse de l’IA (simulation)
                    </label>
                    <textarea
                      className={`${fieldClass} min-h-[140px] bg-slate-50`}
                      value={testOutput}
                      readOnly
                      placeholder="La réponse s'affichera ici."
                    />
                  </div>
                  {testError && (
                    <span className="text-sm text-amber-700">{testError}</span>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {(error || success) && (
            <Card className={panelClass}>
              <CardContent className="pt-6 text-sm">
                {error && <span className="text-amber-700">{error}</span>}
                {success && <span className="text-emerald-700">{success}</span>}
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving ? "Enregistrement..." : "Enregistrer"}
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
