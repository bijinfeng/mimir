CREATE TABLE "chunk_embeddings" (
	"chunk_id" text NOT NULL,
	"model" text NOT NULL,
	"dimension" integer NOT NULL,
	"embedding" halfvec NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chunk_embeddings_chunk_id_model_pk" PRIMARY KEY("chunk_id","model")
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"idx" integer NOT NULL,
	"content" text NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"start_at" integer NOT NULL,
	"end_at" integer NOT NULL,
	"heading" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chunk_embeddings" ADD CONSTRAINT "chunk_embeddings_chunk_id_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chunks_document_idx_idx" ON "chunks" USING btree ("document_id","idx");--> statement-breakpoint
CREATE INDEX "chunks_search_idx" ON "chunks" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "chunks_content_trgm_idx" ON "chunks" USING gin ("content" gin_trgm_ops);--> statement-breakpoint
-- 向量索引（手写，drizzle 表达不了表达式索引）。
--
-- **按维度分区的 HNSW**：一张 chunk_embeddings 同时容纳多个不同维度的模型，
-- 换模型时旧向量共存、不立刻删（docs/TECH.md §4.8）。
--
-- 查询必须写成**同一个表达式** `embedding::halfvec(1024) <=> $1` 并带上
-- `WHERE dimension = 1024`，否则索引静默不命中（docs/TECH.md §4.8 点名
-- 这是本期最容易踩的一处）。
--
-- 三个常用维度都建：1024（BGE / Qwen / M3E 这类默认）、
-- 1536（OpenAI text-embedding-3-small）、3072（text-embedding-3-large；
-- 超过 2000 维必须 halfvec，§4.5 实测）。配置了别的维度时查询仍正确，
-- 只是走顺扫——个人库规模下可接受（§4.6：5000 向量 0.084ms 是索引值，
-- 顺扫在万级以内也是毫秒级）；要索引就照这条语句加一行。
CREATE INDEX IF NOT EXISTS "chunk_embeddings_1024_idx" ON "chunk_embeddings"
  USING hnsw ((embedding::halfvec(1024)) halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64) WHERE (dimension = 1024);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chunk_embeddings_1536_idx" ON "chunk_embeddings"
  USING hnsw ((embedding::halfvec(1536)) halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64) WHERE (dimension = 1536);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chunk_embeddings_3072_idx" ON "chunk_embeddings"
  USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64) WHERE (dimension = 3072);