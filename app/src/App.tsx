// 화면 5개: 인트로(로그인 전) → 홈(필터) → 목록 → 상세(원문 보기), 찜 목록. 정본: docs/06-스펙/spec.md US1·US2, docs/05-아키텍처/찜-토스로그인-마감알림.md
// UI 는 TDS(@toss/tds-mobile). 위계 규칙: docs/05-아키텍처/디자인-규칙.md 2장
import { adaptive } from "@toss/tds-colors";
import {
  Badge, Border, Button, Chip, ChipItem, FixedBottomCTA, List, ListHeader, ListRow, Result, SearchField, SegmentedControl, Skeleton, TableRow, Text, Top, useToast,
} from "@toss/tds-mobile";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { CourseExtra, CourseItem, MetaResponse } from "../../shared/api-types";
import { ApiError, AuthError, deleteBookmark, getBookmarks, getCourse, getCourseExtra, getCourses, getMeta, imageSrc, login, putBookmark } from "./api";
import { courseParams, initAcquisition, listParams, track } from "./analytics";
import { buildCourseSharePath, buildListSharePath, fallbackListPath, safeFilters, sharePath } from "./share";
import {
  addRegion, buildQuery, clearList, daysLeft, formatCost, formatPeriod, formatSeats, groupCurriculum, MAX_REGIONS, peekList, priceBadge, Q_RAW_MAX, readQuery, regionList, removeRegion, saveList, shortPeriod, SORTS, TYPE_LABEL, type Filters,
} from "./logic";
import { askPushOnce, inToss, lastList, openOriginal, session, tossLogin } from "./toss";

// 작은 라우터: pathname + search. 뒤로 가기는 브라우저(토스 내비게이션 바) 기본 동작.
// 스크롤 위치는 브라우저 자동 복원에 맡기지 않는다 — 목록이 다시 그려지기 전에 복원돼 맨 위로 잘린다(plan D17).
// 떠날 때 위치를 history 항목에 적어 두고, 뒤로·앞으로 와서 화면을 그린 직후(App 의 layout effect) 그 위치로 간다
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
// React StrictMode의 효과 재실행·내부 이동과 무관하게 웹뷰 최초 주소에 귀속한다.
initAcquisition(location.search, location.pathname);

function useLocation() {
  const [loc, setLoc] = useState(() => ({ path: location.pathname, search: location.search, pop: false }));
  useEffect(() => {
    const on = () => setLoc({ path: location.pathname, search: location.search, pop: true });
    addEventListener("popstate", on);
    return () => removeEventListener("popstate", on);
  }, []);
  const go = (to: string) => {
    const u = new URL(to, location.href);
    if (u.pathname + u.search === location.pathname + location.search) return; // 같은 칩 다시 누름·같은 검색어 다시 제출: 그대로 둔다
    if (to.startsWith("/list")) clearList(to.split("?")[1] ?? ""); // 앞으로 가서 새로 찾는 목록은 처음부터(쿼리는 buildQuery 가 만든 그대로)
    history.replaceState({ ...history.state, y: scrollY }, "");
    history.pushState(null, "", to);
    scrollTo(0, 0);
    setLoc({ path: location.pathname, search: location.search, pop: false });
  };
  /** 기록을 쌓지 않고 바꾼다(들어오자마자 저장한 목록으로 갈 때) */
  const replace = (to: string) => {
    history.replaceState(null, "", to);
    setLoc({ path: location.pathname, search: location.search, pop: false });
  };
  return { ...loc, go, replace };
}

/** 찜 상태. 토스 안에서만 쓴다. 로그인은 찜 버튼·찜 목록에서 사용자가 누를 때만(진입 시 자동 로그인 금지, 앱인토스 정책) */
function useBookmarks() {
  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<CourseItem[]>([]);
  const revision = useRef(0);
  useEffect(() => {
    if (!inToss()) return;
    let active = true;
    const startedAt = revision.current;
    void session.get().then(async (t) => {
      if (!t) return;
      try {
        const current = await getBookmarks(t);
        if (!active || startedAt !== revision.current) return;
        setItems(current);
        setToken(t);
      } catch (e) {
        if (active && startedAt === revision.current && e instanceof AuthError) void session.clear(); // 연결을 끊었거나 만료 → 다음에 다시 로그인(약관 재노출)
      }
    });
    return () => { active = false; };
  }, []);
  const ensureLogin = async () => {
    revision.current++;
    if (token) return { token, items };
    const { authorizationCode, referrer } = await tossLogin();
    const t = await login(authorizationCode, referrer);
    await session.set(t);
    const current = await getBookmarks(t);
    setToken(t);
    setItems(current);
    return { token: t, items: current };
  };
  const toggle = async (c: CourseItem) => {
    const { token: t, items: current } = await ensureLogin();
    const has = current.some((x) => x.id === c.id);
    try {
      if (has) await deleteBookmark(t, c.id);
      else await putBookmark(t, c.id);
    } catch (e) {
      if (e instanceof AuthError) { await session.clear(); setToken(null); }
      throw e;
    }
    setItems((old) => (has ? old.filter((x) => x.id !== c.id) : [c, ...old.filter((x) => x.id !== c.id)]));
    if (!has) {
      track("njob_bookmark_added", courseParams(c));
      await askPushOnce().catch(() => {}); // 알림 동의 실패가 저장 성공을 바꾸지 않는다.
    }
    return !has;
  };
  return { enabled: inToss(), loggedIn: !!token, items, has: (id: number) => items.some((x) => x.id === id), toggle, ensureLogin };
}
type Bookmarks = ReturnType<typeof useBookmarks>;

