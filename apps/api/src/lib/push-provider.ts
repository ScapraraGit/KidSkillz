import admin from "firebase-admin";
import { env } from "../env.js";

// Push delivery behind a provider interface — same swap-one-class shape as
// EmailProvider/StorageProvider. FCM fronts both APNs (iOS) and Android, so a
// single provider covers both stores. PUSH_ENABLED is the kill-switch: when
// false (default) a ConsoleProvider logs instead of hitting the network, so
// dev/local and CI never need real FCM credentials.

export interface PushMessage {
  // Device tokens to fan out to. Empty array is a no-op.
  tokens: string[];
  title: string;
  body?: string;
  // Deep-link / routing payload. FCM requires all data values to be strings.
  data?: Record<string, string>;
}

export interface PushSendResult {
  successCount: number;
  failureCount: number;
  // Tokens FCM reported as unregistered/invalid — callers should prune these
  // from PushToken so a dead device doesn't accrue failures forever.
  invalidTokens: string[];
}

export interface PushProvider {
  send(msg: PushMessage): Promise<PushSendResult>;
}

class FcmProvider implements PushProvider {
  private messaging: admin.messaging.Messaging;

  // Accepts either a credentialed AppOptions (service-account JSON path) or an
  // ADC path (Application Default Credentials — used in dev when org policy
  // blocks service-account key creation; firebase-admin picks the OAuth refresh
  // token gcloud writes at `gcloud auth application-default login`).
  constructor(opts: admin.AppOptions) {
    // Reuse the default app across hot-reloads / repeated imports — initializeApp
    // throws if called twice with the same (default) name.
    const app = admin.apps.length ? admin.app() : admin.initializeApp(opts);
    this.messaging = admin.messaging(app);
  }

  async send(msg: PushMessage): Promise<PushSendResult> {
    if (msg.tokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }
    const res = await this.messaging.sendEachForMulticast({
      tokens: msg.tokens,
      notification: { title: msg.title, body: msg.body },
      data: msg.data,
    });
    const invalidTokens: string[] = [];
    res.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-argument" ||
        code === "messaging/invalid-registration-token"
      ) {
        invalidTokens.push(msg.tokens[i]);
      }
    });
    return { successCount: res.successCount, failureCount: res.failureCount, invalidTokens };
  }
}

class ConsolePushProvider implements PushProvider {
  async send(msg: PushMessage): Promise<PushSendResult> {
    // eslint-disable-next-line no-console
    console.log("[push:console]", {
      tokens: msg.tokens.length,
      title: msg.title,
      bodyPreview: msg.body?.slice(0, 120) ?? null,
      data: msg.data ?? null,
    });
    return { successCount: msg.tokens.length, failureCount: 0, invalidTokens: [] };
  }
}

function buildProvider(): PushProvider {
  if (!env.PUSH_ENABLED) return new ConsolePushProvider();
  if (env.FCM_SERVICE_ACCOUNT_JSON) {
    const credential = admin.credential.cert(
      JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON) as admin.ServiceAccount,
    );
    return new FcmProvider({ credential });
  }
  // ADC fallback for dev when org policy blocks service-account keys. Requires
  // `gcloud auth application-default login` on the host and FCM_PROJECT_ID set
  // so firebase-admin knows which Firebase project to message.
  if (env.FCM_PROJECT_ID) {
    return new FcmProvider({ projectId: env.FCM_PROJECT_ID });
  }
  throw new Error("PUSH_ENABLED=true but neither FCM_SERVICE_ACCOUNT_JSON nor FCM_PROJECT_ID is set");
}

export const pushProvider: PushProvider = buildProvider();
