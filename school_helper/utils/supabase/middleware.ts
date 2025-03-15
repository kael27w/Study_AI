import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export const updateSession = async (request: NextRequest) => {
  try {
    // Create an unmodified response
    let response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
            return request.cookies.get(name)?.value;
          },
          set(name, value, options) {
            // Set cookie on response
            response.cookies.set({
              name,
              value,
              ...options,
            });
          },
          remove(name, options) {
            // Remove cookie from response
            response.cookies.delete({
              name,
              ...options,
            });
          },
        },
      },
    );

    // This will refresh session if expired - required for Server Components
    // https://supabase.com/docs/guides/auth/server-side/nextjs
    const { data: { session } } = await supabase.auth.getSession();

    // protected routes
    if (request.nextUrl.pathname.startsWith("/protected") && !session) {
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }

    // Don't redirect from homepage to dashboard anymore
    // Let users access the homepage even when authenticated

    return response;
  } catch (e) {
    console.error("Supabase middleware error:", e);
    // If you are here, a Supabase client could not be created!
    // This is likely because you have not set up environment variables.
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }
};
