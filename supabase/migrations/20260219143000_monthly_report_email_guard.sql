-- Enforce email requirement when enabling monthly reports
create or replace function public.ensure_monthly_report_email()
returns trigger as $$
begin
  if new.receive_monthly_reports = true then
    if not exists (
      select 1
      from public.user_profiles up
      where up.user_id = new.user_id
        and up.email is not null
        and up.email <> ''
    ) then
      raise exception 'email_required_for_monthly_report';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_team_members_monthly_report_email on public.team_members;
create trigger trg_team_members_monthly_report_email
before insert or update of receive_monthly_reports on public.team_members
for each row
execute function public.ensure_monthly_report_email();
