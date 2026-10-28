-- 제목 검색 보강 (backlogs/002 F7, 2026-10-15): 약어 한글 이름("지피티"·"GPT"), 초성 검색("ㅈㅍㅌ").
-- 규칙의 정본은 worker/src/core/search.ts 의 searchKey·choseongKey. 여기는 같은 규칙의 SQL 판이다(worker/test/db.test.ts 가 비교).

-- 검색 키: title_norm(소문자·공백·기호 제거된 제목)의 알파벳을 한글 이름으로
create function search_key(t text) returns text language sql immutable parallel safe as $$
  select coalesce(string_agg(case when ch ~ '^[a-z]$' then (array['에이','비','씨','디','이','에프','지','에이치','아이','제이','케이','엘','엠','엔','오','피','큐','알','에스','티','유','브이','더블유','엑스','와이','제트'])[ascii(ch) - 96] else ch end, '' order by i), '')
  from (select substr(t, i, 1) as ch, i from generate_series(1, length(t)) as i) s
$$;

-- 초성 키: 한글 음절의 초성만 남긴다(그 밖의 글자는 버린다)
create function hangul_cho(t text) returns text language sql immutable parallel safe as $$
  select coalesce(string_agg(substr('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', (ascii(ch) - 44032) / 588 + 1, 1), '' order by i), '')
  from (select substr(t, i, 1) as ch, i from generate_series(1, length(t)) as i) s
  where ascii(ch) between 44032 and 55203
$$;

-- anon·authenticated 가 /rpc 로 부르지 못하게. 조회 API(service_role)만
revoke execute on function search_key(text) from public, anon, authenticated;
revoke execute on function hangul_cho(text) from public, anon, authenticated;
grant execute on function search_key(text) to service_role;
grant execute on function hangul_cho(text) to service_role;

-- view 정의는 20261014000002_course_public_capacity_sort.sql 과 같고 끝에 search_key·title_cho 만 붙인다
create or replace view course_public with (security_invoker = true) as
select distinct on (c.title_norm, coalesce(c.provider_name, ''), c.course_start)
  c.id, c.source, s.attribution, c.title, c.course_type, c.provider_name,
  c.category_main, c.category_sub, c.mode, c.sido_code, c.sigungu_code, c.address,
  c.cost_type, c.cost_amount, c.apply_start, c.apply_end, c.course_start, c.course_end,
  c.target, c.url, c.image_url,
  c.capacity,
  case when c.cost_type = 'free' then 0 else c.cost_amount end as price_sort,
  c.title_norm,
  search_key(c.title_norm) as search_key,
  hangul_cho(search_key(c.title_norm)) as title_cho
from course c
join source s on s.code = c.source
where c.category_main is not null
  and s.enabled
  and (coalesce(c.apply_end, c.course_start) is null
       or coalesce(c.apply_end, c.course_start) >= (now() at time zone 'Asia/Seoul')::date)
order by c.title_norm, coalesce(c.provider_name, ''), c.course_start,
  case s.kind when 'api' then 0 when 'html' then 1 else 2 end, c.id;
