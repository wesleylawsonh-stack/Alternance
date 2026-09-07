"use client";

import { useEffect } from "react";

// Enregistre le service worker minimal (voir public/sw.js), necessaire pour
// que Chrome/Android proposent d'installer le site comme application.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
