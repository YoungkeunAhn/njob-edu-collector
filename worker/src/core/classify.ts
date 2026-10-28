// 카테고리 키워드 분류. 정본: docs/03-데이터수집/카테고리-체계와-키워드.md 1·2·3절 (LLM 단계는 plan D13 으로 제외)

export type Main = "video" | "coding" | "content" | "commerce" | "automation" | "genai";
export type Sub =
  | "video_gen" | "image_gen" | "audio_gen"
  | "vibe" | "ai_dev" | "data"
  | "blog" | "sns" | "ebook"
  | "store" | "marketing"
  | "nocode_auto" | "office_auto" | "agent"
  | "genai_basic" | "prompt" | "genai_work" | "genai_cert";

export const MAIN_OF: Record<Sub, Main> = {
  video_gen: "video", image_gen: "video", audio_gen: "video",
  vibe: "coding", ai_dev: "coding", data: "coding",
  blog: "content", sns: "content", ebook: "content",
  store: "commerce", marketing: "commerce",
  nocode_auto: "automation", office_auto: "automation", agent: "automation",
  genai_basic: "genai", prompt: "genai", genai_work: "genai", genai_cert: "genai",
};

const KEYWORDS: Record<Sub, string[]> = {
  video_gen: ["ai영상", "영상제작", "숏폼", "쇼츠", "릴스", "브루", "vrew", "캡컷", "capcut", "runway", "런웨이", "sora", "소라", "kling", "클링", "veo", "영상편집", "유튜브영상", "동영상제작", "아바타영상", "헤이젠", "heygen"],
  image_gen: ["ai이미지", "이미지생성", "미드저니", "midjourney", "달리", "dall-e", "스테이블디퓨전", "stablediffusion", "캔바", "canva", "썸네일", "상세페이지", "ai디자인", "일러스트", "이모티콘", "굿즈디자인", "나노바나나", "파이어플라이", "firefly"],
  audio_gen: ["ai음악", "수노", "suno", "ai작곡", "ai음성", "tts", "일레븐랩스", "elevenlabs", "오디오북", "내레이션"],
  vibe: ["바이브코딩", "vibecoding", "노코드앱", "앱만들기", "웹사이트만들기", "홈페이지만들기", "커서", "cursor", "클로드코드", "claudecode", "러버블", "lovable", "bolt", "볼트", "리플릿", "replit", "버블", "bubble", "글라이드"],
  ai_dev: ["파이썬", "python", "코딩", "프로그래밍", "개발자", "풀스택", "api활용", "머신러닝", "딥러닝", "랭체인", "langchain", "rag", "깃허브코파일럿"],
  data: ["데이터분석", "빅데이터", "데이터시각화", "태블로", "파워bi", "powerbi", "sql", "통계분석"],
  blog: ["블로그", "애드센스", "adsense", "티스토리", "네이버블로그", "워드프레스", "wordpress", "글쓰기", "카피라이팅", "원고", "체험단", "포스팅"],
  sns: ["유튜브", "유튜버", "인스타그램", "인스타", "틱톡", "sns마케팅", "sns운영", "채널운영", "크리에이터", "1인미디어", "퍼스널브랜딩"],
  ebook: ["전자책", "ebook", "크몽", "클래스101", "온라인강의제작", "강의판매", "지식창업", "출판"],
  store: ["스마트스토어", "쇼핑몰", "오픈마켓", "쿠팡", "위탁판매", "구매대행", "라이브커머스", "이커머스", "셀러"],
  marketing: ["디지털마케팅", "퍼포먼스마케팅", "광고", "마케팅자동화", "검색광고", "카피", "브랜딩", "홍보물"],
  nocode_auto: ["n8n", "make", "메이크", "zapier", "재피어", "업무자동화", "워크플로우", "노코드자동화", "자동화툴"],
  office_auto: ["엑셀", "excel", "스프레드시트", "구글시트", "앱스스크립트", "appsscript", "rpa", "파워오토메이트", "powerautomate", "매크로", "vba", "사무자동화", "한글문서", "ppt", "파워포인트"],
  agent: ["ai에이전트", "에이전트", "챗봇", "gpts", "나만의gpt", "커스텀gpt", "코파일럿스튜디오", "mcp", "자동응답"],
  genai_basic: ["생성형ai", "생성형인공지능", "챗gpt", "chatgpt", "ai입문", "ai기초", "ai첫걸음", "인공지능이해", "ai리터러시", "클로드", "제미나이", "뤼튼", "wrtn", "퍼플렉시티", "perplexity"],
  prompt: ["프롬프트", "prompt", "프롬프트엔지니어링", "질문법"],
  genai_work: ["업무활용", "직무", "소상공인ai", "사무직", "교사ai", "공무원ai", "보고서작성", "기획서", "노션ai", "notionai", "회의록"],
  genai_cert: ["자격증", "자격과정", "ai활용능력", "프롬프트엔지니어자격", "지도사", "강사양성"],
};

