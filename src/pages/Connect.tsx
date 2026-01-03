import { CheckCircle2, Link2, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

type ConnectProps = {
  onConnect: () => void;
  onSync?: () => void;
  syncLoading?: boolean;
  syncMessage?: string | null;
  lastLogStatus?: string | null;
  lastLogMessage?: string | null;
};

const Connect = ({
  onConnect,
  onSync,
  syncLoading = false,
  syncMessage,
  lastLogStatus,
  lastLogMessage
}: ConnectProps) => (
  <div className="space-y-6">
    <Card className="border-0 bg-gradient-to-br from-ink via-[#1d1c20] to-[#3a2f28] text-white shadow-soft">
      <CardHeader>
        <CardTitle className="text-3xl font-semibold">
          Connecter Google Business Profile
        </CardTitle>
        <p className="text-sm text-slate-200">
          Synchronisez vos avis et mettez a jour vos fiches en temps reel.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button variant="secondary" size="lg" onClick={onConnect}>
          Lancer la connexion Google
        </Button>
        {onSync && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSync}
            disabled={syncLoading}
          >
            {syncLoading
              ? "Synchronisation..."
              : "Synchroniser mes établissements & avis"}
          </Button>
        )}
        {syncMessage && (
          <p className="text-xs text-slate-200/80">{syncMessage}</p>
        )}
        <p className="text-xs text-slate-200/80">
          Autorisation requise pour acceder aux avis, repondre et publier.
        </p>
      </CardContent>
    </Card>

    <div className="grid gap-4 md:grid-cols-3">
      {[
        {
          icon: <ShieldCheck size={18} />,
          title: "Connexion securisee",
          description: "OAuth Google officiel, aucun mot de passe stocke."
        },
        {
          icon: <Link2 size={18} />,
          title: "Donnees centralisees",
          description: "Toutes vos fiches dans un seul tableau."
        },
        {
          icon: <CheckCircle2 size={18} />,
          title: "Temps reel",
          description: "Reponses aux avis et insights instantanes."
        }
      ].map((item) => (
        <Card key={item.title}>
          <CardContent className="space-y-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-clay text-slate-700">
              {item.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {item.title}
              </p>
              <p className="text-sm text-slate-500">{item.description}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Logs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-slate-600">
        <p>
          <span className="font-semibold text-slate-700">Status:</span>{" "}
          {lastLogStatus ?? "—"}
        </p>
        <p>
          <span className="font-semibold text-slate-700">Dernier message:</span>{" "}
          {lastLogMessage ?? "—"}
        </p>
      </CardContent>
    </Card>
  </div>
);

export { Connect };
