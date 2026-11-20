import type { NextConfig } from 'next';

const config: NextConfig = {
  // PGlite ships WASM and data files that must be loaded from node_modules at runtime.
  serverExternalPackages: ['@electric-sql/pglite'],
  // Demo previews run the embedded database on Vercel: ship its WASM/data files and
  // the SQL migrations with every function (they are read from disk at runtime).
  outputFileTracingIncludes: {
    '/**': [
      './drizzle/**/*',
      './node_modules/@electric-sql/pglite/dist/pglite.wasm',
      './node_modules/@electric-sql/pglite/dist/pglite.data',
      './node_modules/@electric-sql/pglite/dist/initdb.wasm'
    ]
  },
  poweredByHeader: false
};

export default config;
