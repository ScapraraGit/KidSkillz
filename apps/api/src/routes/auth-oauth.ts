import { Router } from "express";
import { z } from "zod";
import { env } from "../env.js";
import { HttpError } from "../errors.js";
import { requireAuth } from "../middleware/auth.js";
import {
  assertSocialLoginEnabled,
  buildAuthorizeUrl,
  buildStateCookie,
  clearStateCookie,
  consumeOAuthTicket,
  handleCallback,
  linkIdentity,
  listIdentities,
  readStateCookie,
  serializeUserForOAuth,
  signinWithIdentity,
  signupWithIdentity,
  storeOAuthTicket,
  unlinkIdentity,
  verifyOAuthState,
} from "../services/oauth.js";
import { CURRENT_TERMS_VERSION } from "@chorechampz/shared";
import { prisma } from "../db.js";
import { clientIpFromReq } from "../services/refresh-tokens.js";
import type { OAuthProviderName } from "../lib/oauth-provider.js";

export const authOAuthRouter = Router();

authOAuthRouter.use((_req, _res, next) => {
  if (!env.SOCIAL_LOGIN_ENABLED) return next(HttpError.notFound());
  next();
});

const providerSchema = z.enum(["google"]);
function normalizeProvider(p: string): OAuthProviderName {
  providerSchema.parse(p);
  return "GOOGLE";
}

// Per CLAUDE.md: requireAuth applied per-route. Callback + SIGNIN start are
// public-by-design (state JWT is the credential / no credential yet).

authOAuthRouter.get("/:provider/link/start", requireAuth, (req, res) => {
  assertSocialLoginEnabled();
  const provider = normalizeProvider(req.params.provider);
  const userId = req.auth!.sub;
  const { url, state } = buildAuthorizeUrl({ provider, intent: "LINK", userId });
  // Bind to the cookie too so we can reuse the same callback handler for LINK
  // and SIGNIN. For LINK the uid in the JWT is already the binding, but the
  // matching cookie is cheap and keeps the callback logic uniform.
  const jti = verifyOAuthState(state).jti;
  res.setHeader("Set-Cookie", buildStateCookie(jti));
  res.redirect(302, url);
});

authOAuthRouter.get("/:provider/signin/start", (req, res) => {
  assertSocialLoginEnabled();
  const provider = normalizeProvider(req.params.provider);
  const { url, state } = buildAuthorizeUrl({ provider, intent: "SIGNIN", userId: null });
  const jti = verifyOAuthState(state).jti;
  res.setHeader("Set-Cookie", buildStateCookie(jti));
  res.redirect(302, url);
});

const callbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

function redirectToWeb(path: string, params: Record<string, string>): string {
  const target = new URL(path, env.APP_URL);
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
  return target.toString();
}

authOAuthRouter.get("/:provider/callback", async (req, res) => {
  const provider = normalizeProvider(req.params.provider);
  const q = callbackQuerySchema.parse(req.query);

  res.setHeader("Set-Cookie", clearStateCookie());

  if (q.error) {
    return res.redirect(302, redirectToWeb("/login", { oauth_error: q.error }));
  }
  if (!q.code || !q.state) {
    throw HttpError.badRequest("Missing oauth code/state");
  }

  // CSRF guard: cookie jti must match state jti. Ensures the callback completes
  // in the same browser that initiated the redirect.
  const cookieJti = readStateCookie(req.header("cookie"));
  const statePayload = verifyOAuthState(q.state);
  if (!cookieJti || cookieJti !== statePayload.jti) {
    throw HttpError.unauthorized("OAuth state cookie missing or does not match");
  }

  const { intent, uid, claims } = await handleCallback({ provider, code: q.code, state: q.state });

  if (intent === "LINK") {
    if (!uid) throw HttpError.badRequest("LINK intent without user id");
    await linkIdentity({ userId: uid, provider, claims });
    return res.redirect(302, redirectToWeb("/parent/settings", { oauth_linked: provider.toLowerCase() }));
  }

  if (intent === "SIGNIN") {
    const outcome = await signinWithIdentity({
      provider,
      claims,
      meta: { userAgent: req.header("user-agent") ?? null, ip: clientIpFromReq(req) },
    });

    if (outcome.kind === "UNLINKED_EMAIL_MATCH") {
      // No auto-link. Tell the SPA which provider the user tried so we can show
      // a "sign in with password, then link from settings" hint.
      return res.redirect(302, redirectToWeb("/login", { social_unlinked: provider.toLowerCase() }));
    }
    if (outcome.kind === "NO_ACCOUNT") {
      // Phase 3: store the verified Google claims in a single-use ticket and
      // redirect to the signup interstitial. The signup endpoint re-checks for
      // collisions and creates user+family+identity in one go.
      const ticket = storeOAuthTicket({ kind: "SIGNUP_PENDING", provider, claims });
      return res.redirect(
        302,
        redirectToWeb("/auth/oauth/signup", {
          ticket,
          provider: provider.toLowerCase(),
          email: claims.email,
          name: claims.name ?? "",
        }),
      );
    }

    const ticket = storeOAuthTicket(outcome);
    return res.redirect(
      302,
      redirectToWeb("/auth/oauth/complete", { ticket, provider: provider.toLowerCase() }),
    );
  }

  throw HttpError.badRequest(`Intent ${intent} not yet supported`, "OAUTH_INTENT_UNSUPPORTED");
});

