# Logging and error pattern

- [`createApp`](../../../../apps/server/src/app.ts#L30-L35) installs Hono's request `logger()` outside tests. There is no repository-wide structured logger in these paths.
- Known HTTP errors are returned through `HttpError` and [`app.onError`](../../../../apps/server/src/app.ts#L131-L145). Unexpected errors are logged with `console.error` and return `INTERNAL_ERROR`; production responses use a generic message.
- Services use contextual `console.warn` for recoverable failures while preserving the primary operation's result. Examples: [`extractText`](../../../../apps/server/src/services/extract.ts#L37-L52) records the parse failure and returns it, while [`upload.ts`](../../../../apps/server/src/services/upload.ts#L264-L274) warns that failed chunking can be repaired by reindexing.
- Do not infer a required request ID, JSON log schema, or central logging abstraction from these examples. For the next feature, follow the nearest existing failure path and keep user-facing errors in the HTTP response rather than relying on logs alone.
