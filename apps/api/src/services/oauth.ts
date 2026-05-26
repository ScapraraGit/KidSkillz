import jwt, { type SignOptions } from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { Prisma, type OAuthProvider as OAuthProviderEnum, type User } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { HttpError } from "../errors.js";
import { recordAudit } from "./audit.js";
import { getOAuthProvider, type OAuthClaims, type OAuthProviderName } from "../lib/oauth-provider.js";
import { listAuthFamilies, mintAccessToken, type AuthFamilyEntry } from "../lib/active-family.js";
import { issueRefreshToken } from "./refresh-tokens.js";
import { signToken } from "../lib/auth.js";

export type OAuthIntent = "LINK" | "SIGNIN";

interface OAuthStatePayload {
  purpose: "oauth-state";
  intent: OAuthIntent;
  provider: OAuthProviderName;
  // For LINK: the initiating user's id. For SIGNIN (Phase 2): null.
  uid: string | null;
  nonce: string;
  jti: string;
}

// State token TTL. Short on purpose — the user should complete the redirect
// to Google and back within a couple of minutes; 10 minutes covers slow networks
// and password managers.
const STATE_TTL_SECONDS = 10 * 60;

export function mintOAuthState(input: {
  intent: OAuthIntent;
  provider: OAuthProviderName;
  userId: string | null;
}): { state: string; nonce: string; jti: string } {
  const nonce = randomBytes(16).toString("base64url");
  const jti = randomBytes(16).toString("base64url");
  const payload: OAuthStatePayload = {
    purpose: "oauth-state",
    intent: input.intent,
    provider: input.provider,
    uid: input.userId,
    nonce,
    jti,
  };
  const state = jwt.sign(payload, env.JWT_SECRET, { expiresIn: STATE_TTL_SECONDS } as SignOptions);
  return { state, nonce, jti };
}

export function verifyOAuthState(state: string): OAuthStatePayload {
  let decoded: unknown;
  try {
    decoded = jwt.verify(state, env.JWT_SECRET);
  } catch {
    throw HttpError.unauthorized("Invalid or expired oauth state");
  }
  if (
    !decoded ||
    typeof decoded !== "object" ||
    (decoded as { purpose?: string }).purpose !== "oauth-state"
  ) {
    throw HttpError.unauthorized("Invalid oauth state");
  }
  return decoded as OAuthStatePayload;
}

export interface LinkIdentityResult {
  identityId: string;
  created: boolean;
}

/**
 * Attach a verified OAuth identity to an existing user. Phase 1 entrypoint.
 *
 * Collision rules:
 *  - reject if (provider, providerSub) already linked to a different user
 *  - reject if user has a verified email and Google's verified email differs
 *  - reject if Google's email is not verified
 *  - upsert silently if (provider, userId) already exists (re-link is a no-op + lastLoginAt bump)
 */
export async function linkIdentity(input: {
  userId: string;
  provider: OAuthProviderName;
  claims: OAuthClaims;
}): Promise<LinkIdentityResult> {
  const { userId, provider, claims } = input;

  if (!claims.emailVerified) {
    throw HttpError.badRequest(
      "Google account email is not verified — cannot link",
      "OAUTH_EMAIL_UNVERIFIED",
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, emailVerifiedAt: true, familyId: true },
  });
  if (!user) throw HttpError.notFound("User not found");

  // If the user has a verified email, require the Google identity to match.
  // This blocks "link Google to victim's account from an attacker's google
  // account" because attacker can't forge the session — but it is also a useful
  // sanity check against typos.
  if (user.email && user.emailVerifiedAt && claims.email.toLowerCase() !== user.email.toLowerCase()) {
    throw HttpError.badRequest(
      "Google account email does not match your account email",
      "OAUTH_EMAIL_MISMATCH",
    );
  }

  const existingBySub = await prisma.oAuthIdentity.findUnique({
    where: { provider_providerSub: { provider: provider as OAuthProviderEnum, providerSub: claims.sub } },
    select: { id: true, userId: true },
  });
  if (existingBySub && existingBySub.userId !== userId) {
    throw HttpError.conflict(
      "This Google account is already linked to a different ChoreChampz account",
      "OAUTH_SUB_TAKEN",
    );
  }

  const now = new Date();
  let created = false;
  let identityId: string;

  try {
    const upserted = await prisma.oAuthIdentity.upsert({
      where: { provider_userId: { provider: provider as OAuthProviderEnum, userId } },
      create: {
        userId,
        provider: provider as OAuthProviderEnum,
        providerSub: claims.sub,
        email: claims.email,
        emailVerified: claims.emailVerified,
        lastLoginAt: now,
      },
      update: {
        // Re-link: refresh metadata in case the user's Google profile email changed.
        providerSub: claims.sub,
        email: claims.email,
        emailVerified: claims.emailVerified,
        lastLoginAt: now,
      },
      select: { id: true, linkedAt: true },
    });
    identityId = upserted.id;
    created =
      upserted.linkedAt.getTime() === now.getTime() ||
      Math.abs(upserted.linkedAt.getTime() - now.getTime()) < 1000;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw HttpError.conflict(
        "This Google account is already linked to a different ChoreChampz account",
        "OAUTH_SUB_TAKEN",
      );
    }
    throw e;
  }

  if (user.familyId) {
    await recordAudit({
      familyId: user.familyId,
      actorId: userId,
      kind: "OAUTH_LINKED",
      targetType: "OAuthIdentity",
      targetId: identityId,
      payload: { provider, email: claims.email },
    });
  }

  return { identityId, created };
}

