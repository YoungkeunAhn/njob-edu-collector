-- 더팀스(theteams) 수집 중단: Cloudflare 봇 차단 화면("Just a moment...", 403)이 Worker 요청을 막는다(이슈 #2).
-- 강좌 뷰가 s.enabled 로 거르므로 기존 행도 바로 숨겨진다.
update source set enabled = false where code = 'theteams';
