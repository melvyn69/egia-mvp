import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

const statusTabs = [
  { id: "todo", label: "À traiter" },
  { id: "replied", label: "Répondu" },
  { id: "all", label: "Tout" }
] as const;

type StatusFilter = (typeof statusTabs)[number]["id"];

type Review = {
  id: string;
  locationName: string;
  locationId: string;
  authorName: string;
  rating: number;
  source: "Google" | "Facebook";
  status: "todo" | "replied";
  createdAt: string;
  text: string;
  tags: string[];
};

type LengthPreset = "court" | "moyen" | "long";

type TonePreset = "professionnel" | "amical" | "empathique";

const mockReviews: Review[] = [
  {
    id: "r1",
    locationName: "Boulangerie Saint-Roch",
    locationId: "loc-1",
    authorName: "Camille Dupont",
    rating: 5,
    source: "Google",
    status: "todo",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    text: "Accueil chaleureux, viennoiseries délicieuses. Je recommande !",
    tags: ["Accueil", "Qualité"]
  },
  {
    id: "r2",
    locationName: "Boulangerie Saint-Roch",
    locationId: "loc-1",
    authorName: "Thomas Girard",
    rating: 3,
    source: "Google",
    status: "todo",
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    text: "Bon produit mais attente un peu longue ce matin.",
    tags: ["Attente", "Service"]
  },
  {
    id: "r3",
    locationName: "Brasserie du Parc",
    locationId: "loc-2",
    authorName: "Ines Martin",
    rating: 2,
    source: "Facebook",
    status: "todo",
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    text: "Service lent et plat tiède. Décevant.",
    tags: ["Service", "Cuisine"]
  },
  {
    id: "r4",
    locationName: "Brasserie du Parc",
    locationId: "loc-2",
    authorName: "Louis Bernard",
    rating: 4,
    source: "Google",
    status: "replied",
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    text: "Cadre agréable et équipe souriante.",
    tags: ["Ambiance", "Equipe"]
  },
  {
    id: "r5",
    locationName: "Salon Lila",
    locationId: "loc-3",
    authorName: "Nora Lemoine",
    rating: 1,
    source: "Facebook",
    status: "todo",
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    text: "Rendez-vous annulé sans prévenir, très déçue.",
    tags: ["Organisation", "Fiabilité"]
  },
  {
    id: "r6",
    locationName: "Salon Lila",
    locationId: "loc-3",
    authorName: "Julien Huguet",
    rating: 4,
    source: "Google",
    status: "replied",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    text: "Très bon service, je reviendrai !",
    tags: ["Service", "Fidelité"]
  },
  {
    id: "r7",
    locationName: "Studio Forma",
    locationId: "loc-4",
    authorName: "Sarah Klein",
    rating: 5,
    source: "Google",
    status: "todo",
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    text: "Coaching motivant et suivi au top.",
    tags: ["Coaching", "Suivi"]
  },
  {
    id: "r8",
    locationName: "Studio Forma",
    locationId: "loc-4",
    authorName: "Hakim Roux",
    rating: 3,
    source: "Facebook",
    status: "replied",
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    text: "Salle correcte, un peu trop chargée aux heures de pointe.",
    tags: ["Affluence", "Infrastructure"]
  }
];

const lengthOptions: Array<{ id: LengthPreset; label: string }> = [
  { id: "court", label: "Court" },
  { id: "moyen", label: "Moyen" },
  { id: "long", label: "Long" }
];

const toneOptions: Array<{ id: TonePreset; label: string }> = [
  { id: "professionnel", label: "Professionnel" },
  { id: "amical", label: "Amical" },
  { id: "empathique", label: "Empathique" }
];

const activityEvents = [
  {
    id: "a1",
    label: "Réponse automatique enregistrée",
    timestamp: "Il y a 12 min"
  },
  { id: "a2", label: "Avis assigné à Lucie", timestamp: "Il y a 1 h" },
  { id: "a3", label: "Tag “Service” ajouté", timestamp: "Hier" }
];

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
};

