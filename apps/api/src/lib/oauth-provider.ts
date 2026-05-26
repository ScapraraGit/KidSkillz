import { OAuth2Client } from "google-auth-library";
import { env } from "../env.js";

export type OAuthProviderName = "GOOGLE";

export interface OAuthClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export interface OAuthTokenSet {
  idToken: string;
  accessToken?: string;
  expiresAt?: Date;
}

export interface OAuthProvider {
  name: OAuthProviderName;
  buildAuthUrl(params: { state: string; nonce: string; redirectUri: string }): string;
  exchangeCode(params: { code: string; redirectUri: string }): Promise<OAuthTokenSet>;
  verifyIdToken(params: { idToken: string; nonce: string }): Promise<OAuthClaims>;
}

class GoogleOAuthProvider implements OAuthProvider {
  readonly name = "GOOGLE" as const;
  private client: OAuth2Client;
  private clientId: string;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.client = new OAuth2Client({ clientId, clientSecret });
  }

  buildAuthUrl({ state, nonce, redirectUri }: { state: string; nonce: string; redirectUri: string }): string {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    return url.toString();
  }

  async exchangeCode({ code, redirectUri }: { code: string; redirectUri: string }): Promise<OAuthTokenSet> {
    const { tokens } = await this.client.getToken({ code, redirect_uri: redirectUri });
    if (!tokens.id_token) {
      throw new Error("[oauth:google] token exchange returned no id_token");
    }
    return {
      idToken: tokens.id_token,
      accessToken: tokens.access_token ?? undefined,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    };
  }

  async verifyIdToken({ idToken, nonce }: { idToken: string; nonce: string }): Promise<OAuthClaims> {
    const ticket = await this.client.verifyIdToken({ idToken, audience: this.clientId });
    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error("[oauth:google] id_token had no payload");
    }
    if (payload.nonce !== nonce) {
      throw new Error("[oauth:google] nonce mismatch");
    }
    if (!payload.sub) {
      throw new Error("[oauth:google] id_token missing sub");
    }
    if (!payload.email) {
      throw new Error("[oauth:google] id_token missing email");
    }
    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: payload.name ?? undefined,
      picture: payload.picture ?? undefined,
    };
  }
}

class DisabledOAuthProvider implements OAuthProvider {
  readonly name: OAuthProviderName;
  constructor(name: OAuthProviderName) {
    this.name = name;
  }
  buildAuthUrl(): string {
    throw new Error(
      `[oauth:${this.name}] disabled — set SOCIAL_LOGIN_ENABLED=true and configure client credentials`,
    );
  }
  async exchangeCode(): Promise<OAuthTokenSet> {
    throw new Error(`[oauth:${this.name}] disabled`);
  }
  async verifyIdToken(): Promise<OAuthClaims> {
    throw new Error(`[oauth:${this.name}] disabled`);
  }
}

function buildGoogleProvider(): OAuthProvider {
  if (!env.SOCIAL_LOGIN_ENABLED) {
    return new DisabledOAuthProvider("GOOGLE");
  }
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error("SOCIAL_LOGIN_ENABLED=true but GOOGLE_OAUTH_CLIENT_ID/SECRET unset");
  }
  if (!env.GOOGLE_OAUTH_REDIRECT_URI) {
    throw new Error("SOCIAL_LOGIN_ENABLED=true but GOOGLE_OAUTH_REDIRECT_URI unset");
  }
  return new GoogleOAuthProvider(env.GOOGLE_OAUTH_CLIENT_ID, env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export const googleOAuthProvider: OAuthProvider = buildGoogleProvider();

export function getOAuthProvider(name: OAuthProviderName): OAuthProvider {
  switch (name) {
    case "GOOGLE":
      return googleOAuthProvider;
    default: {
      const _exhaustive: never = name;
      throw new Error(`[oauth] unknown provider: ${_exhaustive as string}`);
    }
  }
}
