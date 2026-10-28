// 주소 → 법정동 시도(2)·시군구(5) 코드. 데이터: regions.json (국토교통부_전국_법정동_20260729, data.go.kr 15063424)
// 일반구(수원시 팔달구 등)는 상위 시(41110)로 묶는다. 앱의 시군구 선택지와 같은 단위다.
import data from "./regions.json";

export interface Region { sido: string; sigungu: string | null }

const ALIASES: Record<string, string[]> = {
  "11": ["서울", "서울시"],
  "12": ["전남광주", "광주광역시", "광주", "전라남도", "전남"],
  "26": ["부산", "부산시"],
  "27": ["대구", "대구시"],
  "28": ["인천", "인천시"],
  "30": ["대전", "대전시"],
  "31": ["울산", "울산시"],
  "36": ["세종", "세종시"],
  "41": ["경기"],
  "43": ["충북"],
  "44": ["충남"],
  "47": ["경북"],
  "48": ["경남"],
  "50": ["제주", "제주도"],
  "51": ["강원", "강원도"],
  "52": ["전북", "전라북도"],
};

export const SIDO_LIST = data.sido;
export const SIGUNGU_LIST = data.sigungu;

const SIDO = new Map<string, string>();
for (const s of SIDO_LIST) {
  SIDO.set(s.name, s.code);
  for (const a of ALIASES[s.code] ?? []) SIDO.set(a, s.code);
}

/** "경기도 수원시 팔달구 …" → {41, 41110}. 시도를 못 찾으면 null, 시군구가 모호하면 sigungu null. */
export function toRegion(address: string | null | undefined): Region | null {
  const tokens = (address ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const sido = SIDO.get(tokens[0]!);
  if (!sido) {
    // 시도 없이 시군구부터 쓴 주소는 전국에서 이름이 하나뿐일 때만 인정한다
    const hits = SIGUNGU_LIST.filter((g) => g.name === tokens[0]);
    return hits.length === 1 ? { sido: hits[0]!.sido, sigungu: hits[0]!.code } : null;
  }
  const inSido = SIGUNGU_LIST.filter((g) => g.sido === sido);
  if (inSido.length === 1) return { sido, sigungu: inSido[0]!.code };
  const rest = tokens.slice(1).join("");
  const hit = inSido.filter((g) => rest.startsWith(g.name)).sort((a, b) => b.name.length - a.name.length)[0];
  return { sido, sigungu: hit?.code ?? null };
}
