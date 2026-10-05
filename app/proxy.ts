import { NextRequest, NextResponse } from "next/server";
import { validBasicAuth } from "@/lib/platform/basic-auth";
export async function proxy(request: NextRequest) {
  // The existing Sites/Vinext build authenticates with the Sites dispatcher.
  if (process.env.NEXT_PUBLIC_DEPLOYMENT_TARGET !== "vercel")
    return NextResponse.next();
  const password = process.env.APP_ACCESS_PASSWORD;
  if (!password || password.length < 24)
    return new NextResponse(
      "Workspace setup required: set APP_ACCESS_PASSWORD to a random secret of at least 24 characters in Vercel Environment Variables, then redeploy.",
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  if (await validBasicAuth(request.headers.get("authorization"), password))
    return NextResponse.next();
  return new NextResponse(
    "Sign in with username admin and your workspace password.",
    {
      status: 401,
      headers: {
        "WWW-Authenticate":
          'Basic realm="ClauseDesk private workspace", charset="UTF-8"',
        "Cache-Control": "no-store",
      },
    },
  );
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg|pdf.worker.min.mjs).*)"],
};
