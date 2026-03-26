export type ProjectType = 'react-native' | 'nextjs' | 'react' | 'generic';

export interface ProjectConfig {
  scanDirectories: string[];
  excludeFiles: string[];
  mainFiles: string[];
}

export interface TsJsConfig {
  baseUrl: string | null;
  paths: Record<string, string>;
}

export interface FileInfo {
  fullPath: string;
  relativePath: string;
  fileName: string;
  directory: string;
}

export type ImportType = 'default' | 'named' | 'namespace' | 'side-effect' | 'require' | 'dynamic';

export interface ImportInfo {
  name: string;
  type: ImportType;
  from: string;
  line: number;
  original?: string;
}

export interface AnalysisResult {
  projectType: ProjectType;
  totalFiles: number;
  unusedFiles: string[];
  unusedImports: Array<{
    file: string;
    imports: ImportInfo[];
  }>;
}

export interface FinderOptions {
  /** Target project root. Defaults to process.cwd() */
  projectRoot?: string;
  /** Suppress console output */
  silent?: boolean;
}
