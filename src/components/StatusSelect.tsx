"use client";

export const STATUS_LABELS: Record<string, string> = {
  NOT_APPLIED: "Non postule",
  APPLIED: "Postule",
  INTERVIEW: "Entretien",
  OFFER: "Offre recue",
  REJECTED: "Refuse",
};

export const STATUS_COLORS: Record<string, string> = {
  NOT_APPLIED: "bg-slate-100 text-slate-700",
  APPLIED: "bg-blue-100 text-blue-800",
  INTERVIEW: "bg-purple-100 text-purple-800",
  OFFER: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

export default function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className={`text-xs font-semibold rounded-full px-2.5 py-1 border-0 cursor-pointer ${STATUS_COLORS[value] ?? STATUS_COLORS.NOT_APPLIED}`}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {Object.entries(STATUS_LABELS).map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}
