// Authentication for the single-owner Vercel workspace. Sites keeps its existing SIWC identity.
// Use a long random secret; no password is stored in source, URLs, cookies, or logs.
export async function validBasicAuth(
  header: string | null,
  password: string | undefined,
): Promise<boolean> {
  if (!password || password.length < 24 || !header?.startsWith("Basic "))
    return false;
  try {
    const decoded = atob(header.slice(6));
    const colon = decoded.indexOf(":");
    if (colon < 0 || decoded.slice(0, colon) !== "admin") return false;
    const digest = async (value: string) =>
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
      );
    const [actual, expected] = await Promise.all([
      digest(decoded.slice(colon + 1)),
      digest(password),
    ]);
    let difference = 0;
    for (let i = 0; i < expected.length; i++)
      difference |= actual[i] ^ expected[i];
    return difference === 0;
  } catch {
    return false;
  }
}
