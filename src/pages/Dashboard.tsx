import type { Session } from "@supabase/supabase-js";
import { MapPin, RefreshCw, Star } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { mockGoogleConnected, mockKpis } from "../mock/mockData";

type DashboardProps = {
  session: Session | null;
  googleConnected: boolean | null;
  onConnect: () => void;
  onSyncLocations: () => void;
  locations: Array<{
    id: string;
    location_title: string | null;
    location_resource_name: string;
    address_json: unknown | null;
    phone: string | null;
    website_uri: string | null;
  }>;
  locationsLoading: boolean;
  locationsError: string | null;
  syncing: boolean;
};

const Dashboard = ({
  session,
  googleConnected,
  onConnect,
  onSyncLocations,
  locations,
  locationsLoading,
  locationsError,
  syncing
}: DashboardProps) => {
  const connectedStatus = googleConnected ?? mockGoogleConnected;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        {mockKpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500">
                {kpi.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-semibold text-slate-900">
                  {kpi.value}
                </p>
                <p className="text-xs text-slate-500">{kpi.caption}</p>
              </div>
              <Badge variant={kpi.trend === "up" ? "success" : "warning"}>
                {kpi.delta}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Statut Google Business Profile</CardTitle>
            <p className="text-sm text-slate-500">
              Liez vos etablissements pour synchroniser avis, photos et
              messages.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              {googleConnected === null ? (
                <Skeleton className="h-8 w-40" />
              ) : (
                <Badge variant={connectedStatus ? "success" : "warning"}>
                  {connectedStatus ? "Google connecte" : "Connexion requise"}
                </Badge>
              )}
              <p className="text-sm text-slate-600">
                {connectedStatus
                  ? "Synchronisation active."
                  : "Aucune connexion active."}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={onConnect}>
                {connectedStatus ? "Actualiser la connexion" : "Connecter Google"}
              </Button>
              <Button variant="outline">Voir les permissions</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compte actif</CardTitle>
            <p className="text-sm text-slate-500">
              Session Supabase en cours.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Utilisateur
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {session?.user.email ?? "Non connecte"}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <RefreshCw size={14} />
              Derniere verification il y a 2 minutes
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-slate-900">
            Lieux connectes
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onSyncLocations} disabled={syncing}>
              {syncing ? "Synchronisation..." : "Synchroniser les lieux"}
            </Button>
          </div>
        </div>
        {locationsError && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            {locationsError}
          </div>
        )}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {locationsLoading &&
            Array.from({ length: 2 }).map((_, index) => (
              <Card key={`skeleton-${index}`}>
                <CardContent className="space-y-3 pt-6">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          {!locationsLoading && locations.length === 0 && (
            <Card>
              <CardContent className="space-y-2 pt-6 text-sm text-slate-500">
                <p>Aucun lieu synchronise pour le moment.</p>
                <p>Utilisez le bouton de synchronisation pour charger vos lieux.</p>
              </CardContent>
            </Card>
          )}
          {!locationsLoading &&
            locations.map((location) => (
              <Card key={location.id}>
                <CardContent className="flex items-center justify-between gap-4 pt-6">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {location.location_title ??
                        location.location_resource_name}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                      <MapPin size={14} />
                      {location.phone ?? "Telephone non renseigne"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1 text-sm font-semibold text-slate-900">
                      <Star size={14} className="text-amber-500" />
                      Actif
                    </div>
                    <p className="text-xs text-slate-500">
                      {location.website_uri ?? "Site non renseigne"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      </section>
    </div>
  );
};

export { Dashboard };
