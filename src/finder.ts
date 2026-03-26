import fs from 'fs';
import path from 'path';
import { FILE_EXTENSIONS, EXCLUDE_DIRS, EXCLUDE_EXTENSIONS_IN_NAME } from './constants';
import { detectProjectType, getProjectConfig, readTsJsConfig } from './config';
import { resolveImportPath } from './resolver';
import { extractImports, extractUsedIdentifiers } from './extractor';
import type { FileInfo, ImportInfo, ProjectType, ProjectConfig, AnalysisResult, FinderOptions } from './types';

const IMPORT_FROM_REGEXES = [
  /import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g,
  /import\s*['"`]([^'"`]+)['"`]/g,
  /require\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  /import\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  // re-exports: export { X } from '...'  /  export * from '...'  /  export * as NS from '...'
  /export\s+(?:\*|\{[^}]*\})\s+(?:as\s+\w+\s+)?from\s+['"`]([^'"`]+)['"`]/g,
] as const;

export class UniversalUnusedFinder {
  readonly projectRoot: string;
  readonly projectType: ProjectType;

  private readonly config: ProjectConfig;
  private readonly aliases: Record<string, string>;
  private readonly baseUrl: string;
  private readonly silent: boolean;

  private allFiles = new Map<string, FileInfo>();
  private unusedImports = new Map<string, ImportInfo[]>();
  private unusedFiles: FileInfo[] = [];

  constructor(options: FinderOptions = {}) {
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.silent = options.silent ?? false;

    this.projectType = detectProjectType(this.projectRoot);
    this.config = getProjectConfig(this.projectType);

    const cfg = readTsJsConfig(this.projectRoot);
    this.aliases = cfg.paths;
    this.baseUrl = cfg.baseUrl ?? this.projectRoot;

    this.log(`Project type detected: ${this.projectType}`);
    const aliasKeys = Object.keys(this.aliases);
    if (aliasKeys.length > 0) this.log(`Path aliases found: ${aliasKeys.join(', ')}`);
  }

  private log(msg: string): void {
    if (!this.silent) console.log(msg);
  }

  private normalizeRel(p: string): string {
    return path.normalize(p).replace(/\\/g, '/');
  }

  private resolve(importPath: string, fromFile: string): string | null {
    return resolveImportPath(importPath, fromFile, this.projectRoot, this.aliases, this.baseUrl);
  }

  private getAllFiles(rootDir: string): string[] {
    const results: string[] = [];
    try {
      for (const ent of fs.readdirSync(rootDir, { withFileTypes: true })) {
        const full = path.join(rootDir, ent.name);
        if (ent.isDirectory()) {
          if (!(EXCLUDE_DIRS as readonly string[]).includes(ent.name)) {
            results.push(...this.getAllFiles(full));
          }
        } else if (ent.isFile() && (FILE_EXTENSIONS as readonly string[]).includes(path.extname(ent.name))) {
          results.push(full);
        }
      }
    } catch {
      // ignore unreadable dirs
    }
    return results;
  }

  private shouldExcludeFile(fileName: string, ext: string): boolean {
    for (const ex of EXCLUDE_EXTENSIONS_IN_NAME) {
      if (fileName.includes(ex)) return true;
    }
    if (!(FILE_EXTENSIONS as readonly string[]).includes(ext)) return true;
    if (this.config.excludeFiles.includes(fileName)) return true;
    return false;
  }

  private scanDirectory(dirPath: string): void {
    const fullDirPath = path.join(this.projectRoot, dirPath);
    if (!fs.existsSync(fullDirPath)) return;

    for (const fp of this.getAllFiles(fullDirPath)) {
      const rel = path.relative(this.projectRoot, fp);
      const fileName = path.basename(fp);
      const ext = path.extname(fp);
      if (this.shouldExcludeFile(fileName, ext)) continue;
      const key = this.normalizeRel(rel);
      this.allFiles.set(key, { fullPath: fp, relativePath: key, fileName, directory: dirPath });
    }
  }

  private buildFileGraph(): Set<string> {
    const usedFiles = new Set<string>();

    // Next.js: route files are always used (framework auto-routing)
    if (this.projectType === 'nextjs') {
      const NEXTJS_ROUTE_FILES = new Set([
        'page.js', 'page.jsx', 'page.ts', 'page.tsx',
        'layout.js', 'layout.jsx', 'layout.ts', 'layout.tsx',
        'loading.js', 'loading.jsx', 'loading.ts', 'loading.tsx',
        'error.js', 'error.jsx', 'error.ts', 'error.tsx',
        'not-found.js', 'not-found.jsx', 'not-found.ts', 'not-found.tsx',
        'template.js', 'template.jsx', 'template.ts', 'template.tsx',
        'route.js', 'route.ts',
        'middleware.js', 'middleware.ts',
      ]);
      for (const [key, fileInfo] of this.allFiles.entries()) {
        const inRouteDir =
          key.startsWith('pages/') || key.startsWith('app/') ||
          key.startsWith('src/pages/') || key.startsWith('src/app/');
        if (inRouteDir || NEXTJS_ROUTE_FILES.has(fileInfo.fileName)) {
          usedFiles.add(key);
        }
      }
    }

    // Mark known entry points as used
    for (const file of this.config.mainFiles) {
      const key = this.normalizeRel(file);
      if (this.allFiles.has(key)) usedFiles.add(key);
    }

    // Traverse all imports in all files
    for (const fileInfo of this.allFiles.values()) {
      try {
        const content = fs.readFileSync(fileInfo.fullPath, 'utf8');
        for (const regex of IMPORT_FROM_REGEXES) {
          const re = new RegExp(regex.source, regex.flags);
          let m: RegExpExecArray | null;
          while ((m = re.exec(content)) !== null) {
            const importPath = m[1];
            if (!importPath) continue;
            const resolved = this.resolve(importPath, fileInfo.fullPath);
            if (resolved) usedFiles.add(this.normalizeRel(resolved));
          }
        }
      } catch {
        // ignore unreadable files
      }
    }

    return usedFiles;
  }

  analyze(): AnalysisResult {
    this.allFiles.clear();
    this.unusedImports.clear();
    this.unusedFiles = [];

    // Collect all files
    for (const dir of this.config.scanDirectories) this.scanDirectory(dir);

    // Also register main files (even if outside scan dirs)
    for (const file of this.config.mainFiles) {
      const fp = path.join(this.projectRoot, file);
      if (fs.existsSync(fp)) {
        const rel = this.normalizeRel(path.relative(this.projectRoot, fp));
        if (!this.allFiles.has(rel)) {
          this.allFiles.set(rel, {
            fullPath: fp,
            relativePath: rel,
            fileName: path.basename(fp),
            directory: 'root',
          });
        }
      }
    }

    // Unused files
    const usedFiles = this.buildFileGraph();
    for (const [key, fileInfo] of this.allFiles.entries()) {
      if (usedFiles.has(key)) continue;
      if (this.projectType === 'nextjs' && (key.startsWith('pages/') || key.startsWith('app/'))) continue;
      this.unusedFiles.push(fileInfo);
    }

    // Unused imports
    for (const [rel, fileInfo] of this.allFiles.entries()) {
      try {
        const content = fs.readFileSync(fileInfo.fullPath, 'utf8');
        const imports = extractImports(content);
        const usedIdentifiers = extractUsedIdentifiers(content, imports);

        const unused: ImportInfo[] = [];
        for (const [impName, imp] of imports.entries()) {
          if (imp.type === 'side-effect' || imp.type === 'require' || imp.type === 'dynamic') continue;
          if (!usedIdentifiers.has(impName)) unused.push(imp);
        }

        if (unused.length > 0) this.unusedImports.set(rel, unused);
      } catch {
        // ignore unreadable files
      }
    }

    return {
      projectType: this.projectType,
      totalFiles: this.allFiles.size,
      unusedFiles: this.unusedFiles.map((f) => f.relativePath),
      unusedImports: Array.from(this.unusedImports.entries()).map(([file, imports]) => ({
        file,
        imports,
      })),
    };
  }

  printResults(writeJson = false): AnalysisResult {
    this.log(`\nAnalyzing ${this.projectType.toUpperCase()} project...\n`);

    const result = this.analyze();

    // Unused files
    if (this.unusedFiles.length > 0) {
      this.log(`${this.unusedFiles.length} unused file(s) found:\n`);
      const grouped: Record<string, FileInfo[]> = {};
      for (const f of this.unusedFiles) {
        (grouped[f.directory] ??= []).push(f);
      }
      for (const dir of Object.keys(grouped).sort()) {
        this.log(`${dir}/`);
        for (const f of grouped[dir].sort((a, b) => a.fileName.localeCompare(b.fileName))) {
          this.log(`   • ${f.relativePath}`);
        }
        this.log('');
      }
    } else {
      this.log('All files are in use!\n');
    }

    // Unused imports
    if (this.unusedImports.size > 0) {
      this.log(`Unused imports found in ${this.unusedImports.size} file(s):\n`);
      for (const [filePath, imports] of this.unusedImports.entries()) {
        this.log(`${filePath}`);
        for (const imp of imports) {
          this.log(`   • ${imp.name} (line ${imp.line}) - from '${imp.from}'`);
        }
        this.log('');
      }
    } else {
      this.log('All imports are in use!\n');
    }

    // Summary
    this.log('Summary:');
    this.log(`   Project type: ${this.projectType}`);
    this.log(`   Total files: ${this.allFiles.size}`);
    this.log(`   Unused files: ${this.unusedFiles.length}`);
    this.log(`   Files with unused imports: ${this.unusedImports.size}`);
    const totalUnusedImports = Array.from(this.unusedImports.values()).reduce((n, l) => n + l.length, 0);
    this.log(`   Total unused imports: ${totalUnusedImports}`);

    this.log('\nTips:');
    const tips: Record<string, string> = {
      'react-native': "React import may not be needed with React 0.17+.",
      nextjs: "Next.js files in pages/ or app/ are auto-routed by the framework.",
      react: "Unused helpers can be removed by tree-shaking.",
      generic: "Back up with git before deleting files.",
    };
    this.log(`   • ${tips[this.projectType] ?? tips['generic']}`);

    if (writeJson) {
      const outPath = path.join(this.projectRoot, 'unused-report.json');
      try {
        fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
        this.log(`\nJSON report written to: ${outPath}`);
      } catch {
        console.warn('Failed to write JSON report');
      }
    }

    return result;
  }
}
