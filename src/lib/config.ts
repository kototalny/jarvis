import type { Provider } from "./platform-meta";
import { getSetting } from "./settings";

export { PLATFORM_LABELS, type Platform, type Provider } from "./platform-meta";

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

export const config = {
  get appUrl() {
    return env("APP_URL", "http://localhost:3000").replace(/\/+$/, "");
  },
  get timezone() {
    return env("APP_TIMEZONE", "Europe/Warsaw");
  },
  get dataDir() {
    return env("DATA_DIR", "./data");
  },
  get adminPassword() {
    return env("ADMIN_PASSWORD");
  },
  get sessionSecret() {
    return env("SESSION_SECRET");
  },
  meta: {
    get appId() {
      return getSetting("META_APP_ID");
    },
    get appSecret() {
      return getSetting("META_APP_SECRET");
    },
    get graphVersion() {
      return env("META_GRAPH_VERSION", "v23.0");
    },
    /** Optional: configuration ID from "Facebook Login for Business" (used instead of scopes). */
    get configId() {
      return getSetting("META_CONFIG_ID");
    },
  },
  google: {
    get clientId() {
      return getSetting("GOOGLE_CLIENT_ID");
    },
    get clientSecret() {
      return getSetting("GOOGLE_CLIENT_SECRET");
    },
  },
  tiktok: {
    get clientKey() {
      return getSetting("TIKTOK_CLIENT_KEY");
    },
    get clientSecret() {
      return getSetting("TIKTOK_CLIENT_SECRET");
    },
  },
};

export function isProviderConfigured(provider: Provider): boolean {
  switch (provider) {
    case "meta":
      return !!(config.meta.appId && config.meta.appSecret);
    case "youtube":
      return !!(config.google.clientId && config.google.clientSecret);
    case "tiktok":
      return !!(config.tiktok.clientKey && config.tiktok.clientSecret);
  }
}

export function redirectUri(provider: Provider): string {
  return `${config.appUrl}/api/callback/${provider}`;
}

export function mediaPublicUrl(filename: string): string {
  return `${config.appUrl}/media/${filename}`;
}
