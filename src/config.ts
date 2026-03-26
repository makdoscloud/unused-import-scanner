import fs from 'fs';
import path from 'path';
import type { ProjectType, ProjectConfig, TsJsConfig } from './types';

function stripJsonComments(content: string): string {
  let result = '';
  let i = 0;
  const len = content.length;
  while (i < len) {
    if (content[i] === '"') {
      result += content[i++];
      while (i < len) {
        if (content[i] === '\\') {
          result += content[i++];
          if (i < len) result += content[i++];
        } else if (content[i] === '"') {
          result += content[i++];
          break;
        } else {
          result += content[i++];
        }
      }
    } else if (content[i] === '/' && content[i + 1] === '/') {
      while (i < len && content[i] !== '\n') i++;
    } else if (content[i] === '/' && content[i + 1] === '*') {
      i += 2;
      while (i < len && !(content[i] === '*' && content[i + 1] === '/')) i++;
      i += 2;
    } else {
      result += content[i++];
    }
  }
  return result;
}

export function detectProjectType(projectRoot: string): ProjectType {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  try {
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      if (deps['react-native'] || deps['expo']) return 'react-native';
      if (deps['next']) return 'nextjs';
      if (deps['react']) return 'react';
    }
  } catch {
    // ignore
  }
  return 'generic';
}

const PROJECT_CONFIGS: Record<ProjectType, ProjectConfig> = {
  'react-native': {
    scanDirectories: [
      'components', 'screens', 'api', 'hooks', 'constants',
      'contexts', 'libs', 'navigation', 'store', 'src',
    ],
    excludeFiles: [
      'index.js', 'App.js', 'App.tsx', 'index.tsx',
      'babel.config.js', 'metro.config.js', 'tailwind.config.js',
      'registerForPushNotifications.js',
    ],
    mainFiles: ['App.js', 'index.js', 'App.tsx', 'index.tsx'],
  },
  nextjs: {
    scanDirectories: [
      'components', 'pages', 'app', 'lib', 'utils',
      'hooks', 'contexts', 'store', 'src', 'api', 'shared',
    ],
    excludeFiles: [
      'next.config.js', 'next.config.ts',
      '_app.js', '_document.js', '_app.tsx', '_document.tsx',
    ],
    mainFiles: [
      'pages/_app.js', 'pages/_app.tsx',
      'app/layout.js', 'app/layout.tsx',
      'src/pages/_app.js', 'src/pages/_app.tsx',
      'src/app/layout.js', 'src/app/layout.tsx',
      'middleware.js', 'middleware.ts',
      'src/middleware.js', 'src/middleware.ts',
    ],
  },
  react: {
    scanDirectories: ['src', 'components', 'pages', 'utils', 'hooks', 'contexts', 'store', 'lib'],
    excludeFiles: [
      'index.js', 'App.js', 'index.tsx', 'App.tsx',
      'setupTests.js', 'reportWebVitals.js',
    ],
    mainFiles: [
      'src/index.js', 'src/App.js', 'src/index.tsx', 'src/App.tsx',
      'index.js', 'App.js',
    ],
  },
  generic: {
    scanDirectories: ['src', 'components', 'pages', 'lib', 'utils', 'hooks', 'api'],
    excludeFiles: ['index.js', 'App.js', 'main.js', 'index.tsx', 'App.tsx', 'main.tsx'],
    mainFiles: [
      'index.js', 'App.js', 'main.js',
      'src/index.js', 'src/App.js', 'src/main.js',
    ],
  },
};

export function getProjectConfig(projectType: ProjectType): ProjectConfig {
  return PROJECT_CONFIGS[projectType] ?? PROJECT_CONFIGS['generic'];
}

export function readTsJsConfig(projectRoot: string): TsJsConfig {
  const tsconfig = path.join(projectRoot, 'tsconfig.json');
  const jsconfig = path.join(projectRoot, 'jsconfig.json');
  const filePath = fs.existsSync(tsconfig) ? tsconfig : fs.existsSync(jsconfig) ? jsconfig : null;

  if (!filePath) return { baseUrl: null, paths: {} };

  try {
    // Strip comments and trailing commas (tsconfig is JSON5-ish).
    // Must be string-aware to avoid mangling values like "@/*" or "https://...".
    let content = stripJsonComments(fs.readFileSync(filePath, 'utf8'));
    content = content.replace(/,(\s*[}\]])/g, '$1');        // trailing commas

    const cfg = JSON.parse(content) as {
      compilerOptions?: {
        baseUrl?: string;
        paths?: Record<string, string[]>;
      };
    };

    const baseUrlRaw = cfg.compilerOptions?.baseUrl ?? '.';
    const baseUrl = path.resolve(projectRoot, baseUrlRaw);
    const rawPaths = cfg.compilerOptions?.paths ?? {};
    const paths: Record<string, string> = {};

    for (const k of Object.keys(rawPaths)) {
      const cleanKey = k.replace(/\/\*$/, '');
      const targetRaw = (rawPaths[k][0] ?? '').replace(/\/\*$/, '');
      paths[cleanKey] = path.resolve(baseUrl, targetRaw);
    }

    return { baseUrl, paths };
  } catch {
    return { baseUrl: null, paths: {} };
  }
}
