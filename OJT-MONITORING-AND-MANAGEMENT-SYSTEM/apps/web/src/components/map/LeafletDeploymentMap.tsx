'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { MapCompanyItem } from '@/src/services/companies';

interface LeafletDeploymentMapProps {
  companies: MapCompanyItem[];
  selectedCompanyId: string | null;
  onSelectCompany: (company: MapCompanyItem) => void;
}

// Center point: Colegio de Montalban (Rodriguez, Rizal)
const CDM_COORDINATES: [number, number] = [14.731358, 121.137882];

function createPinIcon(isGeofenced: boolean, isSelected: boolean, traineesCount: number) {
  const pinColor = isSelected ? '#E4DBC4' : isGeofenced ? '#0A3824' : '#F59E0B';
  const textColor = isSelected ? '#092E1D' : '#FFFFFF';
  const strokeColor = isSelected ? '#0A3824' : '#FFFFFF';

  const badgeHtml = traineesCount > 0
    ? `<span style="position: absolute; top: -6px; right: -8px; background: #0A3824; color: #E4DBC4; border: 1.5px solid #FFFFFF; border-radius: 9999px; font-size: 10px; font-weight: 800; padding: 1px 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.25);">${traineesCount}</span>`
    : '';

  const pinSvg = `
    <div style="position: relative; display: flex; align-items: center; justify-content: center;">
      <svg width="34" height="44" viewBox="0 0 34 44" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
        <path d="M17 0C7.61116 0 0 7.61116 0 17C0 29.75 17 44 17 44C17 44 34 29.75 34 17C34 7.61116 26.3888 0 17 0Z" fill="${pinColor}" stroke="${strokeColor}" stroke-width="2"/>
        <circle cx="17" cy="17" r="8" fill="${textColor}"/>
        <circle cx="17" cy="17" r="4" fill="${pinColor}"/>
      </svg>
      ${badgeHtml}
    </div>
  `;

  return L.divIcon({
    html: pinSvg,
    className: 'custom-company-pin',
    iconSize: [34, 44],
    iconAnchor: [17, 44],
    popupAnchor: [0, -40],
  });
}

