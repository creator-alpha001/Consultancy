/**
 * The seam between the platform and S3-compatible object storage
 * (CLAUDE.md: `ap-south-1`, private buckets only).
 *
 * The same shape as the `PaymentAggregator` and `RoomProvider` seams: a
 * local implementation so the access model can be built and tested
 * without a bucket, and a real driver as a drop-in class later. What is
 * NOT faked is everything that decides who may read a file — grants,
 * expiry, viewer binding and the audit trail all run for real against
 * the database, because those are the parts #29 is actually about.
 */
export const OBJECT_STORAGE = 'OBJECT_STORAGE';

export interface ObjectStorage {
  /** Identifies which backend wrote an object, recorded alongside the key. */
  readonly code: string;
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** Used when an upload is accepted and then rejected before it is referenced. */
  remove(key: string): Promise<void>;
}
