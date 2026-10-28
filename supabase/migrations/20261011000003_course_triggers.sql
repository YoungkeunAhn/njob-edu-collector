-- course 갱신 규칙 (수집-파이프라인-설계.md 7절 4, plan "마감 강좌 처리")
-- 1) 수집기(service_role)가 쓸 때 category_by='manual' 인 분류는 덮어쓰지 않는다.
--    관리자가 대시보드(postgres 역할)에서 고치거나 'rule' 로 되돌리는 것은 막지 않는다.
-- 2) last_seen_at 은 뒤로 가지 않는다. 같은 소스가 겹쳐 돌 때 늦게 끝난 이전 실행이 값을 과거로 덮어써
--    다음 정리(last_seen_at < 이번 실행 시각)에서 멀쩡한 행이 지워지는 것을 막는다.
create function course_before_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.category_by = 'manual' and current_user = 'service_role' then
    new.category_main := old.category_main;
    new.category_sub := old.category_sub;
    new.category_by := 'manual';
  end if;
  new.last_seen_at := greatest(old.last_seen_at, new.last_seen_at);
  return new;
end
$$;
revoke execute on function course_before_update() from public, anon, authenticated;

create trigger course_before_update
before update on course
for each row execute function course_before_update();
