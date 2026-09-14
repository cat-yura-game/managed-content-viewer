# Managed Content Viewer

Небольшой сайт на Cloudflare Workers. Публичная страница показывает выбранный внешний HTTPS-адрес в изолированном iframe, а `/admin.html` позволяет администратору менять этот адрес для всех посетителей.

## Локальный запуск

```bash
npm install
npm run types
npx wrangler secret put ADMIN_TOKEN
npm run dev
```

Откройте `http://localhost:8787/` и `http://localhost:8787/admin.html`.

## Развёртывание

```bash
npx wrangler secret put ADMIN_TOKEN
npm run deploy
```

KV создаётся автоматически при первом развёртывании. Секрет `ADMIN_TOKEN` никогда не добавляйте в Git.

> Внешний сайт может запретить показ в iframe через `X-Frame-Options` или CSP. В таком случае посетителю остаётся кнопка открытия исходной страницы в новой вкладке.
