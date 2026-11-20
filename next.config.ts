import type { NextConfig } from 'next';

const config: NextConfig = {
  // PGlite ships WASM and data files that must be loaded from node_modules at runtime.
  serverExternalPackages: ['@electric-sql/pglite'],
  poweredByHeader: false
};

export default config;
