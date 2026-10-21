import type * as Sentry from '@sentry/nextjs';

export function scrubSentryEvent<T extends Sentry.Event>(event: T): T {
  if (event.request) {
    if (event.request.url) {
      try {
        const url = new URL(event.request.url);
        event.request.url = `${url.origin}${url.pathname}`;
      } catch {
        event.request.url = '[redacted]';
      }
    }
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
  }
  delete event.user;
  delete event.extra;
  return event;
}

export function scrubSentryBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (breadcrumb.category === 'console') return null;
  if (breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') {
    const url = breadcrumb.data?.url;
    if (typeof url === 'string') {
      try {
        const parsed = new URL(url);
        breadcrumb.data = { url: `${parsed.origin}${parsed.pathname}`, method: breadcrumb.data?.method };
      } catch {
        breadcrumb.data = { url: '[redacted]' };
      }
    } else if (breadcrumb.data) {
      delete breadcrumb.data.body;
      delete breadcrumb.data.response;
      delete breadcrumb.data.headers;
    }
  }
  return breadcrumb;
}
