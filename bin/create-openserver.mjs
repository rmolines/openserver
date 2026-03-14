#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const projectName = process.argv[2] || 'my-app';
const templateDir = path.resolve(import.meta.dirname, '..', 'template');
const targetDir = path.resolve(process.cwd(), projectName);

if (fs.existsSync(targetDir)) {
  console.error(`Error: directory "${projectName}" already exists.`);
  process.exit(1);
}

fs.cpSync(templateDir, targetDir, { recursive: true });

const pkgPath = path.join(targetDir, 'package.json');
const pkg = fs.readFileSync(pkgPath, 'utf8');
fs.writeFileSync(pkgPath, pkg.replace(/\{\{PROJECT_NAME\}\}/g, projectName));

execSync(`cd "${targetDir}" && bun install`, { stdio: 'inherit' });

console.log(`
✓ Created ${projectName}

Next steps:
  cd ${projectName}
  bun run dev

Then open Claude Code and describe what you want to build.
`);