export function App() {
  const { path, search, pop, go, replace } = useLocation();
  // 뒤로·앞으로 온 화면: 그린 직후 떠날 때의 위치로(목록은 상세에서 돌아오면 저장한 카드로 바로 그려지므로 위치가 잘리지 않는다)
  useLayoutEffect(() => {
    if (pop) scrollTo(0, (history.state as { y?: number } | null)?.y ?? 0);
  }, [path, search, pop]);
  const bm = useBookmarks();
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    getMeta().then((value) => { if (active) setMeta(value); }, () => { if (active) setError(true); });
    return () => { active = false; };
  }, []);

  // 인트로: 로그인 안 한 사용자는 들어올 때마다 서비스 소개부터 본다(앱인토스 검수 2026-10-16 반려: 토스 로그인 전 인트로 필요)
  // 홈으로 들어왔는데 전에 찾은 목록이 있으면 조건 고르기를 건너뛰고 그 목록으로(바꾸려면 목록의 "조건 변경")
  const [intro, setIntro] = useState<boolean | null>(null);
  useEffect(() => {
    if (!meta) return; // 과거 저장 조건도 현재 메타 허용값으로 검증한 뒤 복원한다.
    const home = location.pathname === "/" && !location.search;
    let active = true;
    void Promise.all([inToss() ? session.get() : null, home ? lastList.get() : null]).then(([t, last]) => {
      if (!active) return;
      if (last && location.pathname === "/" && !location.search) {
        const query = buildQuery({ ...safeFilters(readQuery(new URL(last, location.href).search), meta), q: "" });
        replace(`/list${query ? `?${query}` : ""}`);
      }
      setIntro(!t);
    });
    return () => { active = false; };
  }, [meta]);

  if (error) return <ErrorResult />;
  if (intro) return <Intro onStart={() => { track("njob_intro_continue"); setIntro(false); }} />;
  if (!meta || intro === null) return <Loading />;
  const detail = /^\/course\/([^/]+)$/.exec(path);
  if (detail) {
    let id = "";
    try { id = decodeURIComponent(detail[1]!); } catch { /* 잘못 인코딩된 링크도 안내 화면으로 */ }
    return <Detail key={path + search} id={id} search={search} meta={meta} bm={bm} go={go} />;
  }
  if (path === "/course" || path.startsWith("/course/")) return <InvalidCourse go={go} />;
  if (path === "/list") return <List_ key={search} filters={readQuery(search)} meta={meta} go={go} />; // 조건마다 새로 마운트(상태가 다른 조건으로 새지 않게)
  if (path === "/bookmarks") return <BookmarkList meta={meta} go={go} bm={bm} />; // 마감 알림 푸시가 여는 화면(intoss://njob-matching/bookmarks)
  return <Home key={search} meta={meta} initial={readQuery(search)} go={go} bm={bm} />;
}

const today = () => new Date().toLocaleDateString("sv-SE"); // 기기 날짜 YYYY-MM-DD

function Loading() {
  return <Skeleton pattern="topList" />;
}

function ErrorResult({ title = "잠시 후 다시 시도해 주세요" }: { title?: string }) {
  return (
    <Result
      title={title}
      description="네트워크 상태를 확인해 주세요"
      button={<Result.Button onClick={() => location.reload()}>다시 시도</Result.Button>}
    />
  );
}

const INTRO: [string, string][] = [
  ["지역과 분야만 고르면 돼요", "무료 공공 강좌, 내일배움카드 과정, 민간 강좌까지 지금 모집 중인 부업 강의를 모아 보여드려요"],
  ["가격과 마감일을 한눈에", "무료·자부담·마감 D-day를 목록에서 바로 비교할 수 있어요"],
  ["신청은 원문에서", "강의를 고르면 운영 기관의 원문 페이지로 연결해 드려요"],
  ["찜하면 마감 전에 알려드려요", "토스로 로그인하고 찜하면 접수 마감 하루 전에 알림을 보내드려요"],
];

