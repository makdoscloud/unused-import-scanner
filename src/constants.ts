export const FILE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'] as const;

export const EXCLUDE_DIRS = [
  'node_modules', '.git', '.next', 'build', 'dist',
  '.expo', 'coverage', '.parcel-cache',
] as const;

export const EXCLUDE_EXTENSIONS_IN_NAME = [
  '.test.', '.spec.', '_test.', '_spec.',
] as const;
