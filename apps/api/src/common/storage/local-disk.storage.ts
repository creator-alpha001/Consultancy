import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { ObjectStorage } from './object-storage.interface';

/**
 * Local-disk stand-in for the private bucket.
 *
 * Deliberately outside the repository tree by default: a development
 * store that lands in the working copy is one that gets committed. It
 * writes under a directory that is nobody's idea of a public path, and
 * every read is confined to it — a key containing `..` cannot escape,
 * checked after resolution rather than by pattern, because pattern
 * checks on paths are how traversal bugs happen.
 *
 * It does NOT sign anything: signing and expiry belong to the access
 * layer, which must behave identically whichever backend is underneath.
 */
@Injectable()
export class LocalDiskStorage implements ObjectStorage {
  readonly code = 'local_disk';
  private readonly log = new Logger(LocalDiskStorage.name);
  private readonly root: string;

  constructor() {
    this.root = resolve(process.env.STORAGE_DIR ?? join(tmpdir(), 'sankalp-private-store'));
  }

  private pathFor(key: string): string {
    const full = resolve(join(this.root, key));
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new Error('storage key escapes the store root');
    }
    return full;
  }

  async put(key: string, bytes: Buffer, _contentType: string): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { mode: 0o600 });
    this.log.debug(`stored ${key} (${bytes.byteLength} bytes)`);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}
