import { timingSafeEqual } from "node:crypto";

const SETTINGS_KEY = "display-config";
const MAX_BODY_SIZE = 4096;
const PROXY_PATHS = new Set(["/", "/subscription"]);
const BLOCKED_REQUEST_HEADERS = new Set([
  "authorization",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cookie",
  "forwarded",
  "host",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
]);

type StoredConfig = {
  targetUrl: string;
  updatedAt: string | null;
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function validTarget(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);

  return timingSafeEqual(new Uint8Array(providedHash), new Uint8Array(expectedHash));
}

async function isAuthorized(request: Request, env: Env): Promise<boolean> {
  const header = request.headers.get("Authorization") ?? "";
  const adminToken = "ADMIN_TOKEN" in env && typeof env.ADMIN_TOKEN === "string" ? env.ADMIN_TOKEN : "";
  if (!header.startsWith("Bearer ") || !adminToken) return false;
  return secretsMatch(header.slice(7), adminToken);
}

async function readConfig(env: Env): Promise<StoredConfig> {
  const stored = await env.SETTINGS.get<StoredConfig>(SETTINGS_KEY, "json");
  if (stored && validTarget(stored.targetUrl)) return stored;

  return {
    targetUrl: env.DEFAULT_TARGET_URL,
    updatedAt: null,
  };
}

function upstreamRequestHeaders(request: Request): Headers {
  const headers = new Headers();

  for (const [name, value] of request.headers) {
    const lowerName = name.toLowerCase();
    if (BLOCKED_REQUEST_HEADERS.has(lowerName) || lowerName.startsWith("cf-")) continue;
    headers.set(name, value);
  }

  return headers;
}

async function proxySubscription(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  const requestUrl = new URL(request.url);
  const config = await readConfig(env);
  const upstreamUrl = new URL(config.targetUrl);

  if (upstreamUrl.origin === requestUrl.origin) {
    return json({ error: "Адрес источника не может указывать на этот же Worker." }, 508);
  }

  for (const [name, value] of requestUrl.searchParams) {
    upstreamUrl.searchParams.append(name, value);
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: upstreamRequestHeaders(request),
      redirect: "follow",
    });

    console.log(JSON.stringify({
      event: "subscription_proxied",
      hostname: upstreamUrl.hostname,
      status: upstreamResponse.status,
    }));

    return new Response(upstreamResponse.body, upstreamResponse);
  } catch (error) {
    console.error(JSON.stringify({
      event: "subscription_proxy_failed",
      hostname: upstreamUrl.hostname,
      message: error instanceof Error ? error.message : "Unknown upstream error",
    }));
    return json({ error: "Источник подписки временно недоступен." }, 502);
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (PROXY_PATHS.has(url.pathname)) {
      return proxySubscription(request, env);
    }

    if (url.pathname === "/api/config" && request.method === "GET") {
      const config = await readConfig(env);
      return json(config);
    }

    if (url.pathname === "/api/config" && request.method === "PUT") {
      if (!(await isAuthorized(request, env))) {
        return json({ error: "Неверный пароль администратора." }, 401);
      }

      const contentLength = Number(request.headers.get("Content-Length") ?? "0");
      if (contentLength > MAX_BODY_SIZE) {
        return json({ error: "Слишком большой запрос." }, 413);
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Некорректный JSON." }, 400);
      }

      const targetUrl = (body as { targetUrl?: unknown })?.targetUrl;
      if (!validTarget(targetUrl)) {
        return json({ error: "Укажите корректную HTTPS-ссылку." }, 400);
      }

      const config: StoredConfig = {
        targetUrl,
        updatedAt: new Date().toISOString(),
      };

      await env.SETTINGS.put(SETTINGS_KEY, JSON.stringify(config));
      console.log(JSON.stringify({ event: "config_updated", hostname: new URL(targetUrl).hostname }));
      return json(config);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Маршрут не найден." }, 404);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
