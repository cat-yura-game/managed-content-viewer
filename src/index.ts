import { timingSafeEqual } from "node:crypto";

const SETTINGS_KEY = "display-config";
const MAX_BODY_SIZE = 4096;

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

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

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
