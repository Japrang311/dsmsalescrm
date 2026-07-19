// Privileged adapter for the pure lifecycle handler. Supabase Auth admin APIs
// require a service-role key and therefore stay exclusively in this server file:
// https://supabase.com/docs/reference/javascript/auth-admin-createuser
// https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid
// https://supabase.com/docs/reference/javascript/auth-admin-deleteuser

import { createClient } from "jsr:@supabase/supabase-js@2";
import { AdminHttpError, type ErrorBody } from "./contracts.ts";
import {
  handleAdminRequest,
  type AdminDependencies,
  type AdminResponse,
} from "./handler.ts";
import { readBoundedRequestBody } from "./body-reader.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: AdminResponse["body"] | ErrorBody, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function serverConfiguration() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new AdminHttpError(
      500,
      "SERVER_CONFIGURATION_ERROR",
      "Konfigurasi server untuk manajemen anggota tim belum lengkap.",
    );
  }
  return { url, serviceRoleKey };
}

function createDependencies(): AdminDependencies {
  const { url, serviceRoleKey } = serverConfiguration();
  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async authenticate(accessToken) {
      // getUser(jwt) validates the token with Supabase Auth and is suitable for
      // authorization checks: https://supabase.com/docs/reference/javascript/auth-getuser
      const { data, error } = await adminClient.auth.getUser(accessToken);
      if (error || !data.user) return null;
      return { id: data.user.id };
    },

    async getCallerProfile(id) {
      const { data, error } = await adminClient
        .from("profiles")
        .select("role, account_status")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async createAuthUser(input) {
      const { data, error } = await adminClient.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
      });
      if (error || !data.user) {
        throw error ?? new Error("Auth user was not returned");
      }
      return { id: data.user.id };
    },

    async deleteAuthUser(id) {
      const { error } = await adminClient.auth.admin.deleteUser(id, false);
      if (error) throw error;
    },

    async setAuthBan(id, banned) {
      // Supabase admin signOut requires the target user's JWT. This endpoint
      // has only the caller JWT, so it uses an administrative ban/unban as the
      // best available server-side control. Existing access JWTs can remain
      // valid until expiry; database RLS status checks are authoritative.
      // https://supabase.com/docs/reference/javascript/auth-admin-signout
      // https://supabase.com/docs/guides/auth/signout
      const { error } = await adminClient.auth.admin.updateUserById(id, {
        ban_duration: banned ? "876000h" : "none",
      });
      if (error) throw error;
    },

    async rpc(name, args) {
      const { data, error } = await adminClient.rpc(name, args);
      if (error) throw error;
      return data;
    },
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const bodyText =
      request.method === "POST" ? await readBoundedRequestBody(request) : "";
    const result = await handleAdminRequest(
      {
        method: request.method,
        authorization: request.headers.get("Authorization"),
        bodyText,
      },
      createDependencies(),
    );
    return json(result.body, result.status);
  } catch (error) {
    const safe =
      error instanceof AdminHttpError
        ? {
            status: error.status,
            body: { error: error.message, code: error.code },
          }
        : {
            status: 500,
            body: {
              error: "Operasi anggota tim gagal.",
              code: "INTERNAL_ERROR",
            },
          };
    return json(safe.body, safe.status);
  }
});
