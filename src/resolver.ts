import fs from 'fs';
import path from 'path';
import { FILE_EXTENSIONS } from './constants';

function tryResolveFile(base: string): string | null {
  try {
    if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  } catch {
    // ignore
  }
  for (const ext of FILE_EXTENSIONS) {
    if (fs.existsSync(base + ext)) return base + ext;
  }
  for (const ext of FILE_EXTENSIONS) {
    const idx = path.join(base, `index${ext}`);
    if (fs.existsSync(idx)) return idx;
  }
  return null;
}

export function resolveImportPath(
  importPath: string,
  fromFile: string,
  projectRoot: string,
  aliases: Record<string, string>,
  baseUrl: string,
): string | null {
  const fromDir = path.dirname(fromFile);

  const toRelative = (absolute: string) =>
    path.normalize(path.relative(projectRoot, absolute)).replace(/\\/g, '/');

  // Relative paths
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    const resolved = tryResolveFile(path.resolve(fromDir, importPath));
    return resolved ? toRelative(resolved) : null;
  }

  // Aliases from tsconfig/jsconfig (keys are pre-processed — /* suffix already stripped)
  for (const aliasKey of Object.keys(aliases)) {
    if (importPath === aliasKey || importPath.startsWith(aliasKey + '/')) {
      const withoutAlias = importPath.slice(aliasKey.length).replace(/^\//, '');
      const resolved = tryResolveFile(path.join(aliases[aliasKey], withoutAlias));
      if (resolved) return toRelative(resolved);
    }
  }

  // baseUrl absolute imports
  if (baseUrl) {
    const resolved = tryResolveFile(path.join(baseUrl, importPath));
    if (resolved) return toRelative(resolved);
  }

  // Project-root-relative paths starting with '/'
  if (importPath.startsWith('/')) {
    const resolved = tryResolveFile(path.join(projectRoot, importPath.replace(/^\//, '')));
    if (resolved) return toRelative(resolved);
  }

  return null; // external module
}
