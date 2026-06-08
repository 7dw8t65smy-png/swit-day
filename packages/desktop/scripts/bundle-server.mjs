// Копирует собранный сервер (packages/server/dist) и его prod-зависимости
// в out/server. Без зависимостей packaged-приложение не сможет загрузить
// fastify / better-sqlite3 при child_process.fork().
/* global console */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(here, '..');
const repoRoot = resolve(desktopRoot, '../..');
const serverDist = resolve(desktopRoot, '../server/dist');
const sharedDist = resolve(desktopRoot, '../shared/dist');
const bundledServer = resolve(desktopRoot, 'out/server');
const serverPkg = JSON.parse(readFileSync(resolve(desktopRoot, '../server/package.json'), 'utf8'));

if (!existsSync(serverDist)) {
  throw new Error(
    `Server build is missing: ${serverDist}. Run "npm run build --workspace=@swit/server" first.`
  );
}

function rmSyncRetry(path) {
  for (let i = 0; i < 3; i++) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch (err) {
      if (i === 2 || err?.code !== 'ENOTEMPTY') throw err;
    }
  }
}

rmSyncRetry(bundledServer);
mkdirSync(bundledServer, { recursive: true });

// 1) JS сервера
cpSync(serverDist, bundledServer, { recursive: true });
writeFileSync(
  resolve(bundledServer, 'package.json'),
  JSON.stringify(
    {
      name: serverPkg.name,
      version: serverPkg.version,
      type: serverPkg.type ?? 'module',
      main: 'index.js'
    },
    null,
    2
  )
);

// 2) node_modules — берём из workspace-корня и из самого пакета сервера.
const serverNodeModules = resolve(desktopRoot, '../server/node_modules');
const rootNodeModules = resolve(repoRoot, 'node_modules');
const targetNm = resolve(bundledServer, 'node_modules');
mkdirSync(targetNm, { recursive: true });

const required = new Set(Object.keys(serverPkg.dependencies ?? {}));
required.delete('@swit/shared'); // копируется отдельно

function copyDepWithTree(name, visited = new Set()) {
  if (visited.has(name)) return;
  visited.add(name);
  const candidates = [resolve(serverNodeModules, name), resolve(rootNodeModules, name)];
  const src = candidates.find((p) => existsSync(p));
  if (!src) {
    console.warn(`[bundle-server] dep not found: ${name}`);
    return;
  }
  const dst = resolve(targetNm, name);
  if (existsSync(dst)) return;
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true });
  try {
    const depPkg = JSON.parse(readFileSync(resolve(src, 'package.json'), 'utf8'));
    for (const sub of Object.keys(depPkg.dependencies ?? {})) {
      copyDepWithTree(sub, visited);
    }
  } catch {
    /* нет package.json — пропускаем */
  }
}

for (const name of required) copyDepWithTree(name);

// 3) @swit/shared — копируем уже собранный dist + минимальный package.json.
if (!existsSync(sharedDist)) {
  throw new Error(
    `@swit/shared dist is missing: ${sharedDist}. Run "npm run build --workspace=@swit/shared" first.`
  );
}
const sharedTarget = resolve(targetNm, '@swit/shared');
mkdirSync(sharedTarget, { recursive: true });
cpSync(sharedDist, resolve(sharedTarget, 'dist'), { recursive: true });
const sharedPkg = JSON.parse(readFileSync(resolve(desktopRoot, '../shared/package.json'), 'utf8'));
writeFileSync(
  resolve(sharedTarget, 'package.json'),
  JSON.stringify(
    {
      name: sharedPkg.name,
      version: sharedPkg.version,
      type: sharedPkg.type ?? 'module',
      main: sharedPkg.main ?? 'dist/index.js',
      types: sharedPkg.types ?? 'dist/index.d.ts'
    },
    null,
    2
  )
);

console.log(`[bundle-server] ok → ${bundledServer}`);
