// Vercel functions cap the complete request body. Keep two files plus extracted text below that cap.
export const VERCEL_RUNTIME =
  process.env.NEXT_PUBLIC_DEPLOYMENT_TARGET === "vercel";
export const MAX_FILE_MB = VERCEL_RUNTIME ? 1.5 : 8;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
export const MAX_REQUEST_BYTES = (VERCEL_RUNTIME ? 4 : 18) * 1024 * 1024;
