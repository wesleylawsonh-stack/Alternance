const RECOMMENDATION_CONFIG: Record<string, { emoji: string; label: string; className: string }> = {
  POSTULER: { emoji: "🟢", label: "A postuler", className: "bg-green-50 text-green-800" },
  CONSIDERER: { emoji: "🔵", label: "A considerer", className: "bg-blue-50 text-blue-800" },
  FAIBLE: { emoji: "🟠", label: "Faible priorite", className: "bg-amber-50 text-amber-800" },
  IGNORER: { emoji: "🔴", label: "A ignorer", className: "bg-red-50 text-red-700" },
};

export default function RecommendationBadge({ recommendation }: { recommendation: string | null }) {
  if (!recommendation) return null;
  const config = RECOMMENDATION_CONFIG[recommendation];
  if (!config) return null;

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${config.className}`}>
      <span>{config.emoji}</span>
      {config.label}
    </span>
  );
}
