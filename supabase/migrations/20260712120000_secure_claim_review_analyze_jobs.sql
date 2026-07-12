-- Reserved to server workers using service_role; public callers must not claim jobs.
revoke execute
on function public.claim_review_analyze_jobs(integer, text, text)
from public;

revoke execute
on function public.claim_review_analyze_jobs(integer, text, text)
from anon;

revoke execute
on function public.claim_review_analyze_jobs(integer, text, text)
from authenticated;

grant execute
on function public.claim_review_analyze_jobs(integer, text, text)
to service_role;
