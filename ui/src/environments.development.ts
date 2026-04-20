/* Static development environment values. */

export const GIT_TAG: string | null = 'v0.0.0-dev';
export const GIT_COMMIT_HASH: string | null = 'devdevdevdevdevdevdevdevdevdevdev';
export const DEFAULT_BACKEND_ROOT: string | null = '';
export const BACKEND_TYPE: 'rest' | 'wasm' = 'wasm';
export type Environment = 'production' | 'development' | 'preview';
export const ENVIRONMENT: Environment = 'production';
