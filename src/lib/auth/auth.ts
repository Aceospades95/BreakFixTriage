import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import {
  SIGNIN_LIMIT,
  checkRateLimit,
} from "@/lib/auth/rate-limit";
import {
  consumeRecoveryCode,
  verifyTotp,
} from "@/lib/auth/totp";

/**
 * NextAuth configuration.
 *
 * - Credentials provider: authenticates against the User table using bcrypt.
 *   This is the only always-on provider; it works offline and without
 *   external dependencies.
 * - Google OIDC provider: enabled only when GOOGLE_CLIENT_ID and
 *   GOOGLE_CLIENT_SECRET are set. When enabled, users must already exist in
 *   the User table with a matching email — new Google logins do not
 *   auto-provision accounts because that would bypass the RBAC onboarding
 *   flow. Use `GOOGLE_ALLOWED_DOMAINS` (comma-separated) to restrict which
 *   Workspace domains can sign in.
 *
 * Session strategy is JWT so the role and districtIds travel with the
 * request without an extra DB lookup on each page load.
 */
const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
      totpCode: { label: "Authenticator code", type: "text" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;
      const email = credentials.email.trim().toLowerCase();

      // Rate limit per email to stop dictionary attacks. We deliberately
      // key on the *attempted* email rather than the requester IP so a
      // bot hitting a hundred inboxes doesn't fly under a per-IP limit.
      const limit = checkRateLimit(`signin:${email}`, SIGNIN_LIMIT);
      if (!limit.allowed) return null;

      const user = await prisma.user.findUnique({
        where: { email },
        include: { districts: { select: { districtId: true } } },
      });
      if (!user || !user.active || !user.passwordHash) return null;
      const ok = await bcrypt.compare(credentials.password, user.passwordHash);
      if (!ok) return null;

      // 2FA gate: if the user has TOTP enabled, they must submit either
      // a valid six-digit code OR a one-use recovery code.
      if (user.totpEnabledAt && user.totpSecret) {
        const submitted = (credentials.totpCode ?? "").trim();
        if (!submitted) return null;

        const totpOk = verifyTotp(submitted, user.totpSecret);
        if (!totpOk) {
          // Try as a recovery code.
          let codes: string[] = [];
          if (user.backupCodes) {
            try {
              codes = JSON.parse(user.backupCodes) as string[];
            } catch {
              codes = [];
            }
          }
          const updated = consumeRecoveryCode(submitted, codes);
          if (updated == null) return null;
          await prisma.user.update({
            where: { id: user.id },
            data: { backupCodes: JSON.stringify(updated) },
          });
        }
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        districtIds: user.districts.map((d) => d.districtId),
      };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    // 12-hour session max age. Ops staff typically work a single shift
    // and then go home — this makes "walked away from the tablet on
    // the wall" stop counting as a logged-in session overnight.
    maxAge: 12 * 60 * 60,
    // Bump the expiry every 30 minutes of activity so an active user
    // doesn't get logged out mid-shift.
    updateAge: 30 * 60,
  },
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        const email = (profile?.email ?? "").toLowerCase();
        if (!email) return false;

        const allowed = (process.env.GOOGLE_ALLOWED_DOMAINS ?? "")
          .split(",")
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean);
        if (allowed.length > 0) {
          const domain = email.split("@")[1] ?? "";
          if (!allowed.includes(domain)) return false;
        }

        // Require the user to already exist in our User table. We do not
        // auto-provision from Google because role assignment must be
        // deliberate.
        const dbUser = await prisma.user.findUnique({
          where: { email },
          include: { districts: { select: { districtId: true } } },
        });
        if (!dbUser || !dbUser.active) return false;

        // Hydrate the NextAuth user object with our DB columns so the
        // jwt callback can copy them onto the token.
        user.id = dbUser.id;
        user.name = dbUser.name;
        user.role = dbUser.role;
        user.districtIds = dbUser.districts.map((d) => d.districtId);
        return true;
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.districtIds = user.districtIds;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.districtIds = token.districtIds;
      }
      return session;
    },
  },
};
