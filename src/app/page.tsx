import type { ComponentType } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Search, Send, Users, Trophy, Sparkles, ArrowRight } from "lucide-react";
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
  const doneCount = onboardingSteps.length - remainingSteps.length;

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

  const firstName = profile?.fullName?.split(" ")[0];

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-900 px-6 py-10 sm:px-10 sm:py-14 text-white shadow-lg">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-white/5 blur-2xl" />
        <div className="relative">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide bg-white/15 rounded-full px-3 py-1">
            <Sparkles className="w-3.5 h-3.5" /> Assistant de recherche d&apos;alternance
          </p>
          <h1 className="mt-4 text-3xl sm:text-4xl font-semibold">
            {firstName ? `Bonjour ${firstName} 👋` : "Bienvenue sur MonAlternance"}
          </h1>
          <p className="mt-2 text-brand-100 max-w-xl">
            {toReview.length > 0
              ? `${toReview.length} offre${toReview.length > 1 ? "s" : ""} correspondent bien à ton profil et attendent d'être regardées.`
              : "Ton tableau de bord pour piloter ta recherche d'alternance de bout en bout."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/offers"
              className="inline-flex items-center gap-2 rounded-lg bg-white text-brand-700 px-4 py-2.5 text-sm font-semibold hover:bg-brand-50 transition-colors"
            >
              Voir mes offres <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/criteria"
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 text-white px-4 py-2.5 text-sm font-semibold hover:bg-white/20 transition-colors border border-white/20"
            >
              Ajuster mes critères
            </Link>
          </div>
        </div>
      </div>

      {remainingSteps.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-700">Pour démarrer</p>
            <span className="text-xs text-slate-400">{doneCount}/{onboardingSteps.length} étapes</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-4">
            <div
              className="h-full bg-brand-600 rounded-full transition-all"
              style={{ width: `${(doneCount / onboardingSteps.length) * 100}%` }}
            />
          </div>
          <ul className="space-y-2">
            {onboardingSteps.map((step) => (
              <li key={step.href}>
                <Link
                  href={step.href}
                  className={`flex items-center gap-2 text-sm ${step.done ? "text-slate-400" : "text-slate-700 hover:text-brand-600"}`}
                >
                  {step.done ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-300 shrink-0" />
                  )}
                  <span className={step.done ? "line-through" : ""}>{step.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Search} label="À regarder" value={toReview.length} color="text-brand-600 bg-brand-50" />
        <StatCard icon={Send} label="Postulé" value={applied} color="text-indigo-600 bg-indigo-50" />
        <StatCard icon={Users} label="Entretien" value={interview} color="text-purple-600 bg-purple-50" />
        <StatCard icon={Trophy} label="Offre reçue" value={offerReceived} color="text-green-600 bg-green-50" />
      </div>

      {/* Top offers */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-slate-700">Offres à fort potentiel, pas encore traitées</p>
          <Link href="/offers" className="text-xs text-brand-600 hover:underline shrink-0">
            Voir toutes les offres →
          </Link>
        </div>
        {topOffers.length === 0 ? (
          <p className="text-sm text-slate-500 py-2">
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
                className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-slate-50 border border-slate-100 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {offer.companyLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={offer.companyLogoUrl}
                      alt=""
                      className="w-9 h-9 rounded-lg object-contain bg-slate-50 border border-slate-100 shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center text-sm font-semibold shrink-0">
                      {(offer.company || offer.title).slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{offer.title}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {[offer.company, offer.location].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
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

      <p className="text-xs text-slate-400 text-center">
        {offers.length} offre(s) suivie(s) au total
        {lastFetch ? ` · dernière récupération le ${lastFetch.toLocaleDateString("fr-FR")}` : ""}.
      </p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="card p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-semibold text-slate-900 mt-3">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}
