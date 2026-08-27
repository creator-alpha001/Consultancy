import { types } from 'pg';

// OID 20 = int8/bigint. node-postgres returns these as strings by
// default because a JS `number` cannot hold the full int64 range —
// exactly the range money-in-paise needs. Parse as BigInt everywhere so
// `bigint paise, never JS number arithmetic on currency` (CLAUDE.md) is
// enforced by the type system, not just convention.
types.setTypeParser(20, (value: string) => BigInt(value));
