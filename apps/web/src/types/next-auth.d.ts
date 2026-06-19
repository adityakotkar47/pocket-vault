import type { DefaultSession } from "next-auth";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    user: {
      orgId?: string;
    } & DefaultSession["user"];
  }

  interface User {
    accessToken?: string;
    orgId?: string;
    accessTokenExpires?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    orgId?: string;
    accessTokenExpires?: number;
  }
}
