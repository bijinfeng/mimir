# API route pattern

- The server is a Hono app. Protected route groups are mounted under `/api` after `api.use('*', requireAuth)` in [`app.ts`](../../../../apps/server/src/app.ts#L85-L110). A feature route uses `new Hono<AppEnv>()` and is mounted there; [`feeds.ts`](../../../../apps/server/src/routes/feeds.ts#L1-L33) is a compact example.
- A route validates input and delegates work to a service. [`documents.ts`](../../../../apps/server/src/routes/documents.ts#L29-L65) handles query/body parsing, HTTP status, and missing records; the service owns persistence. Shared Zod schemas and types live in `@mimir/shared`, for example [`noteCreateSchema`](../../../../packages/shared/src/documents.ts#L63-L84).
- Use [`parseInput`](../../../../apps/server/src/lib/http.ts#L37-L58) for JSON or query schema validation where it fits. It turns Zod failures into a 400 `INVALID_INPUT` response with issue details. Throw `HttpError` for known HTTP failures; [`app.onError`](../../../../apps/server/src/app.ts#L131-L145) builds the common `{ error: { code, message, details? } }` envelope.
- Register specific paths before dynamic or wildcard paths when they overlap. [`/counts` precedes `/:id`](../../../../apps/server/src/routes/documents.ts#L36-L49); public auth paths precede Better Auth's wildcard in [`app.ts`](../../../../apps/server/src/app.ts#L53-L83).
- The shared renderer calls the server through [`lib/api.ts`](../../../../packages/renderer/src/lib/api.ts#L42-L126), which includes cookies and converts the error envelope to `ApiRequestError`. Add an API contract in `@mimir/shared` rather than redeclaring its shape in a component.

These examples support normal JSON resource routes. Specialized upload and streaming paths need their own existing examples before a spec is written for them.
