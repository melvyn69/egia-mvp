revoke all on function public.claim_review_analyze_jobs(int, text, text) from anon, authenticated;
grant execute on function public.claim_review_analyze_jobs(int, text, text) to service_role;
