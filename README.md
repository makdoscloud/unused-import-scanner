# unused-import-scanner

A zero-dependency CLI tool that finds unused files and unused imports in JavaScript/TypeScript projects. Supports React, React Native, Next.js, and generic JS/TS projects.

Built by [Makdos](https://makdos.com/en/) — software products crafted for modern teams.

## Features

- Detects **unused files** — source files that are never imported anywhere
- Detects **unused imports** — imported identifiers that are never referenced in the file
- Automatically identifies your project type (React, React Native, Next.js, generic)
- Resolves TypeScript/JavaScript path aliases (`@/components`, `~`, etc.) from `tsconfig.json` / `jsconfig.json`
- Supports all import styles: named, default, namespace, dynamic `import()`, `require()`
- Zero runtime dependencies — uses only Node.js built-ins
- Can also be used programmatically as a library

---

## Installation

### Global (recommended for CLI usage)

```bash
npm install -g unused-import-scanner
```

### Local (as a dev dependency)

```bash
npm install --save-dev unused-import-scanner
```

---

## CLI Usage

```bash
# Scan the current directory
unusedfinder

# Scan a specific project directory
unusedfinder /path/to/your/project

# Output results as a JSON report (unused-report.json)
unusedfinder --json

# Combine path and JSON output
unusedfinder /path/to/your/project --json
```

### Example output

```
Analyzing REACT project...

2 unused file(s) found:

components/
   • components/OldButton.tsx
   • components/LegacyModal.tsx

Unused imports found in 3 file(s):

src/screens/Home.tsx
   • formatDate (line 4) - from '../utils/date'
   • colors (line 5) - from '../constants/theme'

Summary:
   Project type: react
   Total files: 47
   Unused files: 2
   Files with unused imports: 3
   Total unused imports: 5

Tips:
   • Unused helpers can be removed by tree-shaking.
```

### JSON report format

Running with `--json` writes `unused-report.json` to the scanned project root:

```json
{
  "projectType": "react",
  "totalFiles": 47,
  "unusedFiles": [
    "components/OldButton.tsx",
    "components/LegacyModal.tsx"
  ],
  "unusedImports": [
    {
      "file": "src/screens/Home.tsx",
      "imports": [
        { "name": "formatDate", "type": "named", "from": "../utils/date", "line": 4 },
        { "name": "colors", "type": "named", "from": "../constants/theme", "line": 5 }
      ]
    }
  ]
}
```

---

## Programmatic Usage

You can also import and use the scanner directly in your code:

```typescript
import { UniversalUnusedFinder } from 'unused-import-scanner';

// Basic usage — returns the analysis result
const finder = new UniversalUnusedFinder({
  projectRoot: '/path/to/your/project',
});

const result = finder.analyze();

console.log(result.projectType);   // 'react' | 'react-native' | 'nextjs' | 'generic'
console.log(result.totalFiles);    // number
console.log(result.unusedFiles);   // string[]
console.log(result.unusedImports); // Array<{ file: string; imports: ImportInfo[] }>
```

```typescript
// With options
const finder = new UniversalUnusedFinder({
  projectRoot: '/path/to/your/project',
  silent: true, // suppress all console output
});

// Print results to console and optionally write JSON
finder.printResults(true); // true = write unused-report.json
```

### Types

```typescript
type ProjectType = 'react-native' | 'nextjs' | 'react' | 'generic';

interface FinderOptions {
  projectRoot?: string; // defaults to process.cwd()
  silent?: boolean;     // suppress console output, default false
}

interface AnalysisResult {
  projectType: ProjectType;
  totalFiles: number;
  unusedFiles: string[];
  unusedImports: Array<{
    file: string;
    imports: ImportInfo[];
  }>;
}

interface ImportInfo {
  name: string;
  type: 'default' | 'named' | 'namespace' | 'side-effect' | 'require' | 'dynamic';
  from: string;
  line: number;
  original?: string; // for aliased imports: import { Foo as Bar }
}
```

---

## How it works

1. **Project detection** — reads `package.json` to determine project type and select appropriate scan directories and entry points
2. **File collection** — recursively scans configured directories, skipping `node_modules`, `dist`, test files, and framework entry points
3. **Import graph traversal** — builds a graph of all imports across all files to find which files are reachable from entry points
4. **Unused file detection** — files not reachable from any entry point are marked as unused
5. **Unused import detection** — for each file, extracts all imported identifiers and checks whether they appear in the file body

### Path alias resolution

The tool reads `tsconfig.json` or `jsconfig.json` and resolves configured `paths` and `baseUrl`. For example:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@components/*": ["src/components/*"]
    }
  }
}
```

Imports like `import Button from '@components/Button'` are correctly resolved.

---

## Supported file types

`.js` `.jsx` `.ts` `.tsx`

## Ignored directories

`node_modules` `.git` `.next` `build` `dist` `.expo` `coverage` `.parcel-cache`

## Ignored file patterns

Files containing `.test.`, `.spec.`, `_test.`, `_spec.` in their name are skipped.

---

## Requirements

- Node.js >= 16.0.0

---

## Authors

- **Berke Özenses** — [@berkeozenses](https://github.com/berkeozenses)
- **Utku Sezici** — [@utkusezici](https://github.com/utkusezici)

Made at [Makdos](https://makdos.com/en/)

## License

MIT
