// 개발·브라우저 테스트용 목업 강좌. 경기 수원시(41110)·AI 영상·원데이 조건에 맞는 것이 7건(온라인 2·시도 단위 1 포함)
import type { CourseItem } from "../../shared/api-types";

const base: Omit<CourseItem, "id" | "title"> = {
  source: "mock", attribution: "목업 데이터", course_type: "oneday", provider_name: "수원시 평생학습관",
  category_main: "video", category_sub: "video_gen", mode: "offline", sido_code: "41", sigungu_code: "41110",
  address: "경기도 수원시 팔달구 월드컵로 381번길 2", cost_type: "free", cost_amount: 0,
  apply_start: "2026-10-01", apply_end: "2026-10-30", course_start: "2026-11-02", course_end: "2026-11-02",
  target: "성인", url: "https://example.com/course", image_url: null, capacity: null,
};

const d = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;

export const COURSES: CourseItem[] = [
  { ...base, id: 1, title: "AI 영상 만들기 원데이 특강", apply_end: d(15), capacity: 20 },
  // 원천 이미지가 있는 강좌(서울 예약 실응답의 IMGURL). 나머지는 분야 일러스트
  { ...base, id: 2, image_url: "https://yeyak.seoul.go.kr/web/common/file/FileDown.do?file_id=1790561324178IFE3854D4MKZ04B5XJY21X8N4", title: "캡컷으로 숏폼 만들기", apply_end: d(16), cost_type: "paid", cost_amount: 30000 },
  { ...base, id: 3, title: "브루(Vrew)로 유튜브 영상 편집", apply_end: d(17) },
  { ...base, id: 4, title: "온라인 AI 영상 제작 입문", apply_end: d(18), mode: "online", sido_code: null, sigungu_code: null, address: null, provider_name: "K-MOOC" },
  { ...base, id: 5, title: "경기도 AI 영상 크리에이터 데이", apply_end: d(19), sigungu_code: null, address: "경기도" },
  { ...base, id: 6, title: "런웨이로 광고 영상 만들기", apply_end: d(20), cost_type: null, cost_amount: null },
  { ...base, id: 7, title: "온라인 숏츠 제작 원데이", apply_end: d(21), mode: "online", sido_code: null, sigungu_code: null, address: null },
  // 조건 밖
  { ...base, id: 8, title: "AI 영상 국비 과정", course_type: "training", cost_type: "card", cost_amount: 300000, course_end: "2027-01-20" },
  { ...base, id: 9, title: "블로그 글쓰기 with 챗GPT", category_main: "content", category_sub: "blog" },
  { ...base, id: 10, title: "서울 AI 영상 원데이", sido_code: "11", sigungu_code: "11110", address: "서울특별시 종로구" },
  { ...base, id: 11, title: "성남 AI 영상 원데이", sigungu_code: "41130", address: "경기도 성남시" },
];

// "더 보기"·스크롤 복원 시험용(목록 3페이지): 서울 생성형 AI 강좌 40건 → 조건 없이 찾으면 51건, 3페이지
for (let i = 0; i < 40; i++)
  COURSES.push({
    ...base, id: 100 + i, title: `생성형 AI 실무 ${i + 1}기`, category_main: "genai", category_sub: null, sido_code: "11", sigungu_code: null,
    address: "서울특별시", apply_end: d(15 + (i % 15)), cost_type: i % 3 ? "paid" : "free", cost_amount: i % 3 ? 10000 * (40 - i) : 0,
  });

// 고용24 강좌(상세 보강): /courses/200/extra 가 vite 목업의 고용24 픽스처(신청 8명·모집 20명·교과편성 4줄)를 받는다
COURSES.push({
  ...base, id: 200, source: "work24", attribution: "고용24", title: "숏폼 콘텐츠 제작 실습 (CapCut & ChatGPT)", course_type: "training",
  cost_type: "card", cost_amount: 120000, apply_end: d(20), capacity: null,
  url: "https://www.work24.go.kr/hr/a/a/3100/selectTracseDetl.do?tracseId=AIG20250000526545&tracseTme=6&crseTracseSe=C0061&trainstCstmrId=1",
});
