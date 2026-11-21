'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import CoordinatorSectionNav from '@/src/components/coordinator/CoordinatorSectionNav';
import { listMapBranches, type MapBranch } from '@/src/services/companies';
import { listPendingCompanyRequests } from '@/src/services/companyRequests';
import { calculateDistanceInMeters, type DbCompanyRequest } from '@ojt/shared';
import type { PlacementRequestPin } from '@/src/components/companies/PlacementMap';

const PlacementMap = dynamic(() => import('@/src/components/companies/PlacementMap'), {
  ssr: false,
  loading: () => <div className="h-[28rem] w-full animate-pulse rounded-xl bg-slate-100" />,
});

// Colegio de Montalban, same default as LocationPickerMap.
const SCHOOL = { lat: 14.731358, lng: 121.137882 };
// A match farther than this is a same-named street in another province, not the student's HTE.
const MAX_MATCH_METERS = 50_000;
// OSM place_rank: 26+ street, building or point of interest; 18-25 barangay or neighbourhood; 12-17 town or city;
// below 12 is a province or region, whose centre says nothing about where the HTE is, so it is never plotted.
const STREET_RANK = 26;
const MIN_RANK = 12;
const BARANGAY_RANK = 18;

interface Match { lat: number; lng: number; name: string; precise: boolean; radius: number }
type Cache = Record<string, Match | null>;
const CACHE_KEY = 'placement-map-geocode-v2';

function readCache(): Cache {
  try { return JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? '{}'); } catch { return {}; }
}
function writeCache(cache: Cache) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* cache is optional */ }
}

// Nominatim policy: at most one request per second. Only real network calls wait; cache hits are instant.
let lastCall = 0;
async function search(q: string, cache: Cache): Promise<Match | null> {
  if (q in cache) return cache[q];
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((done) => setTimeout(done, wait));
  lastCall = Date.now();
  let match: Match | null = null;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&q=${encodeURIComponent(q)}`);
    if (res.ok) {
      const [hit] = await res.json() as { lat: string; lon: string; display_name: string; place_rank: number }[];
      const lat = Number(hit?.lat), lng = Number(hit?.lon);
      if (hit && hit.place_rank >= MIN_RANK && calculateDistanceInMeters(SCHOOL.lat, SCHOOL.lng, lat, lng) <= MAX_MATCH_METERS) {
        match = { lat, lng, name: hit.display_name, precise: hit.place_rank >= STREET_RANK, radius: hit.place_rank >= BARANGAY_RANK ? 1000 : 3000 };
      }
    } else return null; // not cached: a rate limit or outage should not be remembered as "no match"
  } catch { return null; }
  cache[q] = match;
  writeCache(cache);
  return match;
}

// Full addresses often match nothing, so retry once without the first segment (usually the street or building).
async function geocode(address: string, cache: Cache): Promise<Match | null> {
  const full = await search(address, cache);
  if (full) return full;
  const rest = address.split(',').slice(1).join(',').trim();
  const area = rest ? await search(rest, cache) : null;
  return area && { ...area, precise: false };
}

export default function PlacementMapPage() {
  const [branches, setBranches] = useState<MapBranch[]>([]);
  const [requests, setRequests] = useState<DbCompanyRequest[]>([]);
  const [located, setLocated] = useState<PlacementRequestPin[]>([]);
  const [failed, setFailed] = useState<DbCompanyRequest[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([listMapBranches(), listPendingCompanyRequests()]).then(([b, r]) => {
      if (b.data) setBranches(b.data); else setError(b.error?.message ?? 'Could not load branches.');
      if (r.data) setRequests(r.data); else setError((e) => e || (r.error?.message ?? 'Could not load requests.'));
      setLoaded(true);
    });
  }, []);

  // Results are published one at a time so pins appear while the rest are still being looked up.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cache = readCache();
      const pins: PlacementRequestPin[] = [];
      const misses: DbCompanyRequest[] = [];
      setProgress({ done: 0, total: requests.length });
      for (const [i, r] of requests.entries()) {
        if (cancelled) return;
        const address = (r.branch_address || r.company_address).trim();
        const hit = await geocode(address, cache);
        if (cancelled) return;
        if (hit) pins.push({ id: r.request_id, title: r.requested_company_name, address, lat: hit.lat, lng: hit.lng, matched: hit.name, precise: hit.precise, radius: hit.radius });
        else misses.push(r);
        setLocated([...pins]); setFailed([...misses]); setProgress({ done: i + 1, total: requests.length });
      }
    })();
    return () => { cancelled = true; };
  }, [requests]);

  const pinned = useMemo(() => branches.flatMap((b) => b.latitude != null && b.longitude != null ? [{
    id: b.branch_id, title: b.company_name, subtitle: b.branch_name, address: b.address,
    lat: b.latitude, lng: b.longitude, placed: b.placed, max: b.max_interns,
  }] : []), [branches]);
  const unpinned = branches.length - pinned.length;
  const exact = located.filter((p) => p.precise).length;

  return <main className="mx-auto max-w-5xl p-6 lg:p-8">
    <CoordinatorSectionNav section="partners" />
    <h1 className="text-2xl font-bold text-slate-900">HTE Map</h1>
    <p className="mt-1 text-sm text-slate-600">Where approved HTE branches are, and where students are asking to train.</p>
    {!!error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

    <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-600" aria-label="Map legend">
      <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-700" />Approved HTE branch ({pinned.length})</li>
      <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-amber-700 bg-amber-400" />Student request, street match ({exact})</li>
      <li className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-full border-2 border-dashed border-amber-700 bg-amber-100" />Student request, area only ({located.length - exact})</li>
      <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-700" />School, with 5 and 10 km rings</li>
    </ul>

    <p role="status" className="mt-2 h-4 text-xs text-slate-500">{progress.done < progress.total && `Locating student requests… ${progress.done} of ${progress.total}`}</p>
    <div className="mt-1"><PlacementMap branches={pinned} requests={located} /></div>

    {loaded && pinned.length === 0 && !error && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No approved branch has coordinates yet. Add them on the <Link href="/coordinator/branches" className="font-semibold text-emerald-800 underline">Branches</Link> page.</p>}
    {unpinned > 0 && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{unpinned} approved {unpinned === 1 ? 'branch has' : 'branches have'} no coordinates and {unpinned === 1 ? 'is' : 'are'} not shown. Set {unpinned === 1 ? 'its' : 'their'} location on the <Link href="/coordinator/branches" className="font-semibold underline">Branches</Link> page.</p>}

    {failed.length > 0 && <div className="mt-3 rounded-xl border bg-white p-4">
      <h2 className="text-sm font-bold text-slate-900">Could not place on the map</h2>
      <p className="mt-0.5 text-xs text-slate-500">The address was not found, or matched a place too far from the school. Review these on the <Link href="/coordinator/company-requests" className="font-semibold text-emerald-800 underline">Requests</Link> page.</p>
      <ul className="mt-2 space-y-1 text-sm text-slate-600">{failed.map((r) =>
        <li key={r.request_id}><b>{r.requested_company_name}</b> · {r.branch_address || r.company_address}</li>)}</ul>
    </div>}
    <p className="mt-3 text-xs text-slate-400">Student-request locations come from the address typed in the app and are estimates. Map data from OpenStreetMap contributors.</p>
  </main>;
}
