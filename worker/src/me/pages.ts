// 약관·개인정보 처리방침(콘솔 토스 로그인 "약관/동의문"에 URL로 등록). 초안 — 사업자가 검토 후 확정한다
const SERVICE = "N잡 배움터";
const COMPANY = "도란도란";
const CONTACT = "tosan0002@naver.com";
const EFFECTIVE = "2026년 10월 13일";

const page = (title: string, body: string) => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - ${SERVICE}</title>
<style>body{margin:0;padding:24px 16px 48px;font:15px/1.7 -apple-system,"Apple SD Gothic Neo",sans-serif;color:#191f28;background:#fff;max-width:720px}
h1{font-size:22px}h2{font-size:17px;margin-top:28px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #e5e8eb;padding:8px;text-align:left;vertical-align:top}</style>
</head><body><h1>${title}</h1>${body}<p>시행일: ${EFFECTIVE}</p></body></html>`;

export const TERMS = page("서비스 이용약관", `
<h2>제1조 (목적)</h2><p>이 약관은 ${COMPANY}(이하 "회사")가 토스 앱 안에서 제공하는 "${SERVICE}"(이하 "서비스")의 이용 조건과 절차를 정합니다.</p>
<h2>제2조 (서비스 내용)</h2><p>서비스는 공공·민간 기관이 공개한 교육·강의 정보를 모아 지역·분야별로 보여주는 정보 제공 서비스입니다. 회사는 강의를 직접 운영하거나 신청을 대행하지 않으며, 신청 자격 판단과 신청은 이용자가 원문 사이트에서 직접 합니다.</p>
<h2>제3조 (정보의 정확성)</h2><p>강의 정보는 각 기관의 공개 자료를 자동으로 모은 것으로, 원문과 다르거나 바뀌었을 수 있습니다. 접수 기간·비용·대상 등은 반드시 원문에서 확인해 주세요. 회사는 원문 정보의 오류나 변경으로 생긴 손해에 대해 고의 또는 중대한 과실이 없는 한 책임지지 않습니다.</p>
<h2>제4조 (토스 로그인과 찜)</h2><p>찜 기능과 마감 알림은 토스 로그인 후 이용할 수 있습니다. 이용자는 토스 앱 설정에서 언제든 연결을 끊을 수 있고, 연결을 끊으면 찜 목록 등 이용자 정보가 삭제됩니다.</p>
<h2>제5조 (알림)</h2><p>알림 수신에 동의한 이용자에게 찜한 강의의 접수 마감 하루 전에 알림을 보냅니다. 알림은 토스 앱 설정에서 끌 수 있습니다.</p>
<h2>제6조 (서비스 변경·중단)</h2><p>회사는 운영상 필요하면 서비스의 전부 또는 일부를 바꾸거나 중단할 수 있으며, 이 경우 서비스 화면에 미리 알립니다.</p>
<h2>제7조 (이용자의 의무)</h2><p>이용자는 서비스를 자동화된 방법으로 대량 수집하거나 정상적인 운영을 방해해서는 안 됩니다.</p>
<h2>제8조 (문의)</h2><p>서비스 관련 문의: ${CONTACT}</p>
<h2>제9조 (준거법)</h2><p>이 약관은 대한민국 법률에 따르며, 분쟁은 민사소송법상 관할 법원에서 해결합니다.</p>`);

export const PRIVACY = page("개인정보 처리방침", `
<p>${COMPANY}(이하 "회사")는 "${SERVICE}" 이용자의 개인정보를 개인정보 보호법에 따라 다음과 같이 처리합니다.</p>
<h2>1. 수집 항목과 목적</h2>
<table><tr><th>구분</th><th>항목</th><th>목적</th></tr>
<tr><td>필수</td><td>토스 회원 식별키, 찜한 강의 목록, 알림 발송 기록</td><td>찜 기능 제공, 찜한 강의 마감 알림 발송</td></tr>
<tr><td>필수</td><td>이름</td><td>토스 로그인 필수 제공 항목이며, 회사는 저장하지 않고 바로 폐기합니다</td></tr>
<tr><td>선택</td><td>성별, 생년월일</td><td>이용자 연령대·성별 통계를 통한 서비스 개선</td></tr>
<tr><td>선택</td><td>휴대전화번호</td><td>고객 문의 응대, 서비스 중요 변경 안내</td></tr></table>
<p>선택 항목은 동의하지 않아도 서비스를 이용할 수 있습니다. 개인정보는 토스 로그인을 통해 토스(㈜비바리퍼블리카)로부터 제공받으며, 선택 항목은 암호화된 상태로 보관합니다.</p>
<h2>2. 보유 기간</h2><p>토스 로그인 연결을 끊거나 토스를 탈퇴하면 지체 없이 삭제합니다. 찜한 강의가 마감되어 목록에서 사라지면 해당 찜 기록도 삭제됩니다.</p>
<h2>3. 처리 위탁</h2>
<table><tr><th>수탁자</th><th>업무</th></tr>
<tr><td>Supabase, Inc.</td><td>데이터베이스 보관(서울 리전)</td></tr>
<tr><td>Cloudflare, Inc.</td><td>서버 실행·네트워크</td></tr></table>
<h2>4. 제3자 제공</h2><p>회사는 이용자의 개인정보를 제3자에게 제공하지 않습니다.</p>
<h2>5. 이용자의 권리</h2><p>이용자는 언제든 개인정보 열람·정정·삭제·처리 정지를 요청할 수 있습니다. 토스 앱 설정에서 연결을 끊으면 즉시 삭제됩니다.</p>
<h2>6. 개인정보 보호책임자</h2><p>${COMPANY} / ${CONTACT}</p>`);
