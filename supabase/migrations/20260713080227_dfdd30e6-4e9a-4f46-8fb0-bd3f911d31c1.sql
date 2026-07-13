
CREATE POLICY "docs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents');
CREATE POLICY "docs upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND public.can_contribute(auth.uid()));
CREATE POLICY "docs update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documents' AND (owner = auth.uid() OR public.is_admin(auth.uid())));
CREATE POLICY "docs delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND (owner = auth.uid() OR public.is_admin(auth.uid())));
