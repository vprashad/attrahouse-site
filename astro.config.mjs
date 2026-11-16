// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://attrahouse.com',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // English at the root, Bahasa Melayu under /ms/. BM pages are added once the copy has a native check.
  i18n: {
    locales: ['en', 'ms'],
    defaultLocale: 'en',
    routing: { prefixDefaultLocale: false },
  },
});