const completeSchema = z.object({
  ticket: z.string().min(8).max(512),
});

authOAuthRouter.post("/complete", async (req, res) => {
  const { ticket } = completeSchema.parse(req.body);
  const outcome = consumeOAuthTicket(ticket);

  if (outcome.kind === "FAMILY_SELECT") {
    return res.json({
      needsFamilySelect: true,
      selectToken: outcome.selectToken,
      families: outcome.families.map((f) => ({
        familyId: f.id,
        familyName: f.name,
        membershipId: f.membershipId,
        role: f.role,
        isBillingOwner: f.isBillingOwner ?? false,
      })),
    });
  }

  if (outcome.kind === "TOKENS") {
    const user = await prisma.user.findUnique({ where: { id: outcome.userId } });
    if (!user) throw HttpError.unauthorized();
    return res.json({
      token: outcome.token,
      refreshToken: outcome.refreshToken,
      refreshExpiresAt: outcome.refreshExpiresAt.toISOString(),
      user: serializeUserForOAuth(user),
    });
  }

  // UNLINKED_EMAIL_MATCH / NO_ACCOUNT outcomes are not stored as tickets; if
  // one slips through it indicates a logic bug.
  throw HttpError.badRequest("Unsupported ticket outcome", "OAUTH_TICKET_INVALID");
});

const signupCompleteSchema = z.object({
  ticket: z.string().min(8).max(512),
  familyName: z.string().trim().min(2).max(80),
  parentName: z.string().trim().min(1).max(80).optional(),
  acceptedTermsVersion: z.number().int().positive(),
});

authOAuthRouter.post("/signup/complete", async (req, res) => {
  const body = signupCompleteSchema.parse(req.body);
  if (body.acceptedTermsVersion < CURRENT_TERMS_VERSION) {
    throw HttpError.badRequest("Please accept the latest Terms of Service", "TERMS_OUTDATED");
  }
  const outcome = consumeOAuthTicket(body.ticket);
  if (outcome.kind !== "SIGNUP_PENDING") {
    throw HttpError.badRequest("Ticket is not a signup ticket", "OAUTH_TICKET_INVALID");
  }
  const result = await signupWithIdentity({
    provider: outcome.provider,
    claims: outcome.claims,
    familyName: body.familyName,
    parentName: body.parentName ?? null,
    acceptedTermsVersion: body.acceptedTermsVersion,
    meta: { userAgent: req.header("user-agent") ?? null, ip: clientIpFromReq(req) },
  });
  const user = await prisma.user.findUnique({ where: { id: result.userId } });
  if (!user) throw HttpError.unauthorized();
  res.json({
    token: result.token,
    refreshToken: result.refreshToken,
    refreshExpiresAt: result.refreshExpiresAt.toISOString(),
    user: serializeUserForOAuth(user),
  });
});

authOAuthRouter.get("/identities", requireAuth, async (req, res) => {
  const userId = req.auth!.sub;
  const items = await listIdentities(userId);
  res.json({ items });
});

authOAuthRouter.delete("/identities/:id", requireAuth, async (req, res) => {
  const userId = req.auth!.sub;
  const identityId = z.string().uuid().parse(req.params.id);
  await unlinkIdentity({ userId, identityId });
  res.json({ ok: true });
});
