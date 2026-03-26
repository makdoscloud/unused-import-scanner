import type { ImportInfo, ImportType } from './types';

function getLineNumber(content: string, index: number): number {
  return content.substring(0, index).split('\n').length;
}

export function extractImports(content: string): Map<string, ImportInfo> {
  const imports = new Map<string, ImportInfo>();
  let m: RegExpExecArray | null;

  // import Default, { Named } from '...'
  const mixedRegex = /import\s+(\w+)\s*,\s*\{([^}]+)\}\s*from\s*['"`]([^'"`]+)['"`]/g;
  while ((m = mixedRegex.exec(content)) !== null) {
    const def = m[1].trim();
    const namedList = m[2];
    const fromPath = m[3];
    const line = getLineNumber(content, m.index);

    imports.set(def, { name: def, type: 'default', from: fromPath, line });

    for (const token of namedList.split(',').map((s) => s.trim())) {
      if (!token) continue;
      const parts = token.split(/\s+as\s+/);
      const local = (parts[1] ?? parts[0]).trim();
      imports.set(local, {
        name: local,
        type: 'named',
        original: parts[0].trim(),
        from: fromPath,
        line,
      });
    }
  }

  // import { Named } from '...'
  const namedRegex = /import\s*\{([^}]+)\}\s*from\s*['"`]([^'"`]+)['"`]/g;
  while ((m = namedRegex.exec(content)) !== null) {
    const list = m[1];
    const fromPath = m[2];
    const line = getLineNumber(content, m.index);

    for (const token of list.split(',').map((s) => s.trim())) {
      if (!token) continue;
      const parts = token.split(/\s+as\s+/);
      const local = (parts[1] ?? parts[0]).trim();
      imports.set(local, {
        name: local,
        type: 'named',
        original: parts[0].trim(),
        from: fromPath,
        line,
      });
    }
  }

  // import Default from '...'
  const defaultRegex = /import\s+(\w+)\s+from\s*['"`]([^'"`]+)['"`]/g;
  while ((m = defaultRegex.exec(content)) !== null) {
    const name = m[1];
    const fromPath = m[2];
    if (!imports.has(name)) {
      imports.set(name, { name, type: 'default', from: fromPath, line: getLineNumber(content, m.index) });
    }
  }

  // import * as NS from '...'
  const nsRegex = /import\s+\*\s+as\s+(\w+)\s+from\s*['"`]([^'"`]+)['"`]/g;
  while ((m = nsRegex.exec(content)) !== null) {
    const name = m[1];
    const fromPath = m[2];
    imports.set(name, { name, type: 'namespace', from: fromPath, line: getLineNumber(content, m.index) });
  }

  // import '...' (side-effect)
  const sideEffectRegex = /import\s+['"`]([^'"`]+)['"`]/g;
  while ((m = sideEffectRegex.exec(content)) !== null) {
    const fromPath = m[1];
    const key = `__sideeffect__${fromPath}__${m.index}`;
    if (!imports.has(key)) {
      imports.set(key, { name: key, type: 'side-effect', from: fromPath, line: getLineNumber(content, m.index) });
    }
  }

  // require('...')
  const requireRegex = /require\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  while ((m = requireRegex.exec(content)) !== null) {
    const fromPath = m[1];
    const key = `__require__${fromPath}__${m.index}`;
    imports.set(key, { name: key, type: 'require', from: fromPath, line: getLineNumber(content, m.index) });
  }

  // import('...')
  const dynamicRegex = /import\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  while ((m = dynamicRegex.exec(content)) !== null) {
    const fromPath = m[1];
    const key = `__dynamic__${fromPath}__${m.index}`;
    imports.set(key, { name: key, type: 'dynamic', from: fromPath, line: getLineNumber(content, m.index) });
  }

  return imports;
}

const SIDE_EFFECT_TYPES = new Set<ImportType>(['side-effect', 'require', 'dynamic']);

export function extractUsedIdentifiers(
  content: string,
  imports: Map<string, ImportInfo>,
): Set<string> {
  const cleaned = content
    .replace(/import\s+.*?from\s*['"`][^'"`]+['"`];?/gs, '')
    .replace(/require\(.*?\)/g, '');

  const used = new Set<string>();

  for (const [importName, imp] of imports.entries()) {
    if (SIDE_EFFECT_TYPES.has(imp.type)) {
      used.add(importName);
      continue;
    }

    if (/^__/.test(importName)) continue;

    const patterns = [
      new RegExp(`\\b${importName}\\s*\\(`),
      new RegExp(`<${importName}([\\s/>])`),
      new RegExp(`</${importName}>`),
      new RegExp(`<${importName}\\s*/>`),
      new RegExp(`\\b${importName}\\s*\\.`),
      new RegExp(`\\b${importName}\\b(?!\\s*[:=])`),
      new RegExp(`[={]\\s*${importName}\\s*[,}]`),
      new RegExp(`[\\[,]\\s*${importName}\\s*[,\\]]`),
    ];

    for (const p of patterns) {
      if (p.test(cleaned)) {
        used.add(importName);
        break;
      }
    }
  }

  return used;
}
