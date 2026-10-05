import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // This configuration is used only by native Next.js; Vinext uses its Vite configuration.
  ...(process.env.CLAUSEDESK_TARGET === "vercel" || process.env.VERCEL === "1"
    ? { env: { NEXT_PUBLIC_DEPLOYMENT_TARGET: "vercel" } }
    : {}),
  serverExternalPackages: ["@libsql/client"],
};
export default nextConfig;
