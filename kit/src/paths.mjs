import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_DIR = join(KIT_DIR, '..');
export const PLUGINS_DIR = join(REPO_DIR, 'plugins');
export const HOST_DIR = join(KIT_DIR, 'host');
