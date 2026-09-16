const encoder = new TextEncoder();
export function practiceCustomTextUtf8Bytes(value) { return encoder.encode(String(value ?? "")); }
export async function hashPracticeCustomTextSha256(value) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle?.digest) throw new Error("Web Crypto SHA-256 is required for Custom Text");
  const digest = await subtle.digest("SHA-256", practiceCustomTextUtf8Bytes(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export const isPracticeCustomTextSha256 = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
