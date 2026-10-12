# API route pattern

- The server is a Hono app. Protected route groups are mounted under `/api` after `api.use('*', requireAuth)` in [`app.ts`](../../../../apps/server/src/app.ts#L85-L110). A feature route uses `new Hono<AppEnv>()` and is mounted there; [`feeds.ts`](../../../../apps/server/src/routes/feeds.ts#L1-L33) is a compact example.
- A route validates input and delegates work to a service. [`documents.ts`](../../../../apps/server/src/routes/documents.ts#L29-L65) handles query/body parsing, HTTP status, and missing records; the service owns persistence. Shared Zod schemas and types live in `@mimir/shared`, for example [`noteCreateSchema`](../../../../packages/shared/src/documents.ts#L63-L84).
- Use [`parseInput`](../../../../apps/server/src/lib/http.ts#L37-L58) for JSON or query schema validation where it fits. It turns Zod failures into a 400 `INVALID_INPUT` response with issue details. Throw `HttpError` for known HTTP failures; [`app.onError`](../../../../apps/server/src/app.ts#L131-L145) builds the common `{ error: { code, message, details? } }` envelope.
- Register specific paths before dynamic or wildcard paths when they overlap. [`/counts` precedes `/:id`](../../../../apps/server/src/routes/documents.ts#L36-L49); public auth paths precede Better Auth's wildcard in [`app.ts`](../../../../apps/server/src/app.ts#L53-L83).
- The shared renderer calls the server through [`lib/api.ts`](../../../../packages/renderer/src/lib/api.ts#L42-L126), which includes cookies and converts the error envelope to `ApiRequestError`. Add an API contract in `@mimir/shared` rather than redeclaring its shape in a component.

These examples support normal JSON resource routes. Specialized upload and streaming paths need their own existing examples before a spec is written for them.

## Scenario: current file extension in document summaries

### 1. Scope / Trigger

Knowledge-base list and card views need the current uploaded file's suffix. Upload titles omit the suffix, and replacing an original can change its format. Keep this derived response field in the shared document contract rather than reading storage metadata from the browser.

### 2. Signatures

- `documentSummarySchema.fileExtension: string | null` in `packages/shared/src/documents.ts`.
- `toSummary(row, tags)` in `services/documents.ts` and `toUploadSummary(row, tags)` in `services/upload.ts` derive it with `extensionOf(row.sourceKey ?? '')` for `kind === 'file'`.

### 3. Contracts

- List, detail, upload and replacement responses use the same `DocumentSummary` field. It is a lowercase extension **without** the dot, or `null`; no storage key or full original filename is exposed.
- `sourceKey` names the active original, including after replacement. The visible title stays user-editable; the renderer appends `.${fileExtension}` only if the title does not already end with that suffix.
- No request field, database column or environment key is added.

### 4. Validation & Error Matrix

| Source state | Summary value | UI behavior |
| --- | --- | --- |
| File with recognizable extension in active `sourceKey` | Lowercase extension | Show suffix and matching type icon |
| File with no recognizable extension/key | `null` | Keep title; use known MIME for icon when available, otherwise generic icon |
| Note, web or other non-file | `null` | Keep original title and source icon |

An invalid file still follows the existing upload/replace validation and errors; this derived field creates no new rejection path.

### 5. Good / Base / Bad Cases

- Good: replacing `draft.docx` with `draft.pdf` returns `fileExtension: 'pdf'` and the next list load shows `.pdf`.
- Base: `notes` is a note title and remains `notes` with `fileExtension: null`.
- Bad: deriving the suffix from `title` or MIME can display a stale or invented extension after replacement.

### 6. Tests Required

- Server upload and replacement assertions compare `fileExtension` with the active stored source key; list/detail summaries agree with the immediate response.
- Renderer assertions cover no duplicate suffix, non-file title unchanged, file icon categories and fallback, and a long name whose suffix remains visible in a narrow list/card.

### 7. Wrong vs Correct

```ts
// Wrong: titleFromFilename already removed the extension, and MIME may be generic.
const suffix = extensionOf(row.title)
// Correct: the active original is the source of truth, also after replacement.
const suffix = row.kind === 'file' ? extensionOf(row.sourceKey ?? '') || null : null
```
