import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";

type TestLabProps = {
  session: Session | null;
};

const TestLab = ({ session }: TestLabProps) => {
  const [reviewText, setReviewText] = useState("");
  const [rating, setRating] = useState<number>(5);
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!session?.access_token) {
      setError("Connectez-vous pour generer une reponse.");
      return;
    }
    if (!reviewText.trim()) {
      setError("Veuillez saisir un avis de test.");
      return;
    }
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await fetch("/api/google/reply", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: "test",
          review_text: reviewText.trim(),
          rating
        })
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload) {
        setError("Impossible de generer la reponse.");
        setLoading(false);
        return;
      }
      setResponse(payload.reply_text ?? "—");
    } catch {
      setError("Impossible de generer la reponse.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Test Lab</h2>
        <p className="text-sm text-slate-500">
          Simulation de reponse IA sans ecriture en base.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Avis de test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            className="min-h-[140px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            value={reviewText}
            onChange={(event) => setReviewText(event.target.value)}
            placeholder="Ex: Super accueil, coupe rapide et efficace."
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-semibold text-slate-500">Note</label>
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              value={rating}
              onChange={(event) => setRating(Number(event.target.value))}
            >
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {value}★
                </option>
              ))}
            </select>
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? "Generation..." : "Generer la reponse test"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reponse generee</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-28 w-full" />
          ) : error ? (
            <p className="text-sm text-amber-700">{error}</p>
          ) : response ? (
            <p className="text-sm text-slate-700">{response}</p>
          ) : (
            <p className="text-sm text-slate-500">Aucune reponse generee.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export { TestLab };
