import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const CONFIG = {
  root,
  cometExe:
    process.env.COMET_EXE ||
    join(process.env.LOCALAPPDATA ?? '', 'Perplexity/Comet/Application/comet.exe'),
  port: Number(process.env.CDP_PORT || 9222),
  profileDir: resolve(root, '.dev-profile'),
  extensionDir: resolve(root, 'dist'),
  extensionName: 'Starry — AI Bookmark Search',
};