export async function listIdentities(userId: string) {
  return prisma.oAuthIdentity.findMany({
    where: { userId },
    orderBy: { linkedAt: "desc" },
    select: {
      id: true,
      provider: true,
      email: true,
      linkedAt: true,
      lastLoginAt: true,
    },
  });
}

export function assertSocialLoginEnabled(): void {
  if (!env.SOCIAL_LOGIN_ENABLED) {
    throw HttpError.notFound();
  }
}

export function getRedirectUri(provider: OAuthProviderName): string {
  switch (provider) {
    case "GOOGLE":
      return env.GOOGLE_OAUTH_REDIRECT_URI;
    default: {
      const _exhaustive: never = provider;
      throw new Error(`[oauth] no redirect uri for provider: ${_exhaustive as string}`);
    }
  }
}

export function buildAuthorizeUrl(input: {
  provider: OAuthProviderName;
  intent: OAuthIntent;
  userId: string | null;
}): { url: string; state: string } {
  assertSocialLoginEnabled();
  const oauth = getOAuthProvider(input.provider);
  const redirectUri = getRedirectUri(input.provider);
  const { state, nonce } = mintOAuthState({
    intent: input.intent,
    provider: input.provider,
    userId: input.userId,
  });
  const url = oauth.buildAuthUrl({ state, nonce, redirectUri });
  return { url, state };
}

export async function handleCallback(input: {
  provider: OAuthProviderName;
  code: string;
  state: string;
}): Promise<{ intent: OAuthIntent; uid: string | null; nonce: string; claims: OAuthClaims }> {
  assertSocialLoginEnabled();
  const payload = verifyOAuthState(input.state);
  if (payload.provider !== input.provider) {
    throw HttpError.badRequest("Provider mismatch in oauth state");
  }
  const oauth = getOAuthProvider(input.provider);
  const redirectUri = getRedirectUri(input.provider);
  const tokens = await oauth.exchangeCode({ code: input.code, redirectUri });
  const claims = await oauth.verifyIdToken({ idToken: tokens.idToken, nonce: payload.nonce });
  return { intent: payload.intent, uid: payload.uid, nonce: payload.nonce, claims };
}

// --- Phase 2: SIGNIN ---

export type SigninOutcome =
  | { kind: "TOKENS"; token: string; refreshToken: string; refreshExpiresAt: Date; userId: string }
  | {
      kind: "FAMILY_SELECT";
      selectToken: string;
      families: AuthFamilyEntry[];
      userId: string;
    }
  | { kind: "UNLINKED_EMAIL_MATCH"; email: string }
  | { kind: "NO_ACCOUNT"; email: string }
  | {
      // Phase 3: callback verified Google claims for a brand-new account.
      // The ticket carries the verified claims so the signup endpoint can
      // create the user without re-running OAuth (the auth code is already
      // consumed by this point).
      kind: "SIGNUP_PENDING";
      provider: OAuthProviderName;
      claims: OAuthClaims;
    };

