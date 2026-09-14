# Managed Content Viewer

Прокси JSON-подписки на Cloudflare Workers. Корневой адрес `/` потоково возвращает ответ выбранного внешнего HTTPS-источника, а `/admin.html` позволяет администратору менять этот источник для всех клиентов.

Worker передаёт источнику метод `GET` или `HEAD`, параметры запроса и клиентские заголовки, кроме чувствительных служебных заголовков. Статус, заголовки и тело ответа источника возвращаются клиенту без разбора JSON и без буферизации.

## Локальный запуск

```bash
npm install
npm run types
npx wrangler secret put ADMIN_TOKEN
npm run dev
```

Адрес подписки: `http://localhost:8787/`. Админка: `http://localhost:8787/admin.html`.

## Развёртывание

```bash
npx wrangler secret put ADMIN_TOKEN
npm run deploy
```

KV создаётся автоматически при первом развёртывании. Секрет `ADMIN_TOKEN` никогда не добавляйте в Git.
