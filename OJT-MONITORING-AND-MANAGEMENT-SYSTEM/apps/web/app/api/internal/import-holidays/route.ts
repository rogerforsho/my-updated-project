import { timingSafeEqual } from 'node:crypto';
import { getServiceClient } from '@/src/lib/supabase/service';
import { isoDate } from '@/src/lib/manila-date';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function sameSecret(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Imports Philippine national holidays (Nager.Date) as global Non-Working Days, once per year:
// a year that already has a 'nager' row is skipped, so days the Super Admin deleted stay deleted.
// shortcut: later Nager changes to an imported year are ignored, add a dismissed-days list if that matters.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'Worker is not configured.' }, { status: 503 });
  if (!sameSecret(request.headers.get('authorization') || '', `Bearer ${secret}`))
    return Response.json({ error: 'Unauthorized.' }, { status: 401, headers: NO_STORE });

  const service = getServiceClient();
  const thisYear = Number(isoDate(new Date()).slice(0, 4));
  const imported: Record<number, number> = {};
  const skipped: number[] = [];
  const failed: number[] = [];

  for (const year of [thisYear, thisYear + 1]) {
    const { data: existing, error } = await service
      .from('non_working_days')
      .select('day_date, source')
      .eq('scope', 'global')
      .gte('day_date', `${year}-01-01`)
      .lte('day_date', `${year}-12-31`);
    if (error) { failed.push(year); continue; }
    if (existing?.some(r => r.source === 'nager')) { skipped.push(year); continue; }

    let holidays: unknown;
    try {
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/PH`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`Nager.Date returned ${res.status}`);
      holidays = await res.json();
      if (!Array.isArray(holidays)) throw new Error('Unexpected Nager.Date response');
    } catch {
      failed.push(year);
      continue;
    }

    const taken = new Set((existing ?? []).map(r => r.day_date as string));
    const rows: { day_date: string; scope: 'global'; label: string; source: 'nager' }[] = [];
    for (const item of holidays as { date?: unknown; name?: unknown }[]) {
      const date = typeof item?.date === 'string' ? item.date : '';
      const label = typeof item?.name === 'string' ? item.name.trim().slice(0, 150) : '';
      if (!ISO_DATE.test(date) || !date.startsWith(`${year}-`) || !label || taken.has(date)) continue;
      taken.add(date);
      rows.push({ day_date: date, scope: 'global', label, source: 'nager' });
    }
    if (!rows.length) continue;

    const { error: insertError } = await service.from('non_working_days').insert(rows);
    if (insertError) failed.push(year);
    else imported[year] = rows.length;
  }

  return Response.json({ imported, skipped, failed }, { status: 200, headers: NO_STORE });
}

export const GET = POST; // Vercel Cron issues GET
