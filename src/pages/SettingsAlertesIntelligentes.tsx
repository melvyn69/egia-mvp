import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

const SettingsAlertesIntelligentes = () => {
  const [enabled, setEnabled] = useState(true);
  const [tolerance, setTolerance] = useState("standard");
  const [alertTypes, setAlertTypes] = useState({
    reputation_drop: true,
    unanswered_reviews: true,
    negative_spike: true,
    long_negative: false
  });
  const [frequency, setFrequency] = useState("instant");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Alertes intelligentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <p>
            EGIA surveille en continu les signaux qui meritent une action
            rapide, sans vous surcharger. Vous gardez le controle sur le niveau
            de sensibilite et le type d'alertes prioritaires.
          </p>
          <p>
            Les regles peuvent evoluer, mais votre experience reste stable et
            transparente.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Surveillance automatique</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Activer la surveillance intelligente
              </p>
              <p className="text-xs text-slate-500">
                EGIA vous alerte uniquement lorsqu'une action est conseillee.
              </p>
            </div>
            <input
              type="checkbox"
              className="h-4 w-4 accent-ink"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
          </label>

          <label className="block text-xs font-semibold text-slate-600">
            Niveau de tolerance
            <select
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              value={tolerance}
              onChange={(event) => setTolerance(event.target.value)}
              disabled={!enabled}
            >
              <option value="strict">Strict (alertes exigeantes)</option>
              <option value="standard">Equilibre (recommande)</option>
              <option value="relaxed">Confort (moins de signaux)</option>
            </select>
          </label>
          <p className="text-xs text-slate-500">
            Ajustez la sensibilite selon votre capacite de reaction.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Types d'alertes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700">
            Baisse notable de reputation
            <input
              type="checkbox"
              className="h-4 w-4 accent-ink"
              checked={alertTypes.reputation_drop}
              onChange={(event) =>
                setAlertTypes((prev) => ({
                  ...prev,
                  reputation_drop: event.target.checked
                }))
              }
              disabled={!enabled}
            />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700">
            Avis sensibles sans reponse
            <input
              type="checkbox"
              className="h-4 w-4 accent-ink"
              checked={alertTypes.unanswered_reviews}
              onChange={(event) =>
                setAlertTypes((prev) => ({
                  ...prev,
                  unanswered_reviews: event.target.checked
                }))
              }
              disabled={!enabled}
            />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700">
            Pic d'avis negatifs
            <input
              type="checkbox"
              className="h-4 w-4 accent-ink"
              checked={alertTypes.negative_spike}
              onChange={(event) =>
                setAlertTypes((prev) => ({
                  ...prev,
                  negative_spike: event.target.checked
                }))
              }
              disabled={!enabled}
            />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-400">
            Avis detaille et sensible (V2)
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={alertTypes.long_negative}
              onChange={(event) =>
                setAlertTypes((prev) => ({
                  ...prev,
                  long_negative: event.target.checked
                }))
              }
              disabled
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Frequence email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="alert-frequency"
              className="h-4 w-4 accent-ink"
              checked={frequency === "instant"}
              onChange={() => setFrequency("instant")}
              disabled={!enabled}
            />
            Instantane (des qu'une action est prioritaire)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="alert-frequency"
              className="h-4 w-4 accent-ink"
              checked={frequency === "daily"}
              onChange={() => setFrequency("daily")}
              disabled={!enabled}
            />
            Digest quotidien (mise en perspective)
          </label>
          <label className="flex items-center gap-2 text-slate-400">
            <input
              type="radio"
              name="alert-frequency"
              className="h-4 w-4"
              checked={frequency === "weekly"}
              onChange={() => setFrequency("weekly")}
              disabled
            />
            Synthese hebdomadaire (V2)
          </label>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsAlertesIntelligentes;
