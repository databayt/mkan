// Stub type declarations for Supabase auth helpers
declare module "@supabase/auth-helpers-nextjs" {
  interface QueryBuilder {
    eq: (column: string, value: any) => QueryBuilder;
    delete: () => QueryBuilder;
    select: (columns?: string) => QueryBuilder;
    insert: (values: any) => QueryBuilder;
    update: (values: any) => QueryBuilder;
  }

  interface SupabaseClient {
    from: (table: string) => QueryBuilder;
    storage: {
      from: (bucket: string) => {
        remove: (paths: string[]) => Promise<{ data: any; error: any }>;
      };
    };
    auth: {
      signOut: () => Promise<{ error: any }>;
      getSession: () => Promise<{ data: { session: any }; error: any }>;
    };
  }

  export function createClientComponentClient(): SupabaseClient;
  export function createServerComponentClient(opts: any): SupabaseClient;
}
