import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

const panelClass =
  "overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.06)]";

const sectionHeaderClass = "border-b border-slate-100 px-4 py-4 sm:px-6";

const SettingsAlertesIntelligentes = () => {
  const enabled = true;
  const tolerance: "strict" | "standard" | "relaxed" = "standard";
  const alertTypes = {
    reputation_drop: true,
    unanswered_reviews: true,
    negative_spike: true,
    long_negative: false
  };
  const frequency = String("instant") as "instant" | "daily" | "weekly";

  return (
    <div className="space-y-6">
      <Card className={panelClass}>
        <CardHeader className={sectionHeaderClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold sm:text-lg">
                Alertes intelligentes
              </CardTitle>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Surveillance proactive et signaux à fort impact.
              </p>
            </div>
            <Badge variant="warning">Préférences non connectées</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-4 py-4 text-sm leading-6 text-slate-600 sm:px-6">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Aucun service de préférences d'alertes n'est connecté à ce compte.
            Les réglages ci-dessous sont affichés en lecture seule afin de ne
            pas simuler une sauvegarde.
          </div>
          <p>
            EGIA surveille en continu les signaux qui méritent une action
            rapide, sans vous surcharger. Vous gardez le contrôle sur le niveau
            de sensibilité et le type d'alertes prioritaires.
          </p>
          <p>
            Les règles peuvent évoluer, mais votre expérience reste stable et
            transparente.
          </p>
        </CardContent>
      </Card>

      <Card className={panelClass}>
        <CardHeader className={sectionHeaderClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold sm:text-lg">
                Surveillance automatique
              </CardTitle>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Ajustez la sensibilité affichée pour les règles de surveillance.
              </p>
            </div>
            <Badge variant="warning">Lecture seule</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-4 py-4 sm:px-6">
          <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 transition hover:bg-white">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Activer la surveillance intelligente
              </p>
              <p className="text-xs text-slate-500">
                EGIA vous alerte uniquement lorsqu'une action est conseillée.
              </p>
            </div>
            <input
              type="checkbox"
              className="h-4 w-4 accent-ink"
              checked={enabled}
              readOnly
              disabled
            />
          </label>

          <label className="block text-xs font-semibold text-slate-600">
            Niveau de tolérance
            <select
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              value={tolerance}
              disabled
            >
              <option value="strict">Strict (alertes exigeantes)</option>
              <option value="standard">Équilibre (recommandé)</option>
              <option value="relaxed">Confort (moins de signaux)</option>
            </select>
          </label>
          <p className="text-xs text-slate-500">
            Ajustez la sensibilité selon votre capacité de réaction.
          </p>
        </CardContent>
      </Card>

      <Card className={panelClass}>
        <CardHeader className={sectionHeaderClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold sm:text-lg">
                Types d'alertes
              </CardTitle>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Sélectionnez les signaux qui doivent rester visibles.
              </p>
            </div>
            <Badge variant="warning">Lecture seule</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-4 py-4 sm:px-6">
          <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-3 text-sm text-slate-700">
            Baisse notable de réputation
            <input
              type="checkbox"
              className="h-4 w-4 accent-ink"
              checked={alertTypes.reputation_drop}
              readOnly
              disabled
            />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-3 text-sm text-slate-700">
            Avis sensibles sans réponse
            <input
              type="checkbox"
              className="h-4 w-4 accent-ink"
              checked={alertTypes.unanswered_reviews}
              readOnly
              disabled
            />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-3 text-sm text-slate-700">
            Pic d'avis négatifs
            <input
              type="checkbox"
              className="h-4 w-4 accent-ink"
              checked={alertTypes.negative_spike}
              readOnly
              disabled
            />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-400">
            Avis détaillé et sensible
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={alertTypes.long_negative}
              readOnly
              disabled
            />
          </label>
        </CardContent>
      </Card>

      <Card className={panelClass}>
        <CardHeader className={sectionHeaderClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold sm:text-lg">
                Fréquence email
              </CardTitle>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Définissez le rythme de notification affiché.
              </p>
            </div>
            <Badge variant="warning">Lecture seule</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-4 py-4 text-sm text-slate-700 sm:px-6">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="alert-frequency"
              className="h-4 w-4 accent-ink"
              checked={frequency === "instant"}
              readOnly
              disabled
            />
            Instantané (dès qu'une action est prioritaire)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="alert-frequency"
              className="h-4 w-4 accent-ink"
              checked={frequency === "daily"}
              readOnly
              disabled
            />
            Digest quotidien (mise en perspective)
          </label>
          <label className="flex items-center gap-2 text-slate-400">
            <input
              type="radio"
              name="alert-frequency"
              className="h-4 w-4"
              checked={frequency === "weekly"}
              readOnly
              disabled
            />
            Synthèse hebdomadaire
          </label>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsAlertesIntelligentes;
