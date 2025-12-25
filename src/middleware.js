import { NextResponse } from "next/server";

export function middleware(request) {
  const isAuth = request.cookies.get("auth");

  if (!isAuth) {
    return NextResponse.redirect(
      new URL("/", request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/conversation/:path*"],
};
