'use client';

import React, { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { MapCompanyItem } from '@/src/services/companies';
import {
  Building2,
  Users,
  Search,
  CheckCircle2,
  AlertTriangle,
  Phone,
  Mail,
  MapPin,
  ExternalLink,
  ShieldCheck,
  X,
  Compass,
} from '@/src/components/ui/Icons';

const LeafletDeploymentMap = dynamic(
  () => import('@/src/components/map/LeafletDeploymentMap'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[520px] bg-slate-100 dark:bg-slate-800 animate-pulse rounded-2xl flex flex-col items-center justify-center text-slate-400 gap-3 border border-slate-200 dark:border-slate-700">
        <div className="w-8 h-8 border-3 border-[#0A3824] dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Loading Regional Deployment &amp; Workplace Radar...
        </span>
      </div>
    ),
  }
);

interface Props {
  initialCompanies: MapCompanyItem[];
  userRole: string;
}

export default function DeploymentMapClient({ initialCompanies, userRole }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'geofenced' | 'pending'>('all');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    initialCompanies.length > 0 ? initialCompanies[0].company_id : null
  );

  // Filter companies
  const filteredCompanies = useMemo(() => {
    return initialCompanies.filter((c) => {
      const matchesSearch =
        c.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.contact_person.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === 'geofenced') {
        return c.geofence_enabled && c.latitude != null && c.longitude != null;
      }
      if (statusFilter === 'pending') {
        return !c.geofence_enabled || c.latitude == null || c.longitude == null;
      }

      return true;
    });
  }, [initialCompanies, searchQuery, statusFilter]);

  // Selected company object
  const selectedCompany = useMemo(() => {
    if (!selectedCompanyId) return null;
    return initialCompanies.find((c) => c.company_id === selectedCompanyId) || null;
  }, [initialCompanies, selectedCompanyId]);

  // Statistics
  const totalCompanies = initialCompanies.length;
  const geofencedCount = initialCompanies.filter(
    (c) => c.latitude != null && c.longitude != null && c.geofence_enabled
  ).length;
  const totalTrainees = initialCompanies.reduce(
    (acc, c) => acc + c.assigned_trainees.length,
    0
  );
  const coverageRate =
    totalCompanies > 0 ? Math.round((geofencedCount / totalCompanies) * 100) : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto page-fade-in">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#0A3824] text-[var(--cdm-sand)] flex items-center justify-center shadow-xs">
              <MapPin className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Regional Deployment &amp; Workplace Map
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Geospatial radar tracking partner training establishments (HTEs) and workplace perimeters across Rodriguez, Rizal &amp; NCR.
          </p>
        </div>

        {/* OJT Coordinator manage partner companies. */}
        {userRole === 'Coordinator' && (
          <Link
            href="/coordinator/companies"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] text-xs font-bold transition-all shadow-xs active:scale-95 self-start sm:self-auto"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Manage Establishments</span>
          </Link>
        )}
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Partner Companies</p>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white leading-tight mt-0.5">{totalCompanies}</h3>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">GPS Configured</p>
              <h3 className="text-xl font-bold text-emerald-600 dark:text-emerald-400 leading-tight mt-0.5">{geofencedCount}</h3>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Active Trainees</p>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white leading-tight mt-0.5">{totalTrainees}</h3>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Coverage Rate</p>
              <h3 className="text-xl font-bold text-amber-600 dark:text-amber-400 leading-tight mt-0.5">{coverageRate}%</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Controls Bar: Search & Status Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by company name, address, or focal person..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-[#0A3824] dark:focus:border-emerald-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-[#0A3824] text-[var(--cdm-sand)] font-semibold'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            All ({initialCompanies.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('geofenced')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              statusFilter === 'geofenced'
                ? 'bg-[#0A3824] text-[var(--cdm-sand)] font-semibold'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            GPS Mapped ({geofencedCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              statusFilter === 'pending'
                ? 'bg-[#0A3824] text-[var(--cdm-sand)] font-semibold'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            Pending ({initialCompanies.length - geofencedCount})
          </button>
        </div>
      </div>

      {/* Main Grid: Interactive Map + Selected Establishment Inspection Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Interactive Map Canvas */}
        <div className="lg:col-span-8 min-h-[540px] h-[540px] xl:h-[580px]">
          <LeafletDeploymentMap
            companies={filteredCompanies}
            selectedCompanyId={selectedCompanyId}
            onSelectCompany={(company) => setSelectedCompanyId(company.company_id)}
          />
        </div>

        {/* Right Column: Establishment Inspection & Trainee List */}
        <div className="lg:col-span-4 space-y-4">
          {selectedCompany ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs space-y-4">
              {/* Header */}
              <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Establishment Details
                    </span>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5 leading-snug">
                      {selectedCompany.company_name}
                    </h3>
                  </div>
                  {selectedCompany.geofence_enabled ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      {selectedCompany.geofence_radius_meters || 150}m Workplace Radius
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 shrink-0">
                      <AlertTriangle className="w-3 h-3" />
                      Unconfigured
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {selectedCompany.address}
                </p>
              </div>

              {/* Focal Person & Contact Details (Per Sir Nieves interview requirements) */}
              <div className="space-y-2 text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px] block">
                  HTE Focal Person &amp; Liaison
                </span>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 space-y-1.5">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {selectedCompany.contact_person || 'Not specified'}
                  </p>
                  {selectedCompany.contact_number && (
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                      <a href={`tel:${selectedCompany.contact_number}`} className="hover:underline">
                        {selectedCompany.contact_number}
                      </a>
                    </div>
                  )}
                  {selectedCompany.contact_email && (
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                      <a href={`mailto:${selectedCompany.contact_email}`} className="hover:underline truncate">
                        {selectedCompany.contact_email}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Coordinates & Navigation Link */}
              {selectedCompany.latitude != null && selectedCompany.longitude != null && (
                <div className="text-xs flex items-center justify-between text-slate-500 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/40">
                  <span className="font-mono text-[11px]">
                    {selectedCompany.latitude.toFixed(5)}, {selectedCompany.longitude.toFixed(5)}
                  </span>
                  <a
                    href={`https://www.google.com/maps?q=${selectedCompany.latitude},${selectedCompany.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    <span>External Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Active Deployed Trainees List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px]">
                    Assigned 4th-Year Interns
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {selectedCompany.assigned_trainees.length} Trainee{selectedCompany.assigned_trainees.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {selectedCompany.assigned_trainees.length === 0 ? (
                  <p className="text-xs text-slate-400 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-center">
                    No students currently assigned to this company.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {selectedCompany.assigned_trainees.map((trainee) => (
                      <div
                        key={trainee.student_id}
                        className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {trainee.full_name}
                          </p>
                          <p className="text-[10px] font-mono text-slate-400">
                            {trainee.student_number}
                          </p>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 shrink-0">
                          {trainee.course || 'BSIT'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center text-xs text-slate-400">
              <MapPin className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-600 dark:text-slate-300">No Establishment Selected</p>
              <p className="mt-1">Click any pin on the map to inspect its focal person, workplace radius, and intern roster.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
