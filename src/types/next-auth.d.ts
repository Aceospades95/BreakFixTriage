import type { Role } from "@prisma/client";
import type { DefaultSession, DefaultUser } from "next-auth";
import type { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      districtIds: string[];
      /// Round-13 §1A — issued-at seconds; compared against
      /// User.sessionRevokedBefore by getSession().
      iat?: number;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role: Role;
    districtIds: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    role: Role;
    districtIds: string[];
    /// Round-13 §1A — propagated from the jwt callback into the
    /// session callback so the runtime can reject revoked JWTs.
    iat?: number;
  }
}
