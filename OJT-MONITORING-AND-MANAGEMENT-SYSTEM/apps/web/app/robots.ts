import type { MetadataRoute } from 'next';

/**
 * Dynamic robots.txt generation for Colegio de Montalban OJT Management System.
 * Enforces strict compliance with the Data Privacy Act of 2012 (RA 10173):
 * Search engines are only permitted to crawl the public landing page and certificate verification.
 * All authenticated student records, supervisor evaluations, coordinator actions, and admin portals are disallowed.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ojt.cdm.edu.ph';

  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/verify-certificate', '/verify-certificate/*'],
      disallow: [
        '/student/',
        '/coordinator/',
        '/supervisor/',
        '/admin/',
        '/program-head/',
        '/dashboard/',
        '/settings/',
        '/auth/',
        '/downloads/',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
