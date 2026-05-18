import { useMemo } from "react";
import { createAuthClient } from "better-auth/react";

export type SessionData = {
  session: { id: string };
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    banned: boolean;
  };
};

const baseURL =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

const innerClient = createAuthClient({ baseURL });

type InnerUser = {
  id: string;
  email: string;
  name?: string | null;
  role?: string | null;
  banned?: boolean | null;
};

type InnerSession = { id: string };

function toSessionData(data: { user: InnerUser; session: InnerSession } | null | undefined): SessionData | null {
  if (!data?.user || !data.session) return null;
  return {
    session: { id: data.session.id },
    user: {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name ?? "",
      role: data.user.role ?? "user",
      banned: Boolean(data.user.banned),
    },
  };
}

export const authClient = {
  useSession() {
    const inner = innerClient.useSession();
    const data = useMemo(
      () => toSessionData(inner.data as unknown as { user: InnerUser; session: InnerSession } | null),
      [inner.data],
    );
    return { data, isPending: inner.isPending };
  },

  signIn: {
    async email({ email, password }: { email: string; password: string }) {
      const result = await innerClient.signIn.email({ email, password });
      if (result.error) {
        return { data: null, error: result.error };
      }
      return {
        data: toSessionData(result.data as unknown as { user: InnerUser; session: InnerSession } | null),
        error: null,
      };
    },
  },

  signUp: {
    async email({
      email,
      password,
      name,
    }: {
      email: string;
      password: string;
      name: string;
    }) {
      const result = await innerClient.signUp.email({ email, password, name });
      if (result.error) {
        return { data: null, error: result.error };
      }
      return {
        data: toSessionData(result.data as unknown as { user: InnerUser; session: InnerSession } | null),
        error: null,
      };
    },
  },

  async signOut() {
    await innerClient.signOut();
  },

  async forgetPassword({ email }: { email: string }) {
    const result = await innerClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    if (result.error) {
      return { error: result.error };
    }
    return { error: null };
  },

  async resetPassword({ token, newPassword }: { token: string; newPassword: string }) {
    const result = await innerClient.resetPassword({ token, newPassword });
    if (result.error) {
      return { error: result.error };
    }
    return { error: null };
  },
};
