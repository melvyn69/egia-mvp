import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { supabase } from "../lib/supabase";

type SettingsEntrepriseProps = {
  session: Session | null;
};

type LegalEntity = {
  id?: string;
  business_id?: string;
  is_default?: boolean;
  company_name?: string;
  legal_name?: string | null;
  industry?: string | null;
  siret?: string | null;
  vat_number?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_postal_code?: string | null;
  billing_city?: string | null;
  billing_region?: string | null;
  billing_country?: string | null;
  logo_path?: string | null;
  logo_url?: string | null;
  created_at?: string | null;
};

const emptyEntity = (): LegalEntity => ({
  company_name: "",
  legal_name: "",
  industry: "",
  siret: "",
  vat_number: "",
  billing_email: "",
  billing_phone: "",
  billing_address_line1: "",
  billing_address_line2: "",
  billing_postal_code: "",
  billing_city: "",
  billing_region: "",
  billing_country: "FR",
  logo_path: null,
  logo_url: null,
  is_default: false
});

const SettingsEntreprise = ({ session }: SettingsEntrepriseProps) => {
  const queryClient = useQueryClient();
  const accessToken = session?.access_token ?? null;
  const [selectedId, setSelectedId] = useState<string>("new");
  const [formState, setFormState] = useState<LegalEntity>(emptyEntity());
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  const entitiesQuery = useQuery({
    queryKey: ["legal-entities", session?.user?.id],
    queryFn: async () => {
      if (!accessToken) return [] as LegalEntity[];
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action: "legal_entities_list" })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to load legal entities");
      }
      const payload = (await response.json()) as { data?: LegalEntity[] };
      return payload.data ?? [];
    },
    enabled: Boolean(accessToken)
  });

  const entities = entitiesQuery.data ?? [];
  const selectedEntity = useMemo(() => {
    if (selectedId === "new") {
      return formState;
    }
    return entities.find((entity) => entity.id === selectedId) ?? formState;
  }, [entities, formState, selectedId]);

  useEffect(() => {
    if (selectedId === "new") {
      setFormState((prev) => (prev.id ? emptyEntity() : prev));
      return;
    }
    const entity = entities.find((item) => item.id === selectedId);
    if (entity) {
      setFormState({ ...entity });
    }
  }, [entities, selectedId]);

  useEffect(() => {
    if (entities.length > 0 && selectedId === "new") {
      const first = entities[0];
      setSelectedId(first.id ?? "new");
    }
  }, [entities, selectedId]);

  const updateField = (key: keyof LegalEntity, value: string | boolean) => {
    setFormState((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const saveEntity = async (override?: Partial<LegalEntity>) => {
    if (!accessToken) return null;
    setSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);
    const payload = {
      ...formState,
      ...override
    };
    if (!payload.company_name || !String(payload.company_name).trim()) {
      setSaving(false);
      setErrorMessage("Le nom commercial est obligatoire.");
      return null;
    }
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "legal_entities_update",
          ...payload
        })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Impossible d'enregistrer l'entite.");
      }
      const result = (await response.json()) as { data?: LegalEntity };
      const saved = result.data ?? null;
      if (saved?.id) {
        setSelectedId(saved.id);
        setFormState(saved);
      }
      setStatusMessage("Entite enregistree.");
      await queryClient.invalidateQueries({
        queryKey: ["legal-entities", session?.user?.id]
      });
      return saved;
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible d'enregistrer l'entite."
      );
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async () => {
    if (!accessToken || !selectedEntity?.id) return;
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "legal_entities_set_default",
          id: selectedEntity.id
        })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Impossible de definir le default.");
      }
      setStatusMessage("Entite par defaut mise a jour.");
      await queryClient.invalidateQueries({
        queryKey: ["legal-entities", session?.user?.id]
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de definir le default."
      );
    }
  };

  const handleDelete = async () => {
    if (!accessToken || !selectedEntity?.id) return;
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "legal_entities_delete",
          id: selectedEntity.id
        })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Impossible de supprimer l'entite.");
      }
      setSelectedId("new");
      setFormState(emptyEntity());
      setStatusMessage("Entite supprimee.");
      await queryClient.invalidateQueries({
        queryKey: ["legal-entities", session?.user?.id]
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de supprimer l'entite."
      );
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!accessToken || !supabase) return;
    setLogoUploading(true);
    setStatusMessage(null);
    setErrorMessage(null);
    let entity = selectedEntity;
    if (!entity?.id) {
      const saved = await saveEntity();
      if (!saved?.id) {
        setLogoUploading(false);
        return;
      }
      entity = saved;
    }
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("file_read_failed"));
        reader.readAsDataURL(file);
      });

      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "legal_entities_logo_upload",
          legal_entity_id: entity.id,
          filename: file.name,
          contentType: file.type,
          fileBase64
        })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Upload du logo impossible.");
      }
      const payload = (await response.json()) as {
        data?: { logo_path?: string | null; signed_url?: string | null };
      };
      if (payload?.data?.logo_path) {
        setFormState((prev) => ({
          ...prev,
          logo_path: payload.data?.logo_path ?? null
        }));
      }
      if (payload?.data?.signed_url) {
        setLogoPreviewUrl(payload.data.signed_url);
      }
      setStatusMessage("Logo mis a jour.");
      await queryClient.invalidateQueries({
        queryKey: ["legal-entities", session?.user?.id]
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Upload du logo impossible."
      );
    } finally {
      setLogoUploading(false);
    }
  };

  const handleLogoRemove = async () => {
    if (!selectedEntity?.id) {
      setFormState((prev) => ({
        ...prev,
        logo_path: null,
        logo_url: null
      }));
      setLogoPreviewUrl(null);
      return;
    }
    await saveEntity({
      id: selectedEntity.id,
      logo_path: null,
      logo_url: null
    });
    setLogoPreviewUrl(null);
  };

  useEffect(() => {
    let active = true;
    const loadPreview = async () => {
      if (!supabase || !selectedEntity?.logo_path) {
        setLogoPreviewUrl(null);
        return;
      }
      const { data, error } = await supabase.storage
        .from("brand-assets")
        .createSignedUrl(selectedEntity.logo_path, 60 * 60);
      if (!active) return;
      if (error) {
        setLogoPreviewUrl(null);
        return;
      }
      setLogoPreviewUrl(data?.signedUrl ?? null);
    };
    void loadPreview();
    return () => {
      active = false;
    };
  }, [selectedEntity?.logo_path]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1.6fr]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Entites legales</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedId("new");
              setFormState(emptyEntity());
            }}
          >
            Ajouter
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {entitiesQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : entities.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
              Aucune entite configuree pour le moment.
            </div>
          ) : (
            entities.map((entity) => (
              <button
                key={entity.id}
                type="button"
                onClick={() => setSelectedId(entity.id ?? "new")}
                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                  selectedId === entity.id
                    ? "border-ink bg-ink/5 text-ink"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div>
                  <p className="font-semibold">
                    {entity.company_name ?? "Entite"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {entity.legal_name ?? "Raison sociale non definie"}
                  </p>
                </div>
                {entity.is_default && <Badge variant="success">Par defaut</Badge>}
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details de l'entite</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">
              Nom commercial
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                value={formState.company_name ?? ""}
                onChange={(event) =>
                  updateField("company_name", event.target.value)
                }
                placeholder="EGIA Paris"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Raison sociale
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                value={formState.legal_name ?? ""}
                onChange={(event) =>
                  updateField("legal_name", event.target.value)
                }
                placeholder="EGIA SAS"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              SIRET
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                value={formState.siret ?? ""}
                onChange={(event) => updateField("siret", event.target.value)}
                placeholder="000 000 000 00000"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              TVA intracom
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                value={formState.vat_number ?? ""}
                onChange={(event) =>
                  updateField("vat_number", event.target.value)
                }
                placeholder="FR123456789"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Industrie
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                value={formState.industry ?? ""}
                onChange={(event) =>
                  updateField("industry", event.target.value)
                }
                placeholder="Restauration"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Email facturation
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                value={formState.billing_email ?? ""}
                onChange={(event) =>
                  updateField("billing_email", event.target.value)
                }
                placeholder="facturation@entreprise.com"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Telephone facturation
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                value={formState.billing_phone ?? ""}
                onChange={(event) =>
                  updateField("billing_phone", event.target.value)
                }
                placeholder="+33 1 23 45 67 89"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Adresse (ligne 1)
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                value={formState.billing_address_line1 ?? ""}
                onChange={(event) =>
                  updateField("billing_address_line1", event.target.value)
                }
                placeholder="10 rue de la Paix"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Adresse (ligne 2)
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                value={formState.billing_address_line2 ?? ""}
                onChange={(event) =>
                  updateField("billing_address_line2", event.target.value)
                }
                placeholder="Batiment B"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Code postal
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                value={formState.billing_postal_code ?? ""}
                onChange={(event) =>
                  updateField("billing_postal_code", event.target.value)
                }
                placeholder="75002"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Ville
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                value={formState.billing_city ?? ""}
                onChange={(event) =>
                  updateField("billing_city", event.target.value)
                }
                placeholder="Paris"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Region
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                value={formState.billing_region ?? ""}
                onChange={(event) =>
                  updateField("billing_region", event.target.value)
                }
                placeholder="Ile-de-France"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Pays
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                value={formState.billing_country ?? "FR"}
                onChange={(event) =>
                  updateField("billing_country", event.target.value)
                }
                placeholder="FR"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Logo de facturation
                </p>
                <p className="text-xs text-slate-500">
                  Utilise dans les documents PDF et emails.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer text-xs font-semibold text-ink">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleLogoUpload(file);
                      }
                    }}
                    disabled={logoUploading}
                  />
                  {logoUploading ? "Upload..." : "Importer"}
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogoRemove}
                  disabled={!selectedEntity?.logo_path && !logoPreviewUrl}
                >
                  Retirer
                </Button>
              </div>
            </div>
            {logoPreviewUrl ? (
              <div className="mt-4 flex items-center gap-4">
                <img
                  src={logoPreviewUrl}
                  alt="Logo"
                  className="h-14 w-14 rounded-lg border border-slate-200 object-contain"
                />
                <p className="text-xs text-slate-500">
                  Logo actif pour cette entite.
                </p>
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-400">
                Aucun logo charge pour le moment.
              </p>
            )}
          </div>

          {statusMessage && (
            <p className="text-xs text-emerald-600">{statusMessage}</p>
          )}
          {errorMessage && (
            <p className="text-xs text-rose-600">{errorMessage}</p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void saveEntity()} disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
            <Button
              variant="outline"
              onClick={handleSetDefault}
              disabled={!selectedEntity?.id || Boolean(selectedEntity?.is_default)}
            >
              Definir par defaut
            </Button>
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={!selectedEntity?.id || Boolean(selectedEntity?.is_default)}
            >
              Supprimer
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsEntreprise;
