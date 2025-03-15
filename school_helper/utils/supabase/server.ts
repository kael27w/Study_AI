import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const createClient = async () => {
  const cookieStore = await cookies();
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set(name, value, options) {
          try {
            cookieStore.set({
              name,
              value,
              ...options
            });
          } catch (error) {
            // This can happen when cookies are manipulated by server actions or middleware
            // We can safely ignore this error
          }
        },
        remove(name, options) {
          try {
            cookieStore.delete({
              name,
              ...options
            });
          } catch (error) {
            // This can happen when cookies are manipulated by server actions or middleware
            // We can safely ignore this error
          }
        },
      },
    }
  );
};

// Keep the old function for backward compatibility
export const createSupabaseServerClient = async () => {
  return await createClient();
};
