"use client";

import { useEffect, useRef } from "react";
import type L from "leaflet";
import "leaflet/dist/leaflet.css";
import { matchRegionName } from "@/lib/frenchRegions";

type Props = {
  locations: string[];
  radiusKm: number | null;
};

const FRANCE_CENTER: [number, number] = [46.6, 2.4];

// Icone simple (point colore en CSS inline) plutot que les images par
// defaut de Leaflet : evite les soucis classiques de chemins d'assets
// casses une fois bundle par Next.js.
function makeDotIcon(leaflet: typeof L): L.DivIcon {
  return leaflet.divIcon({
    className: "",
    html: '<div style="width:14px;height:14px;border-radius:50%;background:#4f46e5;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.2);"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export default function LocationMap({ locations, radiusKm }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const leaflet = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = leaflet.map(containerRef.current).setView(FRANCE_CENTER, 5);
        leaflet
          .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 18,
          })
          .addTo(mapRef.current);
      }
      const map = mapRef.current;

      layerGroupRef.current?.clearLayers();
      const layerGroup = layerGroupRef.current ?? leaflet.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;

      if (locations.length === 0) {
        map.setView(FRANCE_CENTER, 5);
        return;
      }

      const bounds = leaflet.latLngBounds([]);

      await Promise.all(
        locations.map(async (loc) => {
          const regionName = matchRegionName(loc);
          if (regionName) {
            try {
              const res = await fetch(`https://geo.api.gouv.fr/regions?nom=${encodeURIComponent(regionName)}&fields=contour`);
              if (res.ok) {
                const data = (await res.json()) as Array<{ contour?: GeoJSON.Geometry }>;
                const contour = data[0]?.contour;
                if (contour && !cancelled) {
                  const geoLayer = leaflet.geoJSON(
                    { type: "Feature", geometry: contour, properties: {} } as GeoJSON.Feature,
                    { style: { color: "#4f46e5", weight: 2, fillOpacity: 0.1 } }
                  );
                  geoLayer.addTo(layerGroup);
                  bounds.extend(geoLayer.getBounds());
                  return;
                }
              }
            } catch {
              // Contour de region indisponible (reseau) : on l'ignore
              // silencieusement, les autres localisations restent affichees.
            }
            return;
          }

          try {
            const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(loc)}&limit=1`);
            if (!res.ok || cancelled) return;
            const json = (await res.json()) as { features?: Array<{ geometry?: { coordinates?: [number, number] } }> };
            const coords = json.features?.[0]?.geometry?.coordinates;
            if (!coords) return;
            const [lon, lat] = coords;

            leaflet.marker([lat, lon], { icon: makeDotIcon(leaflet) }).bindTooltip(loc).addTo(layerGroup);
            bounds.extend([lat, lon]);

            if (radiusKm && radiusKm > 0) {
              leaflet
                .circle([lat, lon], { radius: radiusKm * 1000, color: "#4f46e5", weight: 1, fillOpacity: 0.08 })
                .addTo(layerGroup);
            }
          } catch {
            // Ville non geocodee (reseau/introuvable) : ignoree, ne bloque
            // pas l'affichage des autres localisations.
          }
        })
      );

      if (!cancelled && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 11 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [locations, radiusKm]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="h-72 rounded-lg border border-slate-200" />;
}
