import { createClient } from "@supabase/supabase-js";
import { requireLocalSupabaseUrl } from "../local-supabase-url";

const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const LOCAL_SUPER_ADMIN = {
  id: "77777777-7777-7777-7777-777777777777",
  email: "super-admin@local.dsm.test",
  password: "seed-local-only",
  name: "Local Super Admin",
  initials: "SA",
} as const;

// The guard must run before the service-role client is constructed. There is
// intentionally no bypass flag: this bootstrap is incapable of targeting a
// hosted Supabase project.
const apiUrl = requireLocalSupabaseUrl(
  process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
);
const adminClient = createClient(
  apiUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL_SERVICE_ROLE_KEY,
);

async function bootstrapLocalSuperAdmin(): Promise<void> {
  const { data: existing, error: lookupError } =
    await adminClient.auth.admin.getUserById(LOCAL_SUPER_ADMIN.id);

  if (lookupError && lookupError.status !== 404) throw lookupError;

  if (existing.user) {
    const { error } = await adminClient.auth.admin.updateUserById(
      LOCAL_SUPER_ADMIN.id,
      {
        email: LOCAL_SUPER_ADMIN.email,
        password: LOCAL_SUPER_ADMIN.password,
        email_confirm: true,
      },
    );
    if (error) throw error;
  } else {
    const { error } = await adminClient.auth.admin.createUser({
      id: LOCAL_SUPER_ADMIN.id,
      email: LOCAL_SUPER_ADMIN.email,
      password: LOCAL_SUPER_ADMIN.password,
      email_confirm: true,
    });
    if (error) throw error;
  }

  const { error: profileError } = await adminClient.from("profiles").upsert({
    id: LOCAL_SUPER_ADMIN.id,
    role: "super_admin",
    account_status: "active",
    name: LOCAL_SUPER_ADMIN.name,
    initials: LOCAL_SUPER_ADMIN.initials,
    email: LOCAL_SUPER_ADMIN.email,
  });
  if (profileError) throw profileError;

  console.log(
    `Bootstrapped local Super Admin ${LOCAL_SUPER_ADMIN.email} at ${apiUrl}`,
  );
}

await bootstrapLocalSuperAdmin();
