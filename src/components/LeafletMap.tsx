'use client';

import { useEffect, useRef } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet references `window` at module scope, so it can only load in the
// browser — imported dynamically inside the effect (the page itself stays
// prerenderable). Marker icons point at the cdnjs copies, same fix as the
// old site (bundlers break Leaflet's bundled icon URLs).

export type MapMarker = {
  lat: number;
  lng: number;
  title?: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
};

type LeafletMapProps = {
  center: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  className?: string;
  scrollWheelZoom?: boolean;
};

export default function LeafletMap({
  center,
  zoom = 15,
  markers = [],
  className = 'h-52 w-full',
  scrollWheelZoom = false,
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = await import('leaflet');
      const container = containerRef.current;
      if (cancelled || !container || mapRef.current) return;

      const icon = L.icon({
        iconRetinaUrl:
          'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      const map = L.map(container, { scrollWheelZoom, zoomControl: true }).setView(center, zoom);
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      for (const m of markers) {
        const marker = L.marker([m.lat, m.lng], { icon }).addTo(map);
        if (m.title) {
          const link =
            m.href && m.linkLabel
              ? `<br/><a href="${m.href}" style="font-weight:600">${m.linkLabel}</a>`
              : '';
          marker.bindPopup(
            `<span style="font-weight:600">${m.title}</span>${m.subtitle ? `<br/><span>${m.subtitle}</span>` : ''}${link}`,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is initialized once; props are stable server-passed data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={className} />;
}