/** 동점이면 앞쪽이 이긴다 (정본 3절) */
const PRIORITY: Sub[] = ["vibe", "video_gen", "image_gen", "audio_gen", "nocode_auto", "agent", "blog", "sns", "ebook", "store", "marketing", "office_auto", "data", "ai_dev", "prompt", "genai_work", "genai_cert", "genai_basic"];

const GATE = ["인공지능", "생성형", "챗gpt", "chatgpt", "gpt", "claude", "클로드", "gemini", "제미나이", "제미니", "코파일럿", "copilot", "llm", "미드저니", "midjourney", "노코드", "자동화", "바이브코딩", "프롬프트", "에이전트"];
/** AI 단어가 없어도 N잡 관련성이 높아 게이트를 통과시키는 키워드 (G0 Q4: 기본 on) */
const GATE_EXCEPTION = ["블로그", "스마트스토어", "유튜브", "엑셀"];
const EXCLUDE = ["감독관", "채용공고", "설명회만", "어린이", "초등", "유아", "청소년", "ai스피커사용법", "키오스크"];

/** 소문자화 + 공백 제거 (정본 2절 매칭 규칙) */
export const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** 영문 `ai` 는 단어 경계 `\bai\b` 일 때만 인정 ("AI 영상", "AI를" O / "maintenance", "ai2", "_ai" X). JS 의 \b 는 ASCII 기준이라 한글 조사 앞도 경계다. */
const hasAiWord = (s: string) => /\bai\b/i.test(s);

export interface ClassifyOptions { gateException?: boolean }

export function classify(title: string, desc = "", opts: ClassifyOptions = {}): { main: Main; sub: Sub } | null {
  const head = desc.slice(0, 300);
  const t = norm(title);
  const d = norm(head);
  const all = t + d;
  if (EXCLUDE.some((k) => all.includes(k))) return null;
  const gate =
    hasAiWord(`${title} ${head}`) ||
    GATE.some((k) => all.includes(k)) ||
    ((opts.gateException ?? true) && GATE_EXCEPTION.some((k) => all.includes(k)));
  if (!gate) return null;

  // 점수 = 제목 매칭 2 + 설명 매칭 1, 동점이면 PRIORITY 순.
  // 단 genai_basic("출발점")은 다른 소분류가 **제목**에 걸리면 후보에서 뺀다. 정본 3절 예시
  // "생성형AI 기초와 업무활용 → genai_work" 는 점수만으로는 genai_basic(4) > genai_work(2) 라 이 규칙이 필요하다.
  const score = (sub: Sub) => KEYWORDS[sub].reduce((n, k) => n + (t.includes(k) ? 2 : 0) + (d.includes(k) ? 1 : 0), 0);
  const titleHit = PRIORITY.some((sub) => sub !== "genai_basic" && KEYWORDS[sub].some((k) => t.includes(k)));
  let best: Sub | null = null;
  let bestScore = 0;
  for (const sub of PRIORITY) {
    if (sub === "genai_basic" && titleHit) continue;
    const s = score(sub);
    if (s > bestScore) [best, bestScore] = [sub, s];
  }
  return best ? { main: MAIN_OF[best], sub: best } : null;
}