/**
 * Drive a SIGNIN attempt for a verified Google identity.
 *
 * Returns one of:
 *  - TOKENS: linked identity + single active family → tokens minted.
 *  - FAMILY_SELECT: linked identity + 2+ active families → select-family token.
 *  - UNLINKED_EMAIL_MATCH: no link, but a user with the verified email exists.
 *    We do NOT auto-link — that would let an attacker who controlled the email
 *    at some point take over the account. Caller redirects to /login with a hint.
 *  - NO_ACCOUNT: nothing exists; Phase 3 will branch this to sign-up.
 */
export async function signinWithIdentity(input: {
  provider: OAuthProviderName;
  claims: OAuthClaims;
  meta?: { userAgent?: string | null; ip?: string | null };
}): Promise<SigninOutcome> {
  const { provider, claims, meta } = input;

  if (!claims.emailVerified) {
    throw HttpError.badRequest("Google account email is not verified", "OAUTH_EMAIL_UNVERIFIED");
  }

  const identity = await prisma.oAuthIdentity.findUnique({
    where: { provider_providerSub: { provider: provider as OAuthProviderEnum, providerSub: claims.sub } },
    select: { id: true, userId: true },
  });

  if (!identity) {
    const existingUser = await prisma.user.findUnique({
      where: { email: claims.email },
      select: { id: true },
    });
    return existingUser
      ? { kind: "UNLINKED_EMAIL_MATCH", email: claims.email }
      : { kind: "NO_ACCOUNT", email: claims.email };
  }

  const user = await prisma.user.findUnique({ where: { id: identity.userId } });
  if (!user || !user.isActive) {
    throw HttpError.unauthorized("Account is inactive");
  }
  if (user.role !== "PARENT" && user.role !== "CAREGIVER") {
    // Children are explicitly excluded from social login. If a CHILD row has
    // an OAuthIdentity row, treat as misconfigured and refuse.
    throw HttpError.forbidden("Social login is only for parents and caregivers");
  }

  // Refresh the identity's lastLoginAt on every successful resolution.
  await prisma.oAuthIdentity.update({
    where: { id: identity.id },
    data: { lastLoginAt: new Date(), email: claims.email, emailVerified: claims.emailVerified },
  });

  const families = await listAuthFamilies({
    id: user.id,
    role: user.role,
    familyId: user.familyId,
  });
  if (families.length === 0) {
    throw HttpError.forbidden("No active family membership");
  }

  if (families.length > 1) {
    const selectToken = signToken({
      sub: user.id,
      fid: "",
      role: user.role,
      adm: user.isAdmin,
      tv: user.tokenVersion,
      scope: "family-select",
    });
    if (families[0].id) {
      await recordAudit({
        familyId: families[0].id,
        actorId: user.id,
        kind: "OAUTH_SIGNIN",
        targetType: "OAuthIdentity",
        targetId: identity.id,
        payload: { provider, multiFamilySelect: true },
      });
    }
    return { kind: "FAMILY_SELECT", selectToken, families, userId: user.id };
  }

  const only = families[0];
  const token = mintAccessToken({
    user,
    familyId: only.id,
    membershipId: only.membershipId ?? undefined,
  });
  const refresh = await issueRefreshToken({
    userId: user.id,
    familyMembershipId: only.membershipId,
    userAgent: meta?.userAgent ?? null,
    ip: meta?.ip ?? null,
  });
  await recordAudit({
    familyId: only.id,
    actorId: user.id,
    kind: "OAUTH_SIGNIN",
    targetType: "OAuthIdentity",
    targetId: identity.id,
    payload: { provider },
  });
  return {
    kind: "TOKENS",
    token,
    refreshToken: refresh.refreshToken,
    refreshExpiresAt: refresh.expiresAt,
    userId: user.id,
  };
}

