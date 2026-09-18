const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * Monorepo wiring for `@bikelab/shared` (T-2.1, docs/audit/layers/04-cross-layer.md
 * §6.2). `@bikelab/shared` is linked via `file:../packages/shared` in
 * package.json, so `node_modules/@bikelab/shared` resolves through its
 * `exports` map to the BUILT `dist` — run `npm run build` (or `npm run dev`
 * for a watcher) in `packages/shared` after changing its source, then
 * `react-native start --reset-cache`. `watchFolders` adds the shared
 * package's real directory to Metro's file watcher (it lives outside
 * `BikeLabApp/`, so Metro would otherwise ignore changes to it, including to
 * `dist` after a rebuild). `extraNodeModules` makes every other module
 * resolve from THIS app's node_modules even when required from within the
 * watched shared folder, so react/react-native are never duplicated.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../packages/shared');

const config = {
  watchFolders: [sharedRoot],
  resolver: {
    assetExts: ['db', 'mp3', 'ttf', 'obj', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'mov', 'avi', 'mkv', 'svg'],
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(projectRoot, '../node_modules'),
    ],
    // Deterministic resolution of the shared package: map `@bikelab/shared`
    // and `@bikelab/shared/<sub>` straight to the built CJS files instead of
    // relying on Metro's `exports`-map support (which failed to resolve the
    // `./*` subpath pattern in practice — "Unable to resolve module
    // @bikelab/shared/calc"). Requires `npm run build` in packages/shared
    // (the app's prestart/preios/preandroid scripts do this automatically).
    resolveRequest: (context, moduleName, platform) => {
      const pkg = '@bikelab/shared';
      if (moduleName === pkg || moduleName.startsWith(pkg + '/')) {
        const sub = moduleName === pkg ? 'index' : moduleName.slice(pkg.length + 1);
        const filePath = path.join(sharedRoot, 'dist', `${sub}.cjs`);
        if (!require('fs').existsSync(filePath)) {
          throw new Error(
            `[metro] ${moduleName} → ${filePath} not found. Run "npm run build" in packages/shared (or npm start, which does it).`,
          );
        }
        return { type: 'sourceFile', filePath };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
    extraNodeModules: new Proxy(
      {},
      {
        get: (target, name) => path.join(projectRoot, 'node_modules', name),
      },
    ),
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
