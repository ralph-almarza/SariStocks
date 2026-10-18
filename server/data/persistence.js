/**
 * Persistence — JSON file storage with crash-safe writes.
 *
 * Every save goes to a temporary file first, then the good previous version
 * is copied to a .bak, and finally the temp file is renamed over the target.
 * A rename within the same directory is atomic: a crash can never leave a
 * half-written collection file. If a file is ever unreadable, load() falls
 * back to its .bak.
 */
import fs from 'node:fs';
import path from 'node:path';

export class Persistence {
  constructor(dataDir) {
    this.dataDir = dataDir;
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  filePath(name) {
    return path.join(this.dataDir, `${name}.json`);
  }

  exists(name) {
    return fs.existsSync(this.filePath(name));
  }

  /** Read a collection. Returns undefined when the file does not exist. */
  load(name) {
    const target = this.filePath(name);
    if (!fs.existsSync(target)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(target, 'utf8'));
    } catch (err) {
      const bak = `${target}.bak`;
      if (fs.existsSync(bak)) {
        console.warn(`[data] ${name}.json unreadable (${err.message}) — falling back to .bak`);
        return JSON.parse(fs.readFileSync(bak, 'utf8'));
      }
      throw new Error(`Cannot read ${target} and no .bak exists: ${err.message}`);
    }
  }

  /** Write a collection atomically (temp file + rename), keeping a .bak. */
  save(name, data) {
    const target = this.filePath(name);
    const tmp = `${target}.tmp`;
    const bak = `${target}.bak`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    if (fs.existsSync(target)) fs.copyFileSync(target, bak);
    fs.renameSync(tmp, target);
  }
}