const buildReply = (
  review: Review,
  lengthPreset: LengthPreset,
  tonePreset: TonePreset
): string => {
  const toneIntro =
    tonePreset === "professionnel"
      ? "Merci pour votre retour."
      : tonePreset === "amical"
        ? "Merci beaucoup pour votre message !"
        : "Merci d'avoir pris le temps de partager votre expérience.";

  const toneClosing =
    tonePreset === "professionnel"
      ? "Nous restons à votre écoute."
      : tonePreset === "amical"
        ? "Au plaisir de vous revoir très bientôt !"
        : "N'hésitez pas à nous contacter si besoin.";

  let core = "";
  if (review.rating >= 4) {
    core =
      "Nous sommes ravis que votre visite vous ait plu et nous serions heureux de vous accueillir à nouveau.";
  } else if (review.rating === 3) {
    core =
      "Nous sommes contents que certains aspects vous aient plu et prenons en compte vos remarques pour nous améliorer.";
  } else {
    core =
      "Nous sommes désolés que votre expérience n'ait pas été à la hauteur et souhaitons améliorer la situation rapidement.";
  }

  const extra =
    review.rating <= 2
      ? "Si vous le souhaitez, contactez-nous afin que nous puissions échanger."
      : "";
  const improvement =
    review.rating === 3
      ? "Votre retour nous aide à ajuster nos priorités dès cette semaine."
      : "";
  const invite =
    review.rating >= 4
      ? "Votre soutien compte beaucoup pour l'équipe."
      : "";

  const sentences = [toneIntro, core, improvement, invite, extra, toneClosing].filter(
    Boolean
  );

  if (lengthPreset === "court") {
    return sentences.slice(0, 2).join(" ");
  }
  if (lengthPreset === "moyen") {
    return sentences.slice(0, 3).join(" ");
  }
  return sentences.join(" ");
};

const generateReplyMock = (
  review: Review,
  lengthPreset: LengthPreset,
  tonePreset: TonePreset
): Promise<string> => {
  const delay = 600 + Math.floor(Math.random() * 400);
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve(buildReply(review, lengthPreset, tonePreset));
    }, delay);
  });
};

