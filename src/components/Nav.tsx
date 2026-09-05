"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/profile", label: "Profil" },
  { href: "/criteria", label: "Criteres" },
  { href: "/offers", label: "Offres" },
  { href: "/cv-history", label: "Mes CV" },
  { href: "/integrations", label: "Integrations" },
];

export default function Nav() {
  const pathname = usePathname();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        setPhotoUrl(data.profile?.photoUrl ?? null);
        setFullName(data.profile?.fullName ?? null);
      })
      .catch(() => {});
  }, [pathname]);

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <Link href="/offers" className="font-semibold text-brand-700 text-lg">
          MonAlternance
        </Link>
        <div className="flex items-center gap-3">
          <nav className="flex gap-1">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                    active ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <Link href="/profile" title="Profil">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-slate-200" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-xs font-semibold">
                {(fullName || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
