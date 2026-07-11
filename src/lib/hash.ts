// FNV-1a 64-bit hash — fast, sync, dependency-free. Used only to gate re-embedding
// (unchanged compositeText => skip); not intended for security or collision-resistance.
const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const MASK_64_BIT = 0xffffffffffffffffn;
const HEX_RADIX = 16;
const HEX_LENGTH_64_BIT = 16;

export function hashText(text: string): string {
  let hash = FNV_OFFSET_BASIS_64;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * FNV_PRIME_64) & MASK_64_BIT;
  }
  return hash.toString(HEX_RADIX).padStart(HEX_LENGTH_64_BIT, '0');
}
