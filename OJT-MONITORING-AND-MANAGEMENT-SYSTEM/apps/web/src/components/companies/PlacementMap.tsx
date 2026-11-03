'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface PlacementBranchPin {
  id: string; title: string; subtitle: string; address: string; lat: number; lng: number; placed: number; max: number | null;
}
export interface PlacementRequestPin {
  id: string; title: string; address: string; lat: number; lng: number;
  matched: string; precise: boolean; // precise = street/building match; otherwise only a barangay/town centre
  radius: number; // metres of uncertainty drawn around an area-only match
}

// Colegio de Montalban, same default as LocationPickerMap.
const SCHOOL: [number, number] = [14.731358, 121.137882];

// Popup text comes from student-submitted requests, so it is escaped before it touches HTML.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const pin = (color: string, dashed = false) => L.divIcon({
  html: `<svg width="24" height="31" viewBox="0 0 36 46" fill="none"><path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 28 18 28s18-14.5 18-28C36 8.06 27.94 0 18 0Z" fill="${color}" ${dashed ? 'fill-opacity="0.75" stroke="#78350f" stroke-width="3" stroke-dasharray="4 3"' : 'stroke="white" stroke-width="2"'}/><circle cx="18" cy="18" r="6" fill="white"/></svg>`,
  className: 'custom-map-pin', iconSize: [24, 31], iconAnchor: [12, 31], popupAnchor: [0, -28],
});

export default function PlacementMap({ branches, requests }: { branches: PlacementBranchPin[]; requests: PlacementRequestPin[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const hteRef = useRef<L.LayerGroup | null>(null);
  const reqRef = useRef<L.LayerGroup | null>(null);
  const touched = useRef(false); // once the coordinator pans or zooms, stop re-fitting the view

  // Built once; pins are swapped in the effects below so results can arrive one by one without the map jumping.
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const map = L.map(el, { center: SCHOOL, zoom: 13 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);

    const school = L.layerGroup([
      L.marker(SCHOOL, { icon: pin('#1d4ed8') }).bindPopup('<b>Colegio de Montalban</b>'),
      L.circle(SCHOOL, { radius: 5000, color: '#1d4ed8', weight: 1, fill: false, dashArray: '4 6' }),
      L.circle(SCHOOL, { radius: 10000, color: '#1d4ed8', weight: 1, fill: false, dashArray: '4 6' }),
    ]).addTo(map);
    hteRef.current = L.layerGroup().addTo(map);
    reqRef.current = L.layerGroup().addTo(map);

    L.control.layers(undefined, {
      'Approved HTE branches': hteRef.current, 'Student-requested HTEs': reqRef.current, 'School and 5 / 10 km rings': school,
    }, { collapsed: true }).addTo(map);

    const stop = () => { touched.current = true; };
    for (const ev of ['mousedown', 'touchstart', 'wheel']) el.addEventListener(ev, stop, { passive: true });
    mapRef.current = map;
    const resize = setTimeout(() => map.invalidateSize(), 200);
    return () => { clearTimeout(resize); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    hteRef.current?.clearLayers();
    for (const b of branches) {
      L.marker([b.lat, b.lng], { icon: pin('#047857') }).bindPopup(
        `<b>${esc(b.title)}</b><br/>${esc(b.subtitle)}<br/>${esc(b.address)}<br/>Placed: ${b.placed}${b.max != null ? ` / ${b.max}` : ''}`,
      ).addTo(hteRef.current!);
    }
  }, [branches]);

  useEffect(() => {
    reqRef.current?.clearLayers();
    for (const r of requests) {
      // A coarse match is drawn as a wide area, never a pin, so it can't be mistaken for an exact spot.
      const popup = `<b>${esc(r.title)}</b><br/>${esc(r.address)}<br/><i>${r.precise ? 'Approximate street match' : 'Only the area could be found, not the exact spot'}: ${esc(r.matched)}</i><br/><a href="/coordinator/company-requests">Review request</a>`;
      (r.precise
        ? L.marker([r.lat, r.lng], { icon: pin('#f59e0b', true) })
        : L.circle([r.lat, r.lng], { radius: r.radius, color: '#b45309', weight: 2, dashArray: '4 6', fillColor: '#f59e0b', fillOpacity: 0.2 })
      ).bindPopup(popup).addTo(reqRef.current!);
    }
  }, [requests]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || touched.current) return;
    const pts = [...branches, ...requests].map((p) => [p.lat, p.lng] as [number, number]);
    if (pts.length) map.fitBounds(L.latLngBounds([SCHOOL, ...pts]), { padding: [30, 30], maxZoom: 15, animate: false });
  }, [branches, requests]);

  return <div ref={ref} className="h-[28rem] w-full rounded-xl border border-slate-200 bg-slate-100" />;
}
