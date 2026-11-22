import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Readable } from 'node:stream';

export const dynamic = 'force-dynamic';

const REPO = 'rogerforsho/my-updated-project';

// Used only when the GitHub API is unreachable. shortcut: pinned to v1.0.0, so it goes stale
// after a new release; fine for an outage, upgrade if outages are common.
const FALLBACK_EXE_URL = `https://github.com/${REPO}/releases/download/v1.0.0/CdM-OJT-Portal-Setup-1.0.0.exe`;

const SETUP_EXE = { match: /Setup.*\.exe$/, fallback: FALLBACK_EXE_URL };

// Public filename -> which asset of the latest release serves it. Links use the unversioned
// names, so a new release needs no code change. The versioned names stay for old links.
const INSTALLERS: Record<string, { match: RegExp; fallback?: string }> = {
  'CdM-OJT-Portal-Setup.exe': SETUP_EXE,
  'CdM-OJT-Portal-Setup-1.0.0.exe': SETUP_EXE,
  'CdM OJT Portal Setup 1.0.0.exe': SETUP_EXE,
  'CdM-OJT-Portal.dmg': { match: /\.dmg$/ },
  'CdM-OJT-Portal.AppImage': { match: /\.AppImage$/ },
};

async function latestAssetUrl(match: RegExp): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 300 }, // unauthenticated API allows 60 requests/hour per IP
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const release = (await res.json()) as { assets?: { name: string; browser_download_url: string }[] };
    return release.assets?.find((asset) => match.test(asset.name))?.browser_download_url ?? null;
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const installer = Object.hasOwn(INSTALLERS, filename) ? INSTALLERS[filename] : null;
  if (!installer) return new NextResponse('File not found', { status: 404 });

  if (filename.endsWith('.exe')) {
    // A locally built installer wins (local dev); on Vercel none of these exist.
    const possiblePaths = [
      path.join(process.cwd(), 'public', 'downloads', filename),
      path.join(process.cwd(), '..', 'desktop', 'dist', filename),
      path.join(process.cwd(), '..', 'desktop', 'dist', 'CdM-OJT-Portal-Setup-1.0.0.exe'),
      path.join(process.cwd(), '..', 'desktop', 'dist', 'CdM OJT Portal Setup 1.0.0.exe'),
    ];

    for (const localPath of possiblePaths) {
      if (fs.existsSync(localPath)) {
        const stats = fs.statSync(localPath);
        if (!stats.isFile()) continue;
        const fileStream = fs.createReadStream(localPath);
        return new NextResponse(Readable.toWeb(fileStream) as ReadableStream<Uint8Array>, {
          headers: {
            'Content-Type': 'application/vnd.microsoft.portable-executable',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': stats.size.toString(),
          },
        });
      }
    }
  }

  // The asset URL is a direct file, so the browser downloads it instead of showing a GitHub page.
  const url = (await latestAssetUrl(installer.match)) ?? installer.fallback;
  if (!url) return new NextResponse('This installer has not been released yet', { status: 404 });
  return NextResponse.redirect(url, 302);
}