// Phase 3: signup with verified Google claims. Mirrors the body of
// /auth/parent/register but skips password (passwordHash stays null), marks
// email verified (Google already verified it), and creates an OAuthIdentity
// row in the same flow. Returns the same shape signinWithIdentity returns so
// the route can reuse the ticket exchange.
export async function signupWithIdentity(input: {
  provider: OAuthProviderName;
  claims: OAuthClaims;
  familyName: string;
  parentName?: string | null;
  acceptedTermsVersion: number;
  meta?: { userAgent?: string | null; ip?: string | null };
}): Promise<Extract<SigninOutcome, { kind: "TOKENS" }>> {
  const { provider, claims, familyName, acceptedTermsVersion, meta } = input;
  const parentName = (input.parentName ?? claims.name ?? claims.email.split("@")[0]).trim();

  if (!claims.emailVerified) {
    throw HttpError.badRequest("Google account email is not verified", "OAUTH_EMAIL_UNVERIFIED");
  }

  // Re-check that nothing was created in between callback and signup-complete.
  const collision = await prisma.user.findUnique({ where: { email: claims.email } });
  if (collision) {
    throw HttpError.conflict("Email already in use", "EMAIL_IN_USE");
  }
  const subCollision = await prisma.oAuthIdentity.findUnique({
    where: { provider_providerSub: { provider: provider as OAuthProviderEnum, providerSub: claims.sub } },
  });
  if (subCollision) {
    throw HttpError.conflict("This Google account is already linked", "OAUTH_SUB_TAKEN");
  }

  // Create family + initial trial + seed defaults. Lift from /auth/parent/register
  // verbatim, dropping the password branch. Avoid wrapping in a single $transaction
  // because the seed helpers call prisma directly and would deadlock on the txn
  // client — same pattern as the existing register route.
  const { DEFAULT_FAMILY_SETTINGS, CURRENT_PRIVACY_VERSION } = await import("@chorechampz/shared");
  const { startTrial } = await import("./billing.js");
  const { seedDefaultChallenges } = await import("./challenges.js");
  const { seedDefaultCategories } = await import("./task-categories.js");
  const { seedDefaultRewards, seedDefaultTasks } = await import("./seed-defaults.js");
  const { recordLegalAcceptance } = await import("./legal-acceptance.js");

  const family = await prisma.family.create({
    data: { name: familyName, settings: { ...DEFAULT_FAMILY_SETTINGS } as object },
  });
  await startTrial(family.id).catch((e) => console.error("[billing:startTrial]", e));
  await seedDefaultChallenges(family.id);
  await seedDefaultCategories(family.id);
  await seedDefaultTasks(family.id);
  await seedDefaultRewards(family.id);

  const user = await prisma.user.create({
    data: {
      role: "PARENT",
      name: parentName,
      email: claims.email,
      passwordHash: null,
      emailVerifiedAt: new Date(),
      avatarColor: "#2563eb",
      acceptedTermsVersion,
      acceptedTermsAt: new Date(),
    },
  });
  const membership = await prisma.familyMembership.create({
    data: {
      userId: user.id,
      familyId: family.id,
      role: "PARENT",
      isBillingOwner: true,
    },
  });
  await prisma.oAuthIdentity.create({
    data: {
      userId: user.id,
      provider: provider as OAuthProviderEnum,
      providerSub: claims.sub,
      email: claims.email,
      emailVerified: claims.emailVerified,
      lastLoginAt: new Date(),
    },
  });

  await recordLegalAcceptance({
    userId: user.id,
    familyId: family.id,
    kind: "TERMS",
    version: acceptedTermsVersion,
    ipAddress: meta?.ip ?? null,
    userAgent: meta?.userAgent ?? null,
    context: "oauth-signup",
  }).catch((e) => console.error("[legal:accept terms]", e));
  await recordLegalAcceptance({
    userId: user.id,
    familyId: family.id,
    kind: "PRIVACY",
    version: CURRENT_PRIVACY_VERSION,
    ipAddress: meta?.ip ?? null,
    userAgent: meta?.userAgent ?? null,
    context: "oauth-signup",
  }).catch((e) => console.error("[legal:accept privacy]", e));

  const token = mintAccessToken({ user, familyId: family.id, membershipId: membership.id });
  const refresh = await issueRefreshToken({
    userId: user.id,
    familyMembershipId: membership.id,
    userAgent: meta?.userAgent ?? null,
    ip: meta?.ip ?? null,
  });

  await recordAudit({
    familyId: family.id,
    actorId: user.id,
    kind: "OAUTH_SIGNUP",
    targetType: "User",
    targetId: user.id,
    payload: { provider, email: claims.email },
  });

  return {
    kind: "TOKENS",
    token,
    refreshToken: refresh.refreshToken,
    refreshExpiresAt: refresh.expiresAt,
    userId: user.id,
  };
}

