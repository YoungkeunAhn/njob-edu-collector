-- 강좌 수집 스키마. 정본: docs/06-스펙/plan.md (Data Model), docs/03-데이터수집/수집-파이프라인-설계.md 3·4절
-- 앱은 DB에 직접 접근하지 않는다(plan D3). Worker 만 service_role 로 읽고 쓴다.

create table source (
  code        text primary key,
  name        text not null,
  kind        text not null check (kind in ('api', 'html', 'headless')),
  grp         text not null check (grp in ('A', 'B', 'C', 'D')),
  license     text,
  attribution text not null,
  robots_ok   boolean,
  terms_checked_at date,
  enabled     boolean not null default true
);

create table course (
  id            bigint generated always as identity primary key,
  source        text not null references source (code),
  source_id     text not null,
  title         text not null,
  title_norm    text not null,              -- 중복 판정용 정규화 제목 (worker core normTitle)
  course_type   text not null check (course_type in ('oneday', 'training')),
  provider_name text,
  category_main text,                       -- null = 키워드 미매칭, 노출 안 함 (plan D13)
  category_sub  text,
  category_by   text not null default 'rule' check (category_by in ('rule', 'manual')), -- manual 은 자동 분류가 덮어쓰지 않는다
  mode          text check (mode in ('online', 'offline', 'blended')),
  sido_code     char(2),
  sigungu_code  char(5),
  address       text,
  cost_type     text check (cost_type in ('free', 'card', 'partial', 'paid')),
  cost_amount   int,
  apply_start   date,
  apply_end     date,
  course_start  date,
  course_end    date,
  target        text,                       -- 대상 자격 원문
  target_tags   text[],
  capacity      int,
  url           text not null,
  last_seen_at  timestamptz not null default now(),
  unique (source, source_id)
);
create index course_filter_idx on course (category_main, sido_code, course_type);
create index course_deadline_idx on course ((coalesce(apply_end, course_start)));

create table collect_run (
  id          bigint generated always as identity primary key,
  source      text not null references source (code),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  fetched     int,
  upserted    int,
  error       text
);
create index collect_run_source_idx on collect_run (source, started_at desc);

-- 노출용 view: 마감 전(KST) + 분류됨 + 중복 1건(공식 API 소스 우선). 내부 컬럼은 뺀다.
-- 원천 레코드 원본(raw)은 설명문·강사명·연락처가 섞일 수 있어 저장하지 않는다 (spec FR-014).
create view course_public with (security_invoker = true) as
select distinct on (c.title_norm, coalesce(c.provider_name, ''), c.course_start)
  c.id, c.source, s.attribution, c.title, c.course_type, c.provider_name,
  c.category_main, c.category_sub, c.mode, c.sido_code, c.sigungu_code, c.address,
  c.cost_type, c.cost_amount, c.apply_start, c.apply_end, c.course_start, c.course_end,
  c.target, c.url
from course c
join source s on s.code = c.source
where c.category_main is not null
  and s.enabled
  and (coalesce(c.apply_end, c.course_start) is null
       or coalesce(c.apply_end, c.course_start) >= (now() at time zone 'Asia/Seoul')::date)
order by c.title_norm, coalesce(c.provider_name, ''), c.course_start,
  case s.kind when 'api' then 0 when 'html' then 1 else 2 end, c.id;

-- RLS 켜고 정책은 두지 않는다 → anon·authenticated 는 아무것도 못 읽는다. service_role 은 RLS 우회.
alter table source enable row level security;
alter table course enable row level security;
alter table collect_run enable row level security;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
