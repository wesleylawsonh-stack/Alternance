// Bloc de base pour les etats de chargement (voir .skeleton dans
// globals.css). Composer plusieurs <Skeleton> pour imiter la forme reelle
// du contenu a venir (carte, ligne de texte, avatar...) plutot qu'un simple
// texte "Chargement..." : ca donne une impression de reactivite immediate
// et evite le "saut" visuel quand les vraies donnees arrivent.
export default function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

// Imite une carte de type "offre"/"candidature" (logo + titre + sous-titre
// + badges), le motif de carte le plus repandu sur le site.
export function SkeletonCard() {
  return (
    <div className="card p-4 flex items-center gap-4">
      <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full shrink-0" />
    </div>
  );
}

export function SkeletonCardList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// Imite un formulaire (titre de champ + saisie), le motif de page le plus
// repandu apres les listes de cartes (criteres, profil, integrations...).
export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <div className="card p-6 space-y-5">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}