/** 첫 화면. 서비스 소개 후 시작(로그인은 찜할 때만) */
function Intro({ onStart }: { onStart: () => void }) {
  return (
    <main>
      <Top
        title={<Top.TitleParagraph>N잡 배움터</Top.TitleParagraph>}
        subtitleBottom={<Top.SubtitleParagraph>내 지역에서 들을 수 있는 부업·AI 활용 강의를 찾아 드려요</Top.SubtitleParagraph>}
      />
      <List>
        {INTRO.map(([title, desc]) => (
          <ListRow key={title} verticalPadding="large" contents={
            <div className="course">
              <Text typography="t5" fontWeight="bold" color={adaptive.grey900}>{title}</Text>
              <Text typography="t6" color={adaptive.grey600}>{desc}</Text>
            </div>
          } />
        ))}
      </List>
      <FixedBottomCTA onClick={onStart}>시작하기</FixedBottomCTA>
    </main>
  );
}

function regionLabel(c: CourseItem, meta: MetaResponse): string {
  if (c.mode === "online") return "온라인";
  const sigungu = meta.sigungu.find((g) => g.code === c.sigungu_code)?.name;
  const sido = meta.sido.find((s) => s.code === c.sido_code)?.name;
  return [sido, sigungu].filter(Boolean).join(" ") || "지역 원문 확인";
}

/** 지역 코드(시도 2자리·시군구 5자리) → "경기도 수원시" */
function regionName(code: string, meta: MetaResponse): string {
  const g = meta.sigungu.find((x) => x.code === code);
  const sido = meta.sido.find((s) => s.code === (g ? g.sido : code))?.name ?? code;
  return g ? `${sido} ${g.name}` : sido;
}

/** 목록 상단 조건 요약: "경기도 수원시 외 1곳 · AI 영상". 유형은 바로 아래 칩이 보여준다 */
function filterSummary(f: Filters, meta: MetaResponse): string {
  const [first, ...rest] = regionList(f);
  const regions = first ? regionName(first, meta) + (rest.length ? ` 외 ${rest.length}곳` : "") : "";
  const cat = meta.categories.find((c) => c.code === f.cat);
  const sub = cat?.subs.find((s) => s.code === f.sub)?.name;
  const cost = COSTS.find((option) => option.code === f.cost)?.label ?? "모든 가격";
  return `${f.mode === "online" ? "온라인" : regions || "전국"} · ${sub ?? cat?.name ?? "모든 분야"} · ${cost}`;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="section">
      <ListHeader
        title={<ListHeader.TitleParagraph typography="t5" color={adaptive.grey800} fontWeight="bold">{title}</ListHeader.TitleParagraph>}
        right={hint && <ListHeader.RightText typography="t7" color={adaptive.grey500}>{hint}</ListHeader.RightText>}
        rightAlignment="center"
      />
      {children}
    </section>
  );
}

