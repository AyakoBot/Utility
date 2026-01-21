import { decode, Encoder } from 'cbor-x';

const canonicalEncoder = new Encoder({
 structuredClone: true,
 useRecords: false,
 mapsAsObjects: true,
});

/**
 * Recursively sorts object keys to ensure deterministic encoding.
 * Identical data always produces identical bytes regardless of property order.
 */
const sortKeys = (obj: unknown): unknown => {
 if (obj === null || typeof obj !== 'object') return obj;
 if (Array.isArray(obj)) return obj.map(sortKeys);

 return Object.keys(obj as object)
  .sort()
  .reduce(
   (sorted, key) => {
    sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    return sorted;
   },
   {} as Record<string, unknown>,
  );
};

/**
 * Serialize data to a base64-encoded CBOR string.
 * Uses deterministic/canonical encoding for reliable deduplication.
 * Keys are sorted recursively to ensure identical data produces identical bytes.
 */
export const serialize = (data: unknown): string =>
 Buffer.from(canonicalEncoder.encode(sortKeys(data))).toString('base64');

/**
 * Deserialize data from storage.
 * Handles both legacy JSON data and new CBOR (base64) data.
 */
export const deserialize = <T>(data: string): T => {
 // Backward compatibility
 if (data.startsWith('{') || data.startsWith('[')) return JSON.parse(data) as T;

 return decode(Buffer.from(data, 'base64')) as T;
};
