// GET /meta 본문. 카테고리 이름 정본: docs/03-데이터수집/카테고리-체계와-키워드.md 1절
import type { MetaResponse } from "../../../shared/api-types";
import type { Main, Sub } from "../core/classify";
import { SIDO_LIST, SIGUNGU_LIST } from "../core/region";

const TREE: { code: Main; name: string; subs: [Sub, string][] }[] = [
  { code: "video", name: "AI 영상·이미지", subs: [["video_gen", "AI 영상 제작"], ["image_gen", "AI 이미지·디자인"], ["audio_gen", "AI 음악·음성"]] },
  { code: "coding", name: "AI 코딩·바이브코딩", subs: [["vibe", "바이브코딩·노코드 앱"], ["ai_dev", "AI 활용 프로그래밍"], ["data", "데이터 분석"]] },
  { code: "content", name: "콘텐츠·블로그 수익화", subs: [["blog", "블로그·글쓰기"], ["sns", "유튜브·SNS 운영"], ["ebook", "전자책·온라인 강의"]] },
  { code: "commerce", name: "AI 커머스·마케팅", subs: [["store", "온라인 쇼핑몰·스마트스토어"], ["marketing", "AI 마케팅·광고"]] },
  { code: "automation", name: "업무 자동화", subs: [["nocode_auto", "자동화 툴 (n8n·Make·Zapier)"], ["office_auto", "사무 자동화 (엑셀·RPA·스프레드시트)"], ["agent", "AI 에이전트·챗봇 만들기"]] },
  { code: "genai", name: "생성형 AI 기초·활용", subs: [["genai_basic", "생성형 AI 입문"], ["prompt", "프롬프트 엔지니어링"], ["genai_work", "직무별 AI 활용"], ["genai_cert", "AI 자격증"]] },
];

export const META: MetaResponse = {
  categories: TREE.map((m) => ({ code: m.code, name: m.name, subs: m.subs.map(([code, name]) => ({ code, name })) })),
  sido: SIDO_LIST,
  sigungu: SIGUNGU_LIST,
};