/** 단일 선택 칩 묶음. 첫 항목은 "전체"(값 "") */
function ChoiceChips({ options, value, onChange }: { options: { code: string; name: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <Chip wrap margin="large">
      {options.map((o) => (
        <ChipItem key={o.code} selected={o.code === value} onClick={() => onChange(o.code)}>{o.name}</ChipItem>
      ))}
    </Chip>
  );
}

/** 짧은 고정 선택지는 화면 폭을 균등하게 나눈다. TDS 자체 좌우 여백 24px을 사용한다. */
function ChoiceSegments({ label, options, value, onChange, className = "section" }: { label: string; options: { code: string; name: string; ariaLabel?: string }[]; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <SegmentedControl className={className} aria-label={label} size="small" alignment="fixed" value={value} onChange={onChange}>
      {options.map((o) => <SegmentedControl.Item key={o.code} value={o.code} size="small" aria-label={o.ariaLabel}>{o.name}</SegmentedControl.Item>)}
    </SegmentedControl>
  );
}

const TYPES = [{ code: "", name: "전체" }, { code: "oneday", name: "원데이", ariaLabel: "원데이 클래스" }, { code: "training", name: "교육훈련" }];
const COSTS = [{ code: "paid", name: "유료", label: "유료" }, { code: "free", name: "무료", label: "무료" }, { code: "card", name: "내일배움", label: "내일배움카드" }];
const COMPACT_SORTS = SORTS.map((option) => ({ ...option, name: option.name.replace(/순$/, ""), ariaLabel: option.name }));

/** 가격은 하나만 선택하며, 선택한 버튼을 다시 누르면 전체 가격으로 돌아간다. */
function CostChoices({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="cost-choices section" role="group" aria-label="가격" style={{ background: adaptive.grey100 }}>
      {COSTS.map((option) => (
        <Button key={option.code} type="button" className="cost-choice" size="small" variant="weak"
          color={value === option.code ? "primary" : "dark"} aria-label={option.label} aria-pressed={value === option.code}
          onClick={() => onChange(value === option.code ? "" : option.code)}>{option.name}</Button>
      ))}
    </div>
  );
}

/** 지역 코드가 속한 시도 코드 */
const sidoOf = (code: string, meta: MetaResponse) => meta.sigungu.find((g) => g.code === code)?.sido ?? code;

/**
 * 지역 고르기(최대 MAX_REGIONS곳). 위쪽 칩은 자리가 바뀌지 않고, 고른 지역은 아래에 쌓인다.
 * 시도 칩 → 시군구 칩(다시 누르면 빠짐). 시군구가 없는 시도는 시도 칩이 바로 토글된다.
 */
function RegionPicker({ meta, f, setF, pick, setPick }: {
  meta: MetaResponse; f: Filters; setF: (f: Filters) => void; pick: string; setPick: (sido: string) => void;
}) {
  const regions = regionList(f);
  const full = regions.length >= MAX_REGIONS;
  const toggle = (code: string) => setF(regions.includes(code) ? removeRegion(f, code) : addRegion(f, code));
  const hasSigungu = (sido: string) => meta.sigungu.some((g) => g.sido === sido);
  const sidoName = meta.sido.find((s) => s.code === pick)?.name;
  const sigungu = [{ code: pick, name: `${sidoName} 전체` }, ...meta.sigungu.filter((g) => g.sido === pick)];
  return (
    <>
      <Chip wrap margin="large">
        <ChipItem selected={!regions.length && !pick && !f.mode} onClick={() => { setF({ ...f, region: "", mode: "" }); setPick(""); }}>전국</ChipItem>
        {/* 온라인은 지역과 상관없이 나오므로 지역 대신 고르는 칩 */}
        <ChipItem selected={f.mode === "online"} onClick={() => { setF({ ...f, region: "", mode: f.mode ? "" : "online" }); setPick(""); }}>온라인</ChipItem>
        {meta.sido.map((s) => {
          const on = hasSigungu(s.code) ? pick === s.code : regions.includes(s.code);
          return (
            <ChipItem key={s.code} selected={on} disabled={full && !on && !hasSigungu(s.code)}
              onClick={() => (hasSigungu(s.code) ? (setPick(pick === s.code ? "" : s.code), setF({ ...f, mode: "" })) : toggle(s.code))}>
              {s.name}
            </ChipItem>
          );
        })}
      </Chip>
      {pick && hasSigungu(pick) && (
        <>
          <div className="pad sub-label"><Text typography="t7" color={adaptive.grey600}>{sidoName} 시군구</Text></div>
          <Chip wrap margin="large">
            {sigungu.map((g) => {
              const on = regions.includes(g.code);
              return <ChipItem key={g.code} selected={on} disabled={full && !on} onClick={() => toggle(g.code)}>{g.name}</ChipItem>;
            })}
          </Chip>
        </>
      )}
      {regions.length > 0 && (
        <>
          <div className="pad sub-label"><Text typography="t7" color={adaptive.grey600}>고른 지역 {regions.length}/{MAX_REGIONS}</Text></div>
          <Chip wrap margin="large">
            {regions.map((c) => (
              <ChipItem key={c} selected aria-label={`${regionName(c, meta)} 빼기`} onClick={() => setF(removeRegion(f, c))}>
                {regionName(c, meta)}<span className="chip-x" aria-hidden>✕</span>
              </ChipItem>
            ))}
          </Chip>
        </>
      )}
    </>
  );
}

function Home({ meta, initial, go, bm }: { meta: MetaResponse; initial: Filters; go: (to: string) => void; bm: Bookmarks }) {
  const [f, setF] = useState<Filters>(initial);
  const [pick, setPick] = useState(""); // 시군구를 고르는 중인 시도
  const set = (patch: Filters) => setF((old) => ({ ...old, ...patch }));
  const subs = meta.categories.find((c) => c.code === f.cat)?.subs ?? [];
  // 시도만 펼치고 시군구를 안 고른 채 찾기를 누르면 그 시도 전체를 넣는다
  const withPick = () => (pick && !regionList(f).some((c) => sidoOf(c, meta) === pick) ? addRegion(f, pick) : f);
  return (
    <main>
      <Top
        title={<Top.TitleParagraph>나에게 맞는 부업 강의</Top.TitleParagraph>}
        subtitleBottom={<Top.SubtitleParagraph>지역과 분야를 고르면 지금 모집 중인 강의를 모아 드려요</Top.SubtitleParagraph>}
        right={bm.enabled && (
          <Top.RightButton color="dark" variant="weak" size="small" onClick={() => go("/bookmarks")}>
            찜한 강의{bm.items.length ? ` ${bm.items.length}` : ""}
          </Top.RightButton>
        )}
      />
      <Section title="지역" hint={`최대 ${MAX_REGIONS}곳`}>
        <RegionPicker meta={meta} f={f} setF={setF} pick={pick} setPick={setPick} />
      </Section>
      <Section title="분야">
        <ChoiceChips options={[{ code: "", name: "전체" }, ...meta.categories]} value={f.cat ?? ""} onChange={(v) => set({ cat: v, sub: "" })} />
      </Section>
      {subs.length > 0 && (
        <Section title="세부 분야">
          <ChoiceChips options={[{ code: "", name: "전체" }, ...subs]} value={f.sub ?? ""} onChange={(v) => set({ sub: v })} />
        </Section>
      )}
      <Section title="유형">
        <ChoiceSegments label="유형" options={TYPES} value={f.type ?? ""} onChange={(v) => set({ type: v })} />
      </Section>
      <Section title="가격">
        <CostChoices value={f.cost ?? ""} onChange={(v) => set({ cost: v })} />
      </Section>
      <FixedBottomCTA onClick={() => go(`/list?${buildQuery(withPick())}`)}>강의 찾기</FixedBottomCTA>
    </main>
  );
}

/** 분야 일러스트(public/illust, codex 이미지 생성 2026-10-13). 생성형 AI 로 만든 이미지라 화면에 "AI 생성"을 표기한다(spec FR-014) */
const illust = (main: string) => `${import.meta.env.BASE_URL}illust/${main}.jpg`;

/** 강좌 이미지: 원천 이미지가 있으면 그것, 없거나 못 불러오면 분야 일러스트 + AI 생성 표기 */
function CourseImage({ c, className, w }: { c: CourseItem; className: string; w: 160 | 720 }) {
  const [failed, setFailed] = useState(false);
  const own = c.image_url && !failed;
  return (
    <div className={`img ${className}`}>
      <img src={own ? imageSrc(c.image_url!, w) : illust(c.category_main)} alt="" loading="lazy" onError={() => own && setFailed(true)} />
      {!own && <span className="ai-mark">AI 생성 이미지</span>}
    </div>
  );
}

/** 마감 배지: 3일 이내는 빨강, 그 외는 회색. 마감일을 모르면 없음 */
function DeadlineBadge({ end }: { end: string | null }) {
  const d = daysLeft(end, today());
  if (d === null || d < 0) return null;
  return <Badge size="xsmall" variant="weak" color={d <= 3 ? "red" : "elephant"}>{d === 0 ? "오늘 마감" : `마감 D-${d}`}</Badge>;
}

/** 가격 배지: 무료는 파랑 글자, 유료·일부 지원은 원화 아이콘(빨강), 내일배움카드는 카드 아이콘(노랑) */
function PriceBadge({ c }: { c: CourseItem }) {
  const b = priceBadge(c);
  if (!b) return null;
  const color = b.icon === "won" ? "red" : b.icon === "card" ? "yellow" : "blue";
  return (
    <Badge size="xsmall" variant="weak" color={color}>
      {b.icon && <span className={`badge-icon ${b.icon}`} aria-hidden />}
      {b.label}
    </Badge>
  );
}

/** 온라인 강좌 배지(모니터 아이콘, 청록) */
function OnlineBadge({ c }: { c: CourseItem }) {
  if (c.mode !== "online") return null;
  return (
    <Badge size="xsmall" variant="weak" color="teal">
      <span className="badge-icon online" aria-hidden />온라인
    </Badge>
  );
}

/** 배지 줄: 마감 → 가격 → 온라인 */
function CourseBadges({ c }: { c: CourseItem }) {
  return <div className="badges"><DeadlineBadge end={c.apply_end} /><PriceBadge c={c} /><OnlineBadge c={c} /></div>;
}

// 카드 위계: 마감·가격·온라인 배지 → 제목 → 지역·가격(판단 정보, 진하게) → 교육일·유형·기관(보조)
// showType: 유형 칩이 "전체"일 때만 카드에 유형을 적는다
function CourseRow({ c, meta, showType, onClick }: { c: CourseItem; meta: MetaResponse; showType: boolean; onClick: () => void }) {
  const free = c.cost_type === "free";
  return (
    <ListRow
      onClick={onClick}
      verticalPadding="large"
      left={<CourseImage c={c} className="thumb" w={160} />}
      leftAlignment="top"
      contents={
        <div className="course">
          <CourseBadges c={c} />
          <Text typography="t5" fontWeight="bold" color={adaptive.grey900} ellipsisAfterLines={2}>{c.title}</Text>
          <Text typography="t6" fontWeight="medium" color={adaptive.grey800}>
            {regionLabel(c, meta)}
            <span className="dot"> · </span>
            {/* 내일배움카드는 배지가 이미 말하므로 목록에서는 "자부담 30만원"만 */}
            <span style={{ color: free ? adaptive.blue500 : undefined, fontWeight: 700 }}>{formatCost(c).replace(/^내일배움카드 /, "")}</span>
          </Text>
          <Text typography="t7" color={adaptive.grey600} ellipsisAfterLines={1}>
            {/* 좁은 화면에서 잘리면 뒤(기관)부터 잘리도록 교육일을 앞에 둔다 */}
            {[shortPeriod(c.course_start, c.course_end) && `교육 ${shortPeriod(c.course_start, c.course_end)}`, showType ? TYPE_LABEL[c.course_type] : null, c.provider_name].filter(Boolean).join(" · ")}
          </Text>
        </div>
      }
    />
  );
}

function List_({ filters, meta, go }: { filters: Filters; meta: MetaResponse; go: (to: string) => void }) {
  const query = buildQuery(filters);
  // 상세에서 뒤로 왔으면 저장해 둔 카드·다음 커서를 그대로 쓰고 다시 받지 않는다
  const [snap] = useState(() => peekList<CourseItem>(query)); // key={search} 라 마운트마다 조건 하나
  const [items, setItems] = useState<CourseItem[] | null>(snap?.items ?? null);
  const [next, setNext] = useState<string | null>(snap?.next ?? null);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState(filters.q ?? "");
  const viewed = useRef(false);
  const remembered = useRef(false);
  // 성공한 목록만 저장한다. 잘못된 외부 링크의 API 400을 다음 진입에 복원하지 않는다.
  useEffect(() => {
    if (!items || error || remembered.current) return;
    remembered.current = true;
    lastList.set(`/list?${buildQuery({ ...safeFilters(filters, meta), q: "" })}`);
  }, [items, error, filters, meta]);
  useEffect(() => {
    if (snap) return;
    let active = true;
    getCourses(query).then((r) => {
      if (active) { setItems(r.items); setNext(r.next); }
    }, () => { if (active) setError(true); });
    return () => { active = false; };
  }, [query, snap]);
  useEffect(() => {
    if (snap || !items || error || viewed.current) return; // 뒤로 가기 복원은 새 첫 페이지 성공이 아니다.
    viewed.current = true;
    const params = listParams(safeFilters(filters, meta), Math.min(items.length, 20));
    track("njob_list_view", params);
    if (!items.length) track("njob_empty_result", params);
  }, [snap, items, error, filters, meta]);
  useEffect(() => {
    if (items) saveList({ query, items, next });
  }, [query, items, next]);
  // 요청 중에는 버튼을 막는다(같은 cursor 를 두 번 받으면 카드가 중복된다)
  const more = () => {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    getCourses(query, next)
      .then((r) => { setItems((old) => [...(old ?? []), ...r.items]); setNext(r.next); }, () => setError(true))
      .finally(() => setLoadingMore(false));
  };
  const editFilters = () => go(`/?${query}`);
  // 검색·정렬은 목록을 새로 연다(history 에 쌓여 뒤로 가면 이전 목록)
  const search = (text: string) => go(`/list?${buildQuery({ ...filters, q: text })}`);

  if (error) return <ErrorResult />;
  return (
    <main>
      <Top
        subtitleTop={<Top.SubtitleParagraph>{filterSummary(filters, meta)}</Top.SubtitleParagraph>}
        title={<Top.TitleParagraph>지금 신청할 수 있어요</Top.TitleParagraph>}
        right={<Top.RightButton color="dark" variant="weak" size="small" onClick={editFilters}>조건 변경</Top.RightButton>}
      />
      <form role="search" onSubmit={(e) => { e.preventDefault(); (document.activeElement as HTMLElement | null)?.blur(); search(q); }}>
        <SearchField placeholder="강의 제목으로 찾기" enterKeyHint="search" maxLength={Q_RAW_MAX} value={q} onChange={(e) => setQ(e.target.value)}
          onDeleteClick={() => { setQ(""); if (filters.q) search(""); }} aria-label="강의 제목 검색" />
      </form>
      <ChoiceSegments label="유형" options={TYPES} value={filters.type ?? ""} onChange={(v) => go(`/list?${buildQuery({ ...filters, type: v })}`)} />
      <ChoiceSegments label="정렬" options={COMPACT_SORTS} value={filters.sort ?? ""} onChange={(v) => go(`/list?${buildQuery({ ...filters, sort: v })}`)} />
      <CostChoices value={filters.cost ?? ""} onChange={(v) => go(`/list?${buildQuery({ ...filters, cost: v })}`)} />
      <ShareButton label="이 조건 공유" path={() => buildListSharePath(filters, meta)} message={`N잡 배움터 · ${filterSummary(safeFilters(filters, meta), meta)}`} params={{ target_type: "list", ...listParams(safeFilters(filters, meta)) }} />
      {!items ? (
        <Skeleton pattern="listOnly" />
      ) : items.length === 0 ? (
        <>
          <Result
            title={filters.q ? `'${filters.q}' 강좌가 없어요` : "조건에 맞는 강좌가 없어요"}
            description={filters.q ? "다른 검색어로 찾거나 지역·분야를 넓혀 보세요" : "지역을 넓히거나 다른 분야를 골라 보세요"}
            button={<Result.Button onClick={editFilters}>조건 바꾸기</Result.Button>}
          />
          <div className="pad more"><Button display="block" color="dark" variant="weak" onClick={() => go("/list")}>전체 강좌 보기</Button></div>
        </>
      ) : (
        <>
          <List>
            {items.map((c, i) => (
              <Fragment key={c.id}>
                {i > 0 && <Border variant="padding24" />}
                <CourseRow c={c} meta={meta} showType={!filters.type} onClick={() => go(`/course/${c.id}`)} />
              </Fragment>
            ))}
          </List>
          {next && (
            <div className="pad more">
              <Button display="block" color="dark" variant="weak" loading={loadingMore} onClick={more}>더 보기</Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

/** 찜 버튼 결과를 토스트로. 로그인 창을 닫으면(취소) 조용히 */
function useToggle(bm: Bookmarks) {
  const { openToast } = useToast();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  return {
    busy,
    toggle: async (c: CourseItem) => {
      if (pending.current) return;
      pending.current = true;
      setBusy(true);
      try {
        openToast((await bm.toggle(c)) ? "찜했어요. 마감 하루 전에 알려드릴게요" : "찜을 해제했어요");
      } catch (e) {
        if (e instanceof AuthError) openToast("다시 로그인해 주세요");
        else if (e instanceof Error && e.message === "API 409") openToast("찜은 50개까지 할 수 있어요");
        else if (e instanceof Error && e.message.startsWith("API")) openToast("잠시 후 다시 시도해 주세요");
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
  };
}

/** 공유 시트가 열렸다는 사실을 전송 완료로 표시하지 않는다. */
function ShareButton({ label, path, message, params }: {
  label: string; path: () => string; message: string; params: ReturnType<typeof courseParams> | ReturnType<typeof listParams>;
}) {
  const { openToast } = useToast();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  if (!inToss()) return null;
  const share = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    track("njob_share_intent", params);
    try {
      await sharePath(path(), message);
    } catch {
      openToast("공유를 열지 못했어요. 잠시 후 다시 시도해 주세요");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return <div className="pad share-action"><Button color="dark" variant="weak" size="small" loading={busy} onClick={() => void share()}>{label}</Button></div>;
}

function InvalidCourse({ go }: { go: (to: string) => void }) {
  return <Result title="올바르지 않은 강좌 링크예요" description="전체 목록에서 강좌를 다시 찾아보세요" button={<Result.Button onClick={() => go("/list")}>전체 강좌 보기</Result.Button>} />;
}

function BookmarkList({ meta, go, bm }: { meta: MetaResponse; go: (to: string) => void; bm: Bookmarks }) {
  const { openToast } = useToast();
  const [logging, setLogging] = useState(false);
  if (!bm.enabled) return <Result title="토스 앱에서 볼 수 있어요" description="찜과 마감 알림은 토스 앱 안에서만 쓸 수 있어요" />;
  if (!bm.loggedIn)
    return (
      <Result
        title="찜한 강의를 보려면 로그인해 주세요"
        description="찜한 강의는 마감 하루 전에 알려드려요"
        button={<Result.Button loading={logging} onClick={() => {
          setLogging(true);
          bm.ensureLogin().catch((e) => e instanceof Error && e.message.startsWith("API") && openToast("잠시 후 다시 시도해 주세요")).finally(() => setLogging(false));
        }}>토스로 로그인</Result.Button>}
      />
    );
  return (
    <main>
      <Top title={<Top.TitleParagraph>찜한 강의</Top.TitleParagraph>}
        subtitleBottom={<Top.SubtitleParagraph>마감 하루 전 오전 10시에 알려드려요</Top.SubtitleParagraph>} />
      {bm.items.length === 0 ? (
        <Result title="찜한 강의가 없어요" description="강의 상세에서 찜할 수 있어요" button={<Result.Button onClick={() => go("/")}>강의 찾기</Result.Button>} />
      ) : (
        <List>
          {bm.items.map((c, i) => (
            <Fragment key={c.id}>
              {i > 0 && <Border variant="padding24" />}
              <CourseRow c={c} meta={meta} showType onClick={() => go(`/course/${c.id}`)} />
            </Fragment>
          ))}
        </List>
      )}
    </main>
  );
}

function Detail({ id, search, meta, bm, go }: { id: string; search: string; meta: MetaResponse; bm: Bookmarks; go: (to: string) => void }) {
  const [c, setC] = useState<CourseItem | null>(null);
  const [extra, setExtra] = useState<CourseExtra | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const viewed = useRef(false);
  const unavailable = useRef(false);
  const validId = /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
  const fallback = fallbackListPath(search, meta);
  const t = useToggle(bm);
  useEffect(() => {
    if (!validId) return;
    let active = true;
    getCourse(id).then((course) => { if (active) setC(course); }, (e: unknown) => { if (active) setError(e); });
    return () => { active = false; };
  }, [id, validId, attempt]);
  useEffect(() => {
    if (!c || viewed.current) return;
    viewed.current = true;
    track("njob_course_view", courseParams(c));
  }, [c]);
  useEffect(() => {
    if (!(error instanceof ApiError) || error.status !== 404 || unavailable.current) return;
    unavailable.current = true;
    track("njob_course_unavailable", { course_id: Number(id), has_fallback: fallback !== "/list" });
  }, [error, id, fallback]);
  // 고용24만 원천에서 신청 인원·커리큘럼을 더 받는다. 기본 정보와 따로 받아 늦거나 실패해도 화면을 막지 않는다
  useEffect(() => {
    let active = true;
    if (c?.source === "work24") getCourseExtra(c.id).then((value) => { if (active) setExtra(value); }, () => {});
    return () => { active = false; };
  }, [c]);
  if (!validId || (error instanceof ApiError && error.status === 400)) return <InvalidCourse go={go} />;
  if (error instanceof ApiError && error.status === 404) {
    return <Result title="이 강좌 정보를 더 이상 볼 수 없어요" description="다른 모집 중인 강좌를 찾아보세요" button={<Result.Button onClick={() => go(fallback)}>비슷한 강좌 찾기</Result.Button>} />;
  }
  if (error) {
    const limited = error instanceof ApiError && error.status === 429;
    return <Result title={limited ? "요청이 많아요. 잠시 후 다시 시도해 주세요" : "강좌 정보를 불러오지 못했어요"}
      description={limited ? "잠시 기다린 뒤 다시 확인해 주세요" : "네트워크 상태를 확인하고 다시 시도해 주세요"}
      button={<Result.Button onClick={() => { setError(null); setAttempt((n) => n + 1); }}>다시 시도</Result.Button>} />;
  }
  if (!c) return <Loading />;
  const seats = formatSeats(extra?.capacity ?? c.capacity, extra?.applicants ?? null);
  // 판단에 중요한 순서: 언제 → 얼마 → 몇 명 → 어디서 → 누가
  const rows: [string, string][] = [
    ["접수기간", formatPeriod(c.apply_start, c.apply_end)],
    ["교육기간", formatPeriod(c.course_start, c.course_end)],
    ["가격", formatCost(c)],
    ...(seats ? [["인원", seats] as [string, string]] : []),
    ["장소", c.mode === "online" ? "온라인" : (c.address ?? regionLabel(c, meta))],
    ["대상", c.target ?? "원문 확인"],
    ["유형", TYPE_LABEL[c.course_type] ?? c.course_type],
    ["기관", c.provider_name ?? "원문 확인"],
  ];
  return (
    <main>
      <div className="pad"><CourseImage c={c} className="hero" w={720} /></div>
      <Top
        subtitleTop={<CourseBadges c={c} />}
        title={<Top.TitleParagraph>{c.title}</Top.TitleParagraph>}
        subtitleBottom={<Top.SubtitleParagraph>{[c.provider_name, regionLabel(c, meta)].filter(Boolean).join(" · ")}</Top.SubtitleParagraph>}
        right={bm.enabled && (
          <Top.RightButton color={bm.has(c.id) ? "primary" : "dark"} variant="weak" size="small" loading={t.busy} onClick={() => void t.toggle(c)}>
            {bm.has(c.id) ? "★ 찜함" : "☆ 찜하기"}
          </Top.RightButton>
        )}
      />
      <ShareButton label="강좌 공유" path={() => buildCourseSharePath(c, meta)} message={c.title} params={{ target_type: "course", ...courseParams(c) }} />
      <div className="rows">
        {rows.map(([k, v]) => (
          <TableRow key={k} align="left" leftRatio={26}
            left={<Text typography="t6" color={adaptive.grey600}>{k}</Text>}
            right={<Text typography="t6" color={adaptive.grey900}>{v}</Text>} />
        ))}
      </div>
      {!!extra?.curriculum.length && (
        <Section title="커리큘럼" hint={`${c.attribution} 기준`}>
          <div className="pad curriculum">
            {groupCurriculum(extra.curriculum).map((g, i) => (
              <div key={i} className="subject">
                <Text typography="t6" fontWeight="bold" color={adaptive.grey800}>{g.subject}</Text>
                {g.units.map((u, j) => (
                  <div key={j} className="unit">
                    <Text typography="t7" color={adaptive.grey700}>{u.name}</Text>
                    {u.hours !== null && <Text typography="t7" color={adaptive.grey500}>{u.hours}시간</Text>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Section>
      )}
      <div className="pad notice">
        <Text typography="t7" color={adaptive.grey500}>신청 조건과 상세 내용은 원문에서 확인하세요. 출처: {c.attribution}</Text>
      </div>
      <FixedBottomCTA onClick={() => { track("njob_outbound_click", courseParams(c)); openOriginal(c.url); }}>원문에서 신청하기</FixedBottomCTA>
    </main>
  );
}
