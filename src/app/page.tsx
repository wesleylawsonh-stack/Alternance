import Link from "next/link";
import { prisma } from "@/lib/db";
import { asStringArray } from "@/lib/json";
import { isAnySourceConfigured } from "@/lib/offerSources";
import ScoreBadge from "@/components/ScoreBadge";
import RecommendationBadge from "@/components/RecommendationBadge";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [profile, criteria, offers] = await Promise.all([
    prisma.profile.findUnique({ where: { id: "singleton" } }),
    prisma.criteria.findUnique({ where: { id: "singleton" } }),
    prisma.offer.findMany({ orderBy: [{ matchScore: "desc" }, { fetchedAt: "desc" }] }),
  ]);

  const hasCv = Boolean(profile?.cvRawText);
  const hasCriteria = asStringArray(criteria?.jobTitles).length > 0;
  const hasSource = isAnySourceConfigured();
  const onboardingSteps = [
    { done: hasCv, label: "Importer ton CV", href: "/profile" },
    { done: hasCriteria, label: "Définir tes critères de recherche", href: "/criteria" },
    { done: hasSource, label: "Configurer une source d'offres (ou en ajouter manuellement)", href: "/integrations" },
  ];
  const remainingSteps = onboardingSteps.filter((s) => !s.done);

  const notApplied = offers.filter((o) => o.applicationStatus === "NOT_APPLIED");
  const toReview = notApplied.filter((o) => o.recommendation === "POSTULER" || o.recommendation === "CONSIDERER");
  const applied = offers.filter((o) => o.applicationStatus === "APPLIED").length;
  const interview = offers.filter((o) => o.applicationStatus === "INTERVIEW").length;
  const offerReceived = offers.filter((o) => o.applicationStatus === "OFFER").length;

  const topOffers = toReview.slice(0, 5);
  const lastFetch = offers.reduce<Date | null>((latest, o) => {
    if (!latest || o.fetchedAt > latest) return o.fetchedAt;
    return latest;
  }, null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          {profile?.fullName ? `Bonjour ${profile.fullName.split(" ")[0]}` : "Bienvenue sur MonAlternance"}
        </h1>
        <p className="text-slate-500 mt-1">Vue d&apos;ensemble de ta recherche d&apos;alternance.</p>
      </div>

      {remainingSteps.length > 0 && (
        <div className="card p-4">
          <p className="text-sm font-medium text-slate-700 mb-2">Pour démarrer :</p>
          <ul className="space-y-1.5">
            {remainingSteps.map((step) => (
              <li key={step.href}>
                <Link href={step.href} className="text-sm text-brand-600 hover:underline">
                  → {step.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="À regarder" value={toReview.length} />
        <StatCard label="Postulé" value={applied} />
        <StatCard label="Entretien" value={interview} />
        <StatCard label="Offre reçue" value={offerReceived} />
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-slate-700">Offres à fort potentiel, pas encore traitées</p>
          <Link href="/offers" className="text-xs text-brand-600 hover:underline">
            Voir toutes les offres →
          </Link>
        </div>
        {topOffers.length === 0 ? (
          <p className="text-sm text-slate-500">
            {offers.length === 0
              ? "Aucune offre pour l'instant."
              : "Rien de nouveau à regarder pour le moment, bravo !"}{" "}
            <Link href="/offers" className="text-brand-600 hover:underline">
              Récupérer des offres
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-2">
            {topOffers.map((offer) => (
              <Link
                key={offer.id}
                href={`/offers/${offer.id}`}
                className="flex items-center justify-between gap-3 p-2.5 rounded-lg hover:bg-slate-50 border border-slate-100"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{offer.title}</p>
                  <p className="text-xs text-slate-500 truncate">{[offer.company, offer.location].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ScoreBadge score={offer.matchScore} />
                  <RecommendationBadge recommendation={offer.recommendation} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">
        {offers.length} offre(s) suivie(s) au total
        {lastFetch ? ` · dernière récupération le ${lastFetch.toLocaleDateString("fr-FR")}` : ""}.
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4 text-center">
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}
