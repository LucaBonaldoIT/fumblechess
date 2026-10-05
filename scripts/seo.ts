import type { Plugin } from 'vite';
import { aboutHtml } from '../src/ui/about';

export const DEFAULT_SITE_URL = 'https://fumblechess.lucabonaldo.dev';

/**
 * SEO build step:
 *  - replaces __SITE_URL__ in index.html (canonical, Open Graph, JSON-LD) with SITE_URL
 *  - writes the About section into the static HTML, so crawlers and link previews see real content
 *    without running JavaScript (the app mounts into #app and leaves it alone)
 *  - emits robots.txt and sitemap.xml
 * Override the address with `SITE_URL=https://example.com npm run build`.
 */
export function seo(siteUrl = process.env.SITE_URL ?? DEFAULT_SITE_URL): Plugin {
  const url = siteUrl.replace(/\/$/, '');
  return {
    name: 'fumblechess-seo',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replaceAll('__SITE_URL__', url).replace('<!--ABOUT-->', aboutHtml),
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${url}/sitemap.xml\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${url}/</loc>
    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`,
      });
    },
  };
}
