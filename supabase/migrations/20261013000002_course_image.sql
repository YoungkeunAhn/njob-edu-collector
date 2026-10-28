-- 강좌 이미지 링크. 원천 공식 API(서울 공공서비스예약 IMGURL, K-MOOC course_image)가 주는 https 링크만 넣는다.
-- 이미지 파일 자체는 저장하지 않는다(spec FR-014). 없으면 앱이 분야 일러스트(AI 생성, 표기)를 쓴다.
alter table course add column image_url text;

-- view 정의는 20261011000001_init.sql 과 같고 image_url 만 끝에 붙인다(create or replace 는 끝에 컬럼 추가만 허용)
create or replace view course_public with (security_invoker = true) as
select distinct on (c.title_norm, coalesce(c.provider_name, ''), c.course_start)
  c.id, c.source, s.attribution, c.title, c.course_type, c.provider_name,
  c.category_main, c.category_sub, c.mode, c.sido_code, c.sigungu_code, c.address,
  c.cost_type, c.cost_amount, c.apply_start, c.apply_end, c.course_start, c.course_end,
  c.target, c.url, c.image_url
from course c
join source s on s.code = c.source
where c.category_main is not null
  and s.enabled
  and (coalesce(c.apply_end, c.course_start) is null
       or coalesce(c.apply_end, c.course_start) >= (now() at time zone 'Asia/Seoul')::date)
order by c.title_norm, coalesce(c.provider_name, ''), c.course_start,
  case s.kind when 'api' then 0 when 'html' then 1 else 2 end, c.id;