const Inbox = () => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todo");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [selectedReviewId, setSelectedReviewId] = useState<string>(mockReviews[0]?.id);
  const [lengthPreset, setLengthPreset] = useState<LengthPreset>("moyen");
  const [tonePreset, setTonePreset] = useState<TonePreset>("professionnel");
  const [replyText, setReplyText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [replyTab, setReplyTab] = useState<"reply" | "activity">("reply");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const locations = useMemo(() => {
    const unique = Array.from(new Set(mockReviews.map((review) => review.locationName)));
    return ["Tous", ...unique];
  }, []);

  const filteredReviews = useMemo(() => {
    return mockReviews.filter((review) => {
      const matchesStatus =
        statusFilter === "all" ? true : review.status === statusFilter;
      const matchesLocation =
        selectedLocation === "all"
          ? true
          : review.locationName === selectedLocation;
      return matchesStatus && matchesLocation;
    });
  }, [statusFilter, selectedLocation]);

  useEffect(() => {
    if (filteredReviews.length === 0) {
      setSelectedReviewId("");
      return;
    }
    const stillVisible = filteredReviews.some((review) => review.id === selectedReviewId);
    if (!stillVisible) {
      setSelectedReviewId(filteredReviews[0].id);
    }
  }, [filteredReviews, selectedReviewId]);

  const selectedReview = useMemo(() => {
    return mockReviews.find((review) => review.id === selectedReviewId) ?? null;
  }, [selectedReviewId]);

  useEffect(() => {
    if (!selectedReview) {
      setReplyText("");
      return;
    }
    setReplyText(drafts[selectedReview.id] ?? "");
  }, [drafts, selectedReview]);

  const handleGenerate = async () => {
    if (!selectedReview) {
      return;
    }
    setIsGenerating(true);
    const generated = await generateReplyMock(
      selectedReview,
      lengthPreset,
      tonePreset
    );
    setReplyText(generated);
    setDrafts((prev) => ({ ...prev, [selectedReview.id]: generated }));
    setIsGenerating(false);
  };

  const handleSave = () => {
    if (!selectedReview) {
      return;
    }
    window.alert("Brouillon sauvegardé");
  };

  const handleSend = () => {
    if (!selectedReview) {
      return;
    }
    window.alert("Réponse envoyée");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Boîte de réception</h2>
        <p className="text-sm text-slate-500">
          Réponses aux avis et suivi des interactions clients.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1.4fr_1.05fr]">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {statusTabs.map((tab) => (
                <Button
                  key={tab.id}
                  variant={statusFilter === tab.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(tab.id)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Lieu</label>
              <select
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                value={selectedLocation}
                onChange={(event) =>
                  setSelectedLocation(
                    event.target.value === "Tous" ? "all" : event.target.value
                  )
                }
              >
                {locations.map((location) => (
                  <option key={location} value={location}>
                    {location === "Tous" ? "Tous" : location}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredReviews.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun avis à afficher.</p>
            ) : (
              filteredReviews.map((review) => (
                <button
                  key={review.id}
                  type="button"
                  onClick={() => setSelectedReviewId(review.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition hover:border-slate-300 ${
                    selectedReviewId === review.id
                      ? "border-slate-400 bg-slate-50"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {review.authorName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {review.locationName}
                      </p>
                    </div>
                    <Badge variant={review.status === "todo" ? "warning" : "success"}>
                      {review.status === "todo" ? "À traiter" : "Répondu"}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <span>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>
                    <span>{review.source}</span>
                    <span>•</span>
                    <span>{formatDate(review.createdAt)}</span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-slate-600">
                    {review.text}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Détails de l'avis</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedReview ? (
              <p className="text-sm text-slate-500">Sélectionnez un avis.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {selectedReview.authorName}
                    </p>
                    <p className="text-sm text-slate-500">
                      {selectedReview.locationName}
                    </p>
                  </div>
                  <div className="text-right text-sm text-slate-600">
                    <p>{formatDate(selectedReview.createdAt)}</p>
                    <p className="mt-1">{selectedReview.source}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="neutral">{selectedReview.rating}★</Badge>
                  <Badge variant={
                    selectedReview.status === "todo" ? "warning" : "success"
                  }>
                    {selectedReview.status === "todo" ? "À traiter" : "Répondu"}
                  </Badge>
                </div>

                <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  {selectedReview.text}
                </p>

                <div className="flex flex-wrap gap-2">
                  {selectedReview.tags.map((tag) => (
                    <Badge key={tag} variant="neutral">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-3">
            <CardTitle>Réponse</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant={replyTab === "reply" ? "default" : "outline"}
                size="sm"
                onClick={() => setReplyTab("reply")}
              >
                Réponse
              </Button>
              <Button
                variant={replyTab === "activity" ? "default" : "outline"}
                size="sm"
                onClick={() => setReplyTab("activity")}
              >
                Activité & Notes
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {replyTab === "activity" ? (
              <div className="space-y-3">
                {activityEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-2xl border border-slate-200 bg-white p-3"
                  >
                    <p className="text-sm font-medium text-slate-900">
                      {event.label}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {event.timestamp}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Longueur</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {lengthOptions.map((option) => (
                      <Button
                        key={option.id}
                        variant={lengthPreset === option.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setLengthPreset(option.id)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-500">Ton</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {toneOptions.map((option) => (
                      <Button
                        key={option.id}
                        variant={tonePreset === option.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTonePreset(option.id)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <textarea
                    className="min-h-[220px] w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700"
                    placeholder="Générer une réponse..."
                    value={replyText}
                    onChange={(event) => {
                      const next = event.target.value;
                      setReplyText(next);
                      if (selectedReview) {
                        setDrafts((prev) => ({ ...prev, [selectedReview.id]: next }));
                      }
                    }}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleGenerate} disabled={isGenerating || !selectedReview}>
                    {isGenerating ? "Génération..." : "Générer"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSave}
                    disabled={isGenerating || !selectedReview}
                  >
                    Sauvegarder
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSend}
                    disabled={isGenerating || !selectedReview}
                  >
                    Envoyer
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export { Inbox };