// Phase 4: unlink. Block when the user would be left with no way to sign in.
export async function unlinkIdentity(input: { userId: string; identityId: string }): Promise<void> {
  const identity = await prisma.oAuthIdentity.findUnique({
    where: { id: input.identityId },
    select: { id: true, userId: true, provider: true },
  });
  if (!identity || identity.userId !== input.userId) {
    throw HttpError.notFound();
  }
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { passwordHash: true, familyId: true },
  });
  if (!user) throw HttpError.notFound();

  const otherCount = await prisma.oAuthIdentity.count({
    where: { userId: input.userId, id: { not: identity.id } },
  });
  if (!user.passwordHash && otherCount === 0) {
    throw HttpError.badRequest(
      "Set a password before disconnecting your only sign-in method",
      "OAUTH_LAST_IDENTITY",
    );
  }

  await prisma.oAuthIdentity.delete({ where: { id: identity.id } });

  if (user.familyId) {
    await recordAudit({
      familyId: user.familyId,
      actorId: input.userId,
      kind: "OAUTH_UNLINKED",
      targetType: "OAuthIdentity",
      targetId: identity.id,
      payload: { provider: identity.provider },
    });
  }
}

export function serializeUserForOAuth(
  user: Pick<
    User,
    | "id"
    | "name"
    | "email"
    | "role"
    | "isAdmin"
    | "avatarColor"
    | "avatarConfig"
    | "onboardedAt"
    | "householdAckAt"
    | "emailVerifiedAt"
  >,
) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isAdmin: user.isAdmin,
    avatarColor: user.avatarColor,
    avatarConfig: user.avatarConfig,
    onboardedAt: user.onboardedAt,
    householdAckAt: user.householdAckAt,
    emailVerifiedAt: user.emailVerifiedAt,
  };
}

// --- Phase 2: one-shot redirect ticket ---
//
// After SIGNIN succeeds the API needs to hand the access + refresh tokens back
// to the SPA, but the SPA's auth stack expects to receive them as a JSON body
// (not a cookie). We store the outcome under a short-lived random code, redirect
// the browser to the SPA with `?ticket=<code>`, and the SPA POSTs the code back
// to exchange it for the real tokens. The code is single-use and burned on
// first read. Storage is in-memory — fine for single-instance dev/staging;
// multi-instance deploys must move this to a shared cache (Redis).
const TICKET_TTL_MS = 60 * 1000;
type TicketEntry = { outcome: SigninOutcome; expiresAt: number };
const ticketStore = new Map<string, TicketEntry>();

function sweepTickets() {
  const now = Date.now();
  for (const [code, entry] of ticketStore.entries()) {
    if (entry.expiresAt < now) ticketStore.delete(code);
  }
}

export function storeOAuthTicket(outcome: SigninOutcome): string {
  sweepTickets();
  const code = randomBytes(24).toString("base64url");
  ticketStore.set(code, { outcome, expiresAt: Date.now() + TICKET_TTL_MS });
  return code;
}

export function consumeOAuthTicket(code: string): SigninOutcome {
  sweepTickets();
  const entry = ticketStore.get(code);
  if (!entry) throw HttpError.unauthorized("Invalid or expired oauth ticket");
  ticketStore.delete(code);
  if (entry.expiresAt < Date.now()) throw HttpError.unauthorized("Expired oauth ticket");
  return entry.outcome;
}

// --- Phase 2: state-cookie binding for SIGNIN ---
//
// SIGNIN state has no `uid` field, so signature alone isn't enough — an attacker
// could mint a state on their browser and feed the resulting callback URL to a
// victim, logging the victim into the attacker's google account. The defense:
// at /signin/start we set an HttpOnly cookie containing the state's jti; at
// /callback we require the cookie's jti to match the state's jti. Same browser,
// same flow.

export const OAUTH_STATE_COOKIE = "cc_oauth_state";

export function buildStateCookie(jti: string): string {
  const parts = [
    `${OAUTH_STATE_COOKIE}=${jti}`,
    `Max-Age=${STATE_TTL_SECONDS}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
  ];
  if (env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function clearStateCookie(): string {
  const parts = [`${OAUTH_STATE_COOKIE}=`, "Max-Age=0", "HttpOnly", "Path=/", "SameSite=Lax"];
  if (env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function readStateCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const raw of cookieHeader.split(";")) {
    const [name, ...rest] = raw.trim().split("=");
    if (name === OAUTH_STATE_COOKIE) return rest.join("=") || null;
  }
  return null;
}
