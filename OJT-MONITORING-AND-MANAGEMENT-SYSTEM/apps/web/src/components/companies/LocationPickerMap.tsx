'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';

interface LocationPickerMapProps {
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters?: number;
  initialSearchQuery?: string;
  onLocationChange: (lat: number, lng: number) => void;
  onRadiusChange: (radius: number) => void;
}

interface SearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

// Default fallback to Colegio de Montalban / Rodriguez, Rizal
const DEFAULT_LAT = 14.731358;
const DEFAULT_LNG = 121.137882;

// Custom modern SVG pin icon for Leaflet
const pinSvg = `
<svg width="36" height="46" viewBox="0 0 36 46" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M18 0C8.05888 0 0 8.05888 0 18C0 31.5 18 46 18 46C18 46 36 31.5 36 18C36 8.05888 27.9411 0 18 0Z" fill="#047857"/>
  <circle cx="18" cy="18" r="7" fill="white"/>
  <circle cx="18" cy="18" r="4" fill="#047857"/>
</svg>
`;

const customPinIcon = L.divIcon({
  html: `<div style="display:flex; justify-content:center; align-items:center; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));">${pinSvg}</div>`,
  className: 'custom-map-pin',
  iconSize: [36, 46],
  iconAnchor: [18, 46],
  popupAnchor: [0, -42],
});

