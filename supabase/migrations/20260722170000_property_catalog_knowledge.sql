-- Catálogo imobiliário como fonte estruturada da base de conhecimento.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS knowledge_status text NOT NULL DEFAULT 'pending'
    CHECK (knowledge_status IN ('pending', 'processing', 'ready', 'error')),
  ADD COLUMN IF NOT EXISTS knowledge_error text,
  ADD COLUMN IF NOT EXISTS knowledge_indexed_at timestamptz;

ALTER TABLE public.ai_knowledge_documents
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'product')),
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS ai_knowledge_documents_product_id_key
  ON public.ai_knowledge_documents(product_id)
  WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_knowledge_status_idx
  ON public.products(account_id, knowledge_status);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-media',
  'product-media',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS product_media_storage_insert ON storage.objects;
CREATE POLICY product_media_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-media'
    AND (storage.foldername(name))[1] LIKE 'account-%'
    AND public.is_account_member(
      substring((storage.foldername(name))[1] from 9)::uuid,
      'admin'
    )
  );

DROP POLICY IF EXISTS product_media_storage_update ON storage.objects;
CREATE POLICY product_media_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-media'
    AND public.is_account_member(
      substring((storage.foldername(name))[1] from 9)::uuid,
      'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'product-media'
    AND public.is_account_member(
      substring((storage.foldername(name))[1] from 9)::uuid,
      'admin'
    )
  );

DROP POLICY IF EXISTS product_media_storage_delete ON storage.objects;
CREATE POLICY product_media_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-media'
    AND public.is_account_member(
      substring((storage.foldername(name))[1] from 9)::uuid,
      'admin'
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_knowledge_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_knowledge_chunks TO authenticated;
