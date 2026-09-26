const ALPHABET = '0123456789abcdefghijkmnopqrstuvwxyz'; // no "l" to avoid confusion with "1"

/** Random, URL- and filename-safe ID with a type prefix, e.g. "m_k3f9x2p7qa" (F2 §5.1). */
export function newId(prefix: string, length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = '';
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return `${prefix}_${id}`;
}