export default function LeafletDeploymentMap({
  companies,
  selectedCompanyId,
  onSelectCompany,
}: LeafletDeploymentMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const circlesLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: CDM_COORDINATES,
      zoom: 13,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);

    // College marker for institutional reference
    const cdmIcon = L.divIcon({
      html: `
        <div style="background: #092E1D; color: #E4DBC4; border: 2px solid #E4DBC4; border-radius: 12px; padding: 4px 8px; font-size: 11px; font-weight: 800; white-space: nowrap; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 4px;">
          <span>🏛️</span>
          <span>CdM Main Campus</span>
        </div>
      `,
      className: 'cdm-reference-marker',
      iconSize: [140, 30],
      iconAnchor: [70, 15],
    });

    L.marker(CDM_COORDINATES, { icon: cdmIcon, zIndexOffset: 1000 })
      .addTo(map)
      .bindPopup(`
        <div style="font-family: inherit; font-size: 12px; line-height: 1.4;">
          <strong style="color: #092E1D; font-size: 13px;">Colegio de Montalban</strong><br/>
          <span style="color: #64748B;">Kasiglahan Village, Rodriguez, Rizal</span><br/>
          <span style="display: inline-block; margin-top: 4px; padding: 2px 6px; background: #ECFDF5; color: #047857; border-radius: 4px; font-size: 10px; font-weight: 700;">Academic Center (ICS & IBE)</span>
        </div>
      `);

    markersLayerRef.current = L.layerGroup().addTo(map);
    circlesLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Markers & Geofences whenever companies or selectedCompanyId changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !markersLayerRef.current || !circlesLayerRef.current) return;

    markersLayerRef.current.clearLayers();
    circlesLayerRef.current.clearLayers();

    const validCompanies = companies.filter(
      (c) => c.latitude != null && c.longitude != null && !isNaN(c.latitude) && !isNaN(c.longitude)
    );

    const bounds = L.latLngBounds([CDM_COORDINATES]);

    validCompanies.forEach((company) => {
      const lat = company.latitude!;
      const lng = company.longitude!;
      const isSelected = company.company_id === selectedCompanyId;
      const isGeofenced = company.geofence_enabled;
      const traineeCount = company.assigned_trainees.length;

      bounds.extend([lat, lng]);

      // Circle perimeter for geofence
      if (isGeofenced) {
        const circle = L.circle([lat, lng], {
          radius: company.geofence_radius_meters || 150,
          color: isSelected ? '#0A3824' : '#059669',
          fillColor: isSelected ? '#0A3824' : '#10B981',
          fillOpacity: isSelected ? 0.28 : 0.15,
          weight: isSelected ? 2.5 : 1.5,
          dashArray: isSelected ? undefined : '5, 5',
        });
        circle.addTo(circlesLayerRef.current!);
      }

      // Marker
      const icon = createPinIcon(isGeofenced, isSelected, traineeCount);
      const marker = L.marker([lat, lng], {
        icon,
        zIndexOffset: isSelected ? 500 : traineeCount * 10,
      });

      marker.on('click', () => {
        onSelectCompany(company);
      });

      const traineesPreview = company.assigned_trainees.length > 0
        ? `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #334155;">
             <strong>${company.assigned_trainees.length} Active Trainee${company.assigned_trainees.length > 1 ? 's' : ''}:</strong>
             <ul style="margin: 4px 0 0 0; padding-left: 14px; max-height: 70px; overflow-y: auto;">
               ${company.assigned_trainees.slice(0, 3).map(t => `<li>${t.full_name} <span style="color: #64748B;">(${t.course})</span></li>`).join('')}
               ${company.assigned_trainees.length > 3 ? `<li style="color: #64748B;">+${company.assigned_trainees.length - 3} more...</li>` : ''}
             </ul>
           </div>`
        : '<p style="margin: 4px 0 0; font-size: 11px; color: #94A3B8;">No trainees currently assigned.</p>';

      const popupContent = `
        <div style="font-family: inherit; min-width: 200px; padding: 2px;">
          <h4 style="margin: 0; font-size: 13px; font-weight: 800; color: #0F172A;">${company.company_name}</h4>
          <p style="margin: 3px 0 0; font-size: 11px; color: #64748B;">${company.address}</p>
          <div style="margin-top: 6px; display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; ${
              isGeofenced
                ? 'background: #ECFDF5; color: #047857; border: 1px solid #A7F3D0;'
                : 'background: #FFFBEB; color: #B45309; border: 1px solid #FDE68A;'
            }">
              ${isGeofenced ? `📡 ${company.geofence_radius_meters}m Workplace Radius` : '⚠️ No GPS Coordinates'}
            </span>
          </div>
          ${traineesPreview}
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.addTo(markersLayerRef.current!);

      if (isSelected) {
        marker.openPopup();
      }
    });

    // If a specific company is selected, pan smoothly to it
    if (selectedCompanyId) {
      const sel = validCompanies.find((c) => c.company_id === selectedCompanyId);
      if (sel && sel.latitude != null && sel.longitude != null) {
        map.setView([sel.latitude, sel.longitude], 16, { animate: true });
      }
    }
  }, [companies, selectedCompanyId, onSelectCompany]);

  return (
    <div className="relative w-full h-full min-h-[520px] rounded-2xl overflow-hidden border border-slate-200/90 dark:border-slate-800 shadow-xs">
      <div ref={mapContainerRef} className="w-full h-full min-h-[520px] z-10" />

      {/* Map Legend Overlay */}
      <div className="absolute bottom-4 left-4 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl p-3 border border-slate-200/80 dark:border-slate-800 shadow-lg text-[11px] space-y-1.5 pointer-events-auto">
        <span className="font-bold text-slate-800 dark:text-white uppercase tracking-wider text-[10px] block mb-1">
          Map Legend
        </span>
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <span className="w-3 h-3 rounded-full bg-[#0A3824] border border-white shrink-0" />
          <span>Workplace Perimeter (150m Radius)</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <span className="w-3 h-3 rounded-full bg-amber-500 border border-white shrink-0" />
          <span>Coordinates Unset / Inactive</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <span className="w-3 h-3 rounded-full bg-[var(--cdm-sand)] border border-[#0A3824] shrink-0" />
          <span>Selected Establishment</span>
        </div>
      </div>
    </div>
  );
}
