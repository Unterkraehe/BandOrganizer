/** Type stub for the http_ece test dependency (decrypts push messages in worker tests). */
declare module 'http_ece' {
  const ece: { decrypt(buffer: Buffer, params: Record<string, unknown>): Buffer };
  export default ece;
}
