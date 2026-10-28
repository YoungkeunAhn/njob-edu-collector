-- 정원 노출 + 정렬·검색용 컬럼 (backlogs/002 N1). 정원은 수집 때부터 저장해 왔고 view 에만 없었다.
-- price_sort: 가격순 정렬 기준. 무료는 0, 그 밖은 금액(내일배움카드는 자부담), 모르면 null(맨 뒤). 응답에는 내보내지 않는다.
-- title_norm: 제목 검색(띄어쓰기·기호 무시). 응답에는 내보내지 않는다.
-- view 정의는 20261013000002_course_image.sql 과 같고 끝에 컬럼만 붙인다(create or replace 는 끝에 컬럼 추가만 허용)
create or replace view course_public with (security_invoker = true) as
select distinct on (c.title_norm, coalesce(c.provider_name, ''), c.course_start)
  c.id, c.source, s.attribution, c.title, c.course_type, c.provider_name,
  c.category_main, c.category_sub, c.mode, c.sido_code, c.sigungu_code, c.address,
  c.cost_type, c.cost_amount, c.apply_start, c.apply_end, c.course_start, c.course_end,
  c.target, c.url, c.image_url,
  c.capacity,
  case when c.cost_type = 'free' then 0 else c.cost_amount end as price_sort,
  c.title_norm
from course c
join source s on s.code = c.source
where c.category_main is not null
  and s.enabled
  and (coalesce(c.apply_end, c.course_start) is null
       or coalesce(c.apply_end, c.course_start) >= (now() at time zone 'Asia/Seoul')::date)
order by c.title_norm, coalesce(c.provider_name, ''), c.course_start,
  case s.kind when 'api' then 0 when 'html' then 1 else 2 end, c.id;
