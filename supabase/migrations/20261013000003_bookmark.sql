-- 찜 + 마감 임박 푸시. 정본: backlogs/찜-마감알림/00-START-HERE.md 2.2
-- 토스 로그인 사용자. 개인정보(성별·생년월일·휴대전화번호, 선택 동의)는 토스가 준 암호문(AES-256-GCM) 그대로 둔다.
-- 복호화 키는 Worker 에도 없다 → DB 가 새도 평문이 나가지 않는다(앱인토스 체크리스트 "민감 정보 암호화 저장").
create table app_user (
  user_key     bigint primary key,           -- 토스 login-me userKey
  gender_enc   text,
  birthday_enc text,
  phone_enc    text,
  created_at   timestamptz not null default now(),
  login_at     timestamptz not null default now()
);

-- 연결 끊기 콜백이 app_user 를 지우면 찜도 같이 지워진다. 강의가 지워지면(마감·원천 삭제) 찜도 지워진다
create table bookmark (
  user_key    bigint not null references app_user (user_key) on delete cascade,
  course_id   bigint not null references course (id) on delete cascade,
  created_at  timestamptz not null default now(),
  notified_at timestamptz,                   -- 마감 알림 보낸 시각(한 번만)
  primary key (user_key, course_id)
);
create index bookmark_course_idx on bookmark (course_id);

-- 아직 알림을 안 보낸 찜과 그 강의의 마감일(접수 마감, 없으면 교육 시작일). 노출 중인 강의만
create view bookmark_due with (security_invoker = true) as
select b.user_key, b.course_id, c.title, coalesce(c.apply_end, c.course_start) as deadline
from bookmark b
join course_public c on c.id = b.course_id
where b.notified_at is null;

alter table app_user enable row level security;
alter table bookmark enable row level security;
revoke all on app_user, bookmark, bookmark_due from anon, authenticated;
