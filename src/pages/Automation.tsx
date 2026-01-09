import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import type { Database } from "../database.types";
import { supabase } from "../lib/supabase";

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

type WorkflowRow = Database["public"]["Tables"]["automation_workflows"]["Row"];
type ConditionRow = Database["public"]["Tables"]["automation_conditions"]["Row"];
type ActionRow = Database["public"]["Tables"]["automation_actions"]["Row"];
type ReviewRow = Database["public"]["Tables"]["google_reviews"]["Row"];

type TesterResult = {
  review: ReviewRow;
  draftText: string | null;
  tags: string[];
};

const templates = [
  {
    id: "winback",
    title: "Win-back VIP",
    description: "Relancer automatiquement les avis VIP et renforcer la fidelisation."
  },
  {
    id: "crisis",
    title: "Gestion de crise",
    description: "Prioriser les avis 1-2 etoiles pour reponse rapide."
  },
  {
    id: "autopilot",
    title: "Pilote automatique",
    description: "Mode futur: reponses et tags automatiques en continu."
  }
];

const getSortValue = (row: Record<string, unknown>) => {
  const position = row.position;
  const sortOrder = row.sort_order;
  const createdAt = row.created_at;
  if (typeof position === "number") {
    return position;
  }
  if (typeof sortOrder === "number") {
    return sortOrder;
  }
  if (typeof createdAt === "string") {
    return createdAt;
  }
  return "";
};

const normalizeConfig = (value: unknown): Record<string, unknown> => {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
};

const matchesCondition = (review: ReviewRow, condition: ConditionRow): boolean => {
  const field = condition.field ?? "";
  const operator = condition.operator ?? "";
  const value = (condition.value ?? "").toString();

  if (field === "rating") {
    const rating = review.rating;
    const target = Number(value);
    if (!Number.isFinite(target) || rating === null) {
      return false;
    }
    if (operator === "eq") return rating === target;
    if (operator === "gte") return rating >= target;
    if (operator === "lte") return rating <= target;
    return false;
  }

  if (field === "source") {
    const source = "google";
    if (operator === "eq") {
      return source === value.toLowerCase();
    }
    return false;
  }

  if (field === "comment") {
    const comment = (review.comment ?? "").toLowerCase();
    const needle = value.toLowerCase();
    if (operator === "contains") {
      return needle.length > 0 && comment.includes(needle);
    }
    if (operator === "not_contains") {
      return needle.length > 0 ? !comment.includes(needle) : true;
    }
    if (operator === "eq") {
      return comment === needle;
    }
  }

  return false;
};

const formatLocationLabel = (
  locationId: string | null,
  locations: AutomationProps["locations"]
) => {
  if (!locationId) {
    return "Toutes les fiches";
  }
  const match = locations.find(
    (location) => location.location_resource_name === locationId
  );
  return match?.location_title ?? locationId;
};

