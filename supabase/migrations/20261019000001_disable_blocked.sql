-- 주변애(greenlove)·잡아바(jobaba) 수집 중단: 두 사이트가 Cloudflare IP 를 막아 Worker 에서 받을 수 없다(이슈 #2).
-- 강좌 뷰가 s.enabled 로 거르므로 기존 행도 바로 숨겨진다.
update source set enabled = false where code in ('greenlove', 'jobaba');
