import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Readable } from 'node:stream';

export const dynamic = 'force-dynamic';

const GITHUB_RELEASES_URL =
  'https://github.com/rogerforsho/OJT-MONITORING-AND-MANAGEMENT-SYSTEM/releases';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  const installerNames = ['CdM-OJT-Portal-Setup-1.0.0.exe', 'CdM OJT Portal Setup 1.0.0.exe'];
  if (installerNames.includes(filename)) {
    // Check if compiled desktop installer exists locally in desktop dist or public/downloads
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

    return NextResponse.redirect(GITHUB_RELEASES_URL, 302);
  }

  return new NextResponse('File not found', { status: 404 });
}
