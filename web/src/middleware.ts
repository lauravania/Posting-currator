export { default } from "next-auth/middleware";

// Defense-in-depth: every server page under these paths also calls
// requireSession() itself, but gating at the edge means an unauthenticated
// request never reaches a page/server-action at all.
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/weddings/:path*",
    "/brand/:path*",
    "/competitors/:path*",
    "/calendar/:path*",
    "/analytics/:path*",
    "/director/:path*",
  ],
};
