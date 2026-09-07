"use client";

import { usePathname } from "next/navigation";

// Remonte (via key={pathname}) a chaque changement de route pour rejouer
// l'animation d'entree douce (voir .page-enter dans globals.css) : sans ca,
// le wrapper persistant du layout ne se remonterait qu'au tout premier
// chargement de page, jamais lors d'une navigation cote client.
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
