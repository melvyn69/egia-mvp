import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

type OAuthCallbackProps = {
  loading: boolean;
  error: string | null;
  onBack: () => void;
};

const OAuthCallback = ({ loading, error, onBack }: OAuthCallbackProps) => (
  <div className="mx-auto max-w-xl">
    <Card>
      <CardHeader>
        <CardTitle>Connexion Google</CardTitle>
        <p className="text-sm text-slate-500">
          Finalisation de la connexion en cours.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <Loader2 size={18} className="animate-spin" />
            Verification des autorisations Google...
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle size={16} />
              Connexion impossible
            </div>
            <p className="mt-2">{error}</p>
          </div>
        )}
        <Button variant="outline" onClick={onBack}>
          Retour au dashboard
        </Button>
      </CardContent>
    </Card>
  </div>
);

export { OAuthCallback };