export default function LocationPickerMap({
  latitude,
  longitude,
  radiusMeters = 150,
  initialSearchQuery = '',
  onLocationChange,
  onRadiusChange,
}: LocationPickerMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const effectiveLat = latitude ?? DEFAULT_LAT;
  const effectiveLng = longitude ?? DEFAULT_LNG;
  const hasCoordinates = latitude != null && longitude != null;

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [effectiveLat, effectiveLng],
      zoom: hasCoordinates ? 16 : 14,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Initial marker & circle
    if (hasCoordinates) {
      const marker = L.marker([effectiveLat, effectiveLng], {
        icon: customPinIcon,
        draggable: true,
      }).addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onLocationChange(parseFloat(pos.lat.toFixed(7)), parseFloat(pos.lng.toFixed(7)));
      });

      markerRef.current = marker;

      const circle = L.circle([effectiveLat, effectiveLng], {
        radius: radiusMeters,
        color: '#059669',
        fillColor: '#10B981',
        fillOpacity: 0.18,
        weight: 2,
        dashArray: '4, 6',
      }).addTo(map);

      circleRef.current = circle;
    }

    // Map click to place/move marker
    map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = parseFloat(e.latlng.lat.toFixed(7));
      const lng = parseFloat(e.latlng.lng.toFixed(7));
      onLocationChange(lat, lng);
    });

    mapInstanceRef.current = map;

    // Force map resize check to render tiles properly inside modal
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker and circle position when props change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (latitude != null && longitude != null) {
      const latLng: [number, number] = [latitude, longitude];

      if (markerRef.current) {
        markerRef.current.setLatLng(latLng);
      } else {
        const marker = L.marker(latLng, {
          icon: customPinIcon,
          draggable: true,
        }).addTo(map);

        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          onLocationChange(parseFloat(pos.lat.toFixed(7)), parseFloat(pos.lng.toFixed(7)));
        });

        markerRef.current = marker;
      }

      if (circleRef.current) {
        circleRef.current.setLatLng(latLng);
        circleRef.current.setRadius(radiusMeters);
      } else {
        const circle = L.circle(latLng, {
          radius: radiusMeters,
          color: '#059669',
          fillColor: '#10B981',
          fillOpacity: 0.18,
          weight: 2,
          dashArray: '4, 6',
        }).addTo(map);

        circleRef.current = circle;
      }
    } else {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      if (circleRef.current) {
        circleRef.current.remove();
        circleRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude, radiusMeters]);

  // Handle Search via OpenStreetMap Nominatim
  const handleSearch = useCallback(async (queryToSearch: string) => {
    const q = queryToSearch.trim();
    if (!q) return;

    setSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&countrycodes=ph`;
      const res = await fetch(url, {
        headers: {
          'Accept-Language': 'en',
        },
      });

      if (!res.ok) throw new Error('Search failed');

      const data: SearchResult[] = await res.json();
      if (data.length === 0) {
        // Retry globally without country code limitation if Philippines search was too specific
        const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`;
        const fallbackRes = await fetch(fallbackUrl);
        const fallbackData: SearchResult[] = await fallbackRes.json();
        if (fallbackData.length === 0) {
          setSearchError('No matching locations found. Try entering a broader street or city name.');
        } else {
          setSearchResults(fallbackData);
        }
      } else {
        setSearchResults(data);
      }
    } catch {
      setSearchError('Could not connect to map search service. Please click directly on the map.');
    } finally {
      setSearching(false);
    }
  }, []);

  const selectSearchResult = (item: SearchResult) => {
    const lat = parseFloat(parseFloat(item.lat).toFixed(7));
    const lng = parseFloat(parseFloat(item.lon).toFixed(7));
    onLocationChange(lat, lng);

    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([lat, lng], 17, { duration: 1.2 });
    }

    setSearchResults([]);
    setSearchQuery(item.display_name.split(',')[0] || item.display_name);
  };

  const presetRadii = [50, 100, 150, 250, 500];

  return (
    <div className="space-y-3">
      {/* Search Bar & Auto-Fill */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search company address or landmark..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch(searchQuery);
                }
              }}
              className="w-full text-xs sm:text-sm pl-8 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
            <span className="absolute left-2.5 top-2.5 text-slate-400 text-xs">🔍</span>
          </div>
          <button
            type="button"
            onClick={() => handleSearch(searchQuery)}
            disabled={searching || !searchQuery.trim()}
            className="px-3 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white rounded-lg transition-colors shrink-0"
          >
            {searching ? 'Searching...' : 'Search Pin'}
          </button>
          {initialSearchQuery && initialSearchQuery !== searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery(initialSearchQuery);
                handleSearch(initialSearchQuery);
              }}
              title="Search using the company address from the form above"
              className="px-2.5 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors shrink-0"
            >
              Use Address
            </button>
          )}
        </div>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-[1000] overflow-hidden max-h-56 overflow-y-auto">
            <div className="p-1.5 bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Select Matching Location
            </div>
            {searchResults.map((item) => (
              <button
                key={item.place_id}
                type="button"
                onClick={() => selectSearchResult(item)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 border-b border-slate-50 last:border-0 transition-colors flex items-start gap-2"
              >
                <span className="text-emerald-600 mt-0.5">📍</span>
                <span className="text-slate-700 line-clamp-2">{item.display_name}</span>
              </button>
            ))}
          </div>
        )}

        {searchError && (
          <p className="text-xs text-amber-600 mt-1 font-medium">{searchError}</p>
        )}
      </div>

      {/* Interactive Map Box */}
      <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-inner bg-slate-100">
        <div ref={mapContainerRef} className="w-full h-64 sm:h-72 z-0" />

        {/* Floating Instruction overlay */}
        <div className="absolute top-2 left-2 z-[400] bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-md text-[11px] text-slate-600 shadow-sm border border-slate-200/80 pointer-events-none flex items-center gap-1.5">
          <span>👆</span>
          <span>Click anywhere to place pin or drag marker</span>
        </div>

        {/* Active Geofence Badge Overlay */}
        {hasCoordinates && (
          <div className="absolute bottom-2 right-2 z-[400] bg-emerald-900/90 backdrop-blur-xs text-white px-2.5 py-1 rounded-md text-[11px] font-semibold shadow-md flex items-center gap-1.5 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Perimeter: {radiusMeters}m</span>
          </div>
        )}
      </div>

      {/* Radius Controls & Presets */}
      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-700">
            Workplace Perimeter Radius: <span className="text-emerald-700 font-bold">{radiusMeters} meters</span>
          </label>
          <div className="flex gap-1">
            {presetRadii.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRadiusChange(r)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                  radiusMeters === r
                    ? 'bg-emerald-600 text-white font-bold shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                {r}m{r === 150 ? ' (Std)' : ''}
              </button>
            ))}
          </div>
        </div>

        <input
          type="range"
          min="30"
          max="500"
          step="10"
          value={radiusMeters}
          onChange={(e) => onRadiusChange(parseInt(e.target.value, 10))}
          className="w-full accent-emerald-600 cursor-pointer"
        />

        {hasCoordinates ? (
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
            <span>
              Pinned at: <b>{latitude?.toFixed(6)}</b>, <b>{longitude?.toFixed(6)}</b>
            </span>
            <a
              href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-600 hover:underline font-medium"
            >
              Open in OpenStreetMap ↗
            </a>
          </div>
        ) : (
          <p className="text-[11px] text-amber-600 font-medium pt-1">
            ⚠️ No pin placed yet. Search an address above or click on the map.
          </p>
        )}
      </div>
    </div>
  );
}
