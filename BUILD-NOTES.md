# Build Notes

## Memory Issues with Electron Build

The Electron build process requires significant memory (>16GB) due to the large `node_modules` directory (1.1GB+). If you encounter "JavaScript heap out of memory" errors:

### Option 1: Run Without Building (Recommended for Development)

Instead of building the Electron app, you can run it directly:

```bash
# Run in development mode
npm run dev

# Or run the pre-compiled app
npm start
```

### Option 2: Build on a Machine with More RAM

The build requires at least 16GB of available RAM. Consider:
- Closing other applications
- Using a machine with 32GB+ RAM
- Building on a CI/CD service (GitHub Actions, etc.)

### Option 3: Build Web Version Only

If you only need the web interface:

```bash
npm run build:web
```

This creates an optimized production build in the `dist/` directory without packaging Electron.

### Option 4: Increase Swap/Virtual Memory

On macOS:
1. Close unnecessary applications
2. Restart your machine to clear memory
3. Try building again

### Option 5: Use GitHub Actions (Recommended for Production)

For production builds, use CI/CD services that provide more memory:

```yaml
# .github/workflows/build.yml
name: Build
on: [push]
jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm run build
```

## Why Does This Happen?

Electron-builder needs to:
1. Copy all production dependencies
2. Rebuild native modules (like sqlite3)
3. Create the app bundle structure
4. Sign and notarize (on macOS)

With 1.1GB of node_modules, this exceeds typical memory limits. Future optimizations will reduce the package size.

## Temporary Workaround

For now, users can test Bridge by:
1. Running `npm run dev` (development mode)
2. Downloading pre-built releases from GitHub
3. Using the web version at `http://localhost:3000` (run `npm run server` and `npm run dev:web`)
