#!/usr/bin/env bash
set -euo pipefail
context=$(mktemp -d /tmp/mimir-minio-amd64.XXXXXX)
container=mimir-minio-official-amd64-verify
cleanup() {
  docker --context colima rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$context"
}
trap cleanup EXIT
cp /tmp/mimir-minio-linux-amd64 "$context/minio"
printf '%s\n' '7c5bd8512c6e966455b1d198209358b2d191c77a83ab377c4073281065fb855f  minio' > "$context/checksum"
(cd "$context" && shasum -a 256 -c checksum)
chmod +x "$context/minio"
printf '%s\n' 'FROM scratch' 'COPY minio /minio' 'ENTRYPOINT ["/minio"]' > "$context/Dockerfile"
docker --context colima build --platform linux/amd64 --tag mimir-minio-official-amd64-verification "$context"
docker --context colima image inspect mimir-minio-official-amd64-verification --format '{{.Os}}/{{.Architecture}}'
docker --context colima run --rm --platform linux/amd64 mimir-minio-official-amd64-verification --version
docker --context colima run --rm --detach --platform linux/amd64 --name "$container" \
 -p 127.0.0.1:19000:9000 \
 -e MINIO_ROOT_USER=mimirtest -e MINIO_ROOT_PASSWORD=mimirtest-secret-only \
 mimir-minio-official-amd64-verification server /data --address :9000 --console-address :9001
for attempt in $(seq 1 30); do
 if curl --fail --silent http://127.0.0.1:19000/minio/health/live >/dev/null; then break; fi
 sleep 1
done
curl --fail --silent http://127.0.0.1:19000/minio/health/live >/dev/null
PATH=/Users/admin/.nvm/versions/node/v22.23.1/bin:$PATH \
 MIMIR_S3_TEST_ENDPOINT=http://127.0.0.1:19000 \
 MIMIR_S3_TEST_ACCESS_KEY=mimirtest MIMIR_S3_TEST_SECRET_KEY=mimirtest-secret-only \
 pnpm --filter @mimir/plugin-storage exec vitest run src/s3.integration.test.ts
