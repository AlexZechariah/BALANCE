#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const versionFile = path.join(rootDir, 'version.json');

if (!fs.existsSync(versionFile)) {
  console.error(`Error: ${versionFile} not found`);
  process.exit(1);
}

const version = JSON.parse(fs.readFileSync(versionFile, 'utf8')).version;

if (!version || version === 'null') {
  console.error('Error: could not read version from version.json');
  process.exit(1);
}

console.log(`Bumping all packages to ${version}\n`);

// 1. Update all 9 package.json files
const packageFiles = [
  ['apps/web', path.join(rootDir, 'apps/web/package.json')],
  ['apps/api', path.join(rootDir, 'apps/api/package.json')],
  ['apps/desktop', path.join(rootDir, 'apps/desktop/package.json')],
  ['packages/ui', path.join(rootDir, 'packages/ui/package.json')],
  ['packages/utils', path.join(rootDir, 'packages/utils/package.json')],
  ['packages/config', path.join(rootDir, 'packages/config/package.json')],
  ['packages/db', path.join(rootDir, 'packages/db/package.json')],
  ['packages/schemas', path.join(rootDir, 'packages/schemas/package.json')],
  ['packages/types', path.join(rootDir, 'packages/types/package.json')],
];

packageFiles.forEach(([dir, pkgFile]) => {
  if (fs.existsSync(pkgFile)) {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    pkg.version = version;
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`  Updated ${dir}/package.json`);
  } else {
    console.error(`  WARNING: ${pkgFile} not found, skipping`);
  }
});

// 2. Update env.defaults.json
const envDefaultsFile = path.join(rootDir, 'packages/config/src/env.defaults.json');
if (fs.existsSync(envDefaultsFile)) {
  const envDefaults = JSON.parse(fs.readFileSync(envDefaultsFile, 'utf8'));
  envDefaults.appVersion = version;
  fs.writeFileSync(envDefaultsFile, JSON.stringify(envDefaults, null, 2) + '\n');
  console.log('  Updated packages/config/src/env.defaults.json');
} else {
  console.error(`  WARNING: ${envDefaultsFile} not found, skipping`);
}

// 3. Update main.py
const mainPy = path.join(rootDir, 'services/worker/app/main.py');
if (fs.existsSync(mainPy)) {
  let content = fs.readFileSync(mainPy, 'utf8');
  content = content.replace(/^VERSION = ".*"/m, `VERSION = "${version}"`);
  fs.writeFileSync(mainPy, content, 'utf8');
  console.log('  Updated services/worker/app/main.py');
} else {
  console.error(`  WARNING: ${mainPy} not found, skipping`);
}

// 4. Update static fallback defaults across the codebase
// These are used when the deploy pipeline doesn't pass APP_VERSION

const fallbackFiles = [
  // GitHub workflow files
  {
    file: '.github/workflows/ci.yml',
    fullPath: path.join(rootDir, '.github/workflows/ci.yml'),
    pattern: /(APP_VERSION: \${{ vars\.APP_VERSION \|\| ')\d+\.\d+\.\d+(' }})/,
  },
  // Docker Compose files
  {
    file: 'infra/compose/compose.local.yml',
    fullPath: path.join(rootDir, 'infra/compose/compose.local.yml'),
    pattern: /(APP_VERSION: \$\{APP_VERSION:-)\d+\.\d+\.\d+(\})/g,
  },
  {
    file: 'infra/compose/compose.ci-proof.yml',
    fullPath: path.join(rootDir, 'infra/compose/compose.ci-proof.yml'),
    pattern: /(APP_VERSION: \$\{APP_VERSION:-)\d+\.\d+\.\d+(\})/g,
  },
  // Env example
  {
    file: '.env.example',
    fullPath: path.join(rootDir, '.env.example'),
    pattern: /(APP_VERSION=)\d+\.\d+\.\d+/,
    replacement: `$1${version}`,
  },
  // Test file
  {
    file: 'packages/config/src/env.test.ts',
    fullPath: path.join(rootDir, 'packages/config/src/env.test.ts'),
    pattern: /(appVersion: ')\d+\.\d+\.\d+(')/,
  },
];

let fallbackCount = 0;
fallbackFiles.forEach(({ file, fullPath, pattern, replacement }) => {
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    const repl = replacement || `$1${version}$2`;
    const updated = content.replace(pattern, repl);
    if (updated !== content) {
      fs.writeFileSync(fullPath, updated, 'utf8');
      console.log(`  Updated ${file}`);
      fallbackCount++;
    } else {
      console.log(`  No change needed in ${file} (already ${version})`);
    }
  } else {
    console.error(`  WARNING: ${file} not found, skipping`);
  }
});

console.log(`\nDone. Version ${version} propagated to all files.`);
