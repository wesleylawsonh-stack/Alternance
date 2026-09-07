export default function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold">--%</span>;
  }

  const color =
    score >= 70
      ? "bg-green-100 text-green-800"
      : score >= 40
      ? "bg-amber-100 text-amber-800"
      : "bg-red-100 text-red-800";

  return <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${color}`}>{Math.round(score)}%</span>;
}
