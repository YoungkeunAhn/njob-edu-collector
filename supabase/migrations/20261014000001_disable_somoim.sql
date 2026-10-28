-- 소모임 수집 중단. 강좌 뷰가 s.enabled로 거르므로 기존 행도 바로 숨겨진다.
update source set enabled = false where code = 'somoim';