const Automation = ({
  session,
  locations,
  locationsLoading,
  locationsError
}: AutomationProps) => {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [conditionsMap, setConditionsMap] = useState<Record<string, ConditionRow[]>>(
    {}
  );
  const [actionsMap, setActionsMap] = useState<Record<string, ActionRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TesterResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const supabaseClient = supabase;

  const workflowById = useMemo(
    () =>
      workflows.reduce<Record<string, WorkflowRow>>((acc, workflow) => {
        acc[workflow.id] = workflow;
        return acc;
      }, {}),
    [workflows]
  );

  useEffect(() => {
    if (!supabaseClient || !session) {
      setWorkflows([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabaseClient
        .from("automation_workflows")
        .select("*")
        .order("updated_at", { ascending: false });
      if (cancelled) {
        return;
      }
      if (error) {
        console.error("automation_workflows fetch error:", error);
        setError("Impossible de charger les automatisations.");
        setWorkflows([]);
        setLoading(false);
        return;
      }
      const rows = data ?? [];
      setWorkflows(rows);
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) {
        setConditionsMap({});
        setActionsMap({});
        setLoading(false);
        return;
      }
      const [conditionsRes, actionsRes] = await Promise.all([
        supabaseClient
          .from("automation_conditions")
          .select("*")
          .in("workflow_id", ids),
        supabaseClient
          .from("automation_actions")
          .select("*")
          .in("workflow_id", ids)
      ]);
      if (cancelled) {
        return;
      }
      if (conditionsRes.error) {
        console.error("automation_conditions fetch error:", conditionsRes.error);
      }
      if (actionsRes.error) {
        console.error("automation_actions fetch error:", actionsRes.error);
      }
      const conditionsRows = conditionsRes.data ?? [];
      const actionsRows = actionsRes.data ?? [];
      const nextConditions: Record<string, ConditionRow[]> = {};
      const nextActions: Record<string, ActionRow[]> = {};
      conditionsRows.forEach((row) => {
        if (!nextConditions[row.workflow_id]) {
          nextConditions[row.workflow_id] = [];
        }
        nextConditions[row.workflow_id].push(row);
      });
      actionsRows.forEach((row) => {
        if (!nextActions[row.workflow_id]) {
          nextActions[row.workflow_id] = [];
        }
        nextActions[row.workflow_id].push(row);
      });
      Object.keys(nextConditions).forEach((key) => {
        nextConditions[key].sort(
          (a, b) => (getSortValue(a as Record<string, unknown>) as number | string) >
            (getSortValue(b as Record<string, unknown>) as number | string)
            ? 1
            : -1
        );
      });
      Object.keys(nextActions).forEach((key) => {
        nextActions[key].sort(
          (a, b) => (getSortValue(a as Record<string, unknown>) as number | string) >
            (getSortValue(b as Record<string, unknown>) as number | string)
            ? 1
            : -1
        );
      });
      setConditionsMap(nextConditions);
      setActionsMap(nextActions);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const toggleWorkflow = async (workflow: WorkflowRow) => {
    if (!supabaseClient) return;
    const nextEnabled = !(workflow.enabled ?? false);
    const { error } = await supabaseClient
      .from("automation_workflows")
      .update({ enabled: nextEnabled })
      .eq("id", workflow.id);
    if (error) {
      console.error("automation_workflows update error:", error);
      setError("Impossible de mettre a jour le workflow.");
      return;
    }
    setWorkflows((prev) =>
      prev.map((item) =>
        item.id === workflow.id ? { ...item, enabled: nextEnabled } : item
      )
    );
  };

  const runTest = async (workflowId: string) => {
    if (!supabaseClient || !session) {
      return;
    }
    setTestingId(workflowId);
    setTestError(null);
    setTestResult(null);
    const workflow = workflowById[workflowId];
    if (!workflow) {
      setTestingId(null);
      return;
    }

    const workflowConditions = conditionsMap[workflowId] ?? [];
    const workflowActions = actionsMap[workflowId] ?? [];

    let query = supabaseClient
      .from("google_reviews")
      .select("id, review_id, rating, comment, location_id, author_name, create_time")
      .order("create_time", { ascending: false })
      .limit(20);
    if (workflow.location_id) {
      query = query.eq("location_id", workflow.location_id);
    }

    const { data: reviewData, error: reviewError } = await query;
    if (reviewError) {
      console.error("automation test reviews error:", reviewError);
      setTestError("Impossible de charger des avis pour le test.");
      setTestingId(null);
      return;
    }
    const reviews = reviewData ?? [];
    const match = reviews.find((review) =>
      workflowConditions.every((condition) => matchesCondition(review, condition))
    );
    if (!match) {
      setTestError("Aucun avis ne correspond aux conditions.");
      setTestingId(null);
      return;
    }

    const tags: string[] = [];
    let draftText: string | null = null;

    for (const action of workflowActions) {
      const type = action.type ?? "";
      const config = normalizeConfig(action.config);
      if (type === "ai_draft") {
        const tone = (config.tone as string) ?? "professional";
        try {
          const res = await fetch("/api/google/reply", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              mode: "draft",
              review_id: match.review_id ?? match.id,
              tone
            })
          });
          if (!res.ok) {
            const txt = await res.text();
            throw new Error(txt);
          }
          const payload = (await res.json()) as { draft_text?: string };
          draftText = payload.draft_text ?? null;
          if (draftText) {
            const { error } = await supabaseClient.from("review_drafts").insert({
              user_id: session.user.id,
              review_id: match.review_id ?? match.id,
              draft_text: draftText,
              status: "draft"
            });
            if (error) {
              console.error("review_drafts insert error:", error);
            }
          }
        } catch (error) {
          console.error("automation draft error:", error);
          setTestError("Erreur lors de la generation du brouillon.");
        }
      }
      if (type === "add_tag") {
        const tag = (config.tag as string) ?? "";
        if (tag.trim().length === 0) {
          continue;
        }
        tags.push(tag);
        const { error } = await supabaseClient.from("review_tags").insert({
          user_id: session.user.id,
          review_id: match.review_id ?? match.id,
          tag
        });
        if (error) {
          console.error("review_tags insert error:", error);
        }
      }
    }

    setTestResult({ review: match, draftText, tags });
    setTestingId(null);
  };

  const closeModal = () => {
    setTestResult(null);
    setTestError(null);
  };

  if (!supabaseClient) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            Automatisations
          </h2>
          <p className="text-sm text-slate-500">
            Orchestration des reponses et tags assistes.
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
        <h2 className="text-2xl font-semibold text-slate-900">Automatisations</h2>
        <p className="text-sm text-slate-500">
          Orchestration des reponses et tags assistes.
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <CardTitle>{template.title}</CardTitle>
              <p className="text-sm text-slate-500">{template.description}</p>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" disabled>
                Bientot disponible
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Vos scenarios actifs
            </h3>
            <p className="text-sm text-slate-500">
              Declencheurs et actions personnalises.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/automation/builder")}>
              Creer manuellement
            </Button>
          </div>
        </div>

        {locationsError && (
          <p className="text-xs text-amber-700">{locationsError}</p>
        )}
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : error ? (
          <Card>
            <CardContent className="pt-6 text-sm text-amber-700">
              {error}
            </CardContent>
          </Card>
        ) : workflows.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-slate-500">
              Aucun workflow pour le moment.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {workflows.map((workflow) => (
              <Card key={workflow.id}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-900">
                        {workflow.name ?? "Workflow sans nom"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {workflow.trigger ?? "new_review"} ·{" "}
                        {formatLocationLabel(workflow.location_id, locations)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => runTest(workflow.id)}
                        disabled={Boolean(testingId)}
                      >
                        {testingId === workflow.id ? "Test..." : "Tester"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          navigate(`/automation/builder?id=${workflow.id}`)
                        }
                      >
                        Editer
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleWorkflow(workflow)}
                      >
                        {workflow.enabled ? "Desactiver" : "Activer"}
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Badge variant={workflow.enabled ? "success" : "neutral"}>
                      {workflow.enabled ? "Actif" : "Inactif"}
                    </Badge>
                    <span>
                      Conditions: {(conditionsMap[workflow.id] ?? []).length}
                    </span>
                    <span>Actions: {(actionsMap[workflow.id] ?? []).length}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {(testResult || testError) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle>Resultat du test</CardTitle>
              <p className="text-sm text-slate-500">
                Simulation sur un avis recent.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {testError ? (
                <p className="text-sm text-amber-700">{testError}</p>
              ) : testResult ? (
                <>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <p className="font-semibold">
                      {testResult.review.author_name ?? "Client"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Note: {testResult.review.rating ?? "—"} ·{" "}
                      {formatLocationLabel(
                        testResult.review.location_id,
                        locations
                      )}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {testResult.review.comment ?? "Avis sans commentaire."}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Brouillon IA</p>
                    <p className="mt-2 text-sm text-slate-700">
                      {testResult.draftText ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Tags ajoutes</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {testResult.tags.length > 0 ? (
                        testResult.tags.map((tag) => (
                          <Badge key={tag} variant="neutral">
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">—</span>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
              <div className="flex justify-end">
                <Button variant="outline" onClick={closeModal}>
                  Fermer
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {locationsLoading && (
        <p className="text-xs text-slate-500">Chargement des lieux...</p>
      )}
    </div>
  );
};

export { Automation };
