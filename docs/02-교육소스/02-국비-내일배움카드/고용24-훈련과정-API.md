# 고용24 훈련과정 Open API (1순위 데이터 소스)

- 확인일: 2026-10-11
- 출처: 고용24 OPEN-API 서비스 소개 페이지 원문(아래 URL)을 직접 받아서 확인. 엔드포인트는 실제로 호출해 응답까지 확인했다.

## 요약

- **있다.** 한국고용정보원이 고용24(work24.go.kr)에서 국민내일배움카드 훈련과정 API를 제공한다. 목록, 과정/기관정보, 훈련일정 3종이다.
- 목록 API 하나로 **지역(시도·시군구) + NCS 직종 + 훈련유형(KDT·KDC·산대특 등) + 훈련시작일 범위** 필터가 다 된다. 서비스의 "지역 + 분야" 매칭에 그대로 맞는다.
- 문제는 **인증키**다. 고용24 **기업회원 전용**이고 담당자 심사를 거쳐 발급된다. 사업자등록이 먼저 필요하다.
- 구 HRD-Net(hrd.go.kr)은 이제 work24.go.kr로 301 리다이렉트된다(2026-10-11 확인). 예전 HRD-Net API 문서는 참고만 하고 고용24 명세를 기준으로 삼는다.

## 1. 소스 기록

### 고용24 OPEN-API — 국민내일배움카드 훈련과정
- URL: https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do (소개), 명세: `selectOpenApiSvcInfo.do?fullApiSvcId=...` (아래 표)
- 운영 주체: 고용노동부 / 한국고용정보원(KEIS)
- 대상/자격: API 이용자는 고용24 기업회원. 데이터에 담긴 과정의 수강 자격은 과정마다 다르다(내일배움카드 소지자 등)
- 비용: API 무료. 공공데이터포털에도 "무료, 이용허락범위 제한 없음"으로 등록돼 있다
- 지역: 전국. 시도·시군구 코드로 필터한다
- AI 관련 강의 예시: API 응답은 키가 없어 보지 못했다. 같은 DB를 쓰는 공개 검색 화면 결과는 [민간훈련기관-AI과정-예시.md](민간훈련기관-AI과정-예시.md) 참고
- 갱신 주기: 공공데이터포털 표기는 "실시간"
- 데이터 수집: **Open API** (XML 또는 JSON)
- 제약: 기업회원 + 심사 후 인증키 발급. 인증키는 타 기관 양도 금지, 활용제한 사유가 생기면 KEIS가 이용을 제한할 수 있다. 일일 호출 한도는 공식 문서에 없다(한 민간 프로젝트 README는 "일 1,000회"라고 적었다 — 미확인)
- 서비스 우선순위: **상** — 국비 과정 전체를 지역·분야 필터로 받을 수 있는 유일한 공식 경로
- 확인일 / 출처: 2026-10-11 / work24.go.kr OPEN-API 소개·명세 페이지, https://www.data.go.kr/data/15109032/openapi.do

## 2. 인증키 발급 절차 (고용24 원문)

1. 회원가입: "OPEN-API는 고용24 기업회원 전용 서비스입니다."
2. 인증키 신청: 로그인 후 OPEN-API → 서비스 소개 및 신청 메뉴
3. 심사 및 발급: 담당자 심사 후 발급. 소요기간은 공식 표기 없음(민간 README에는 약 5영업일 — 미확인)
4. 사용: API별 개발명세서 형식대로 호출

- 공공데이터포털에도 같은 API가 등록돼 있다: "한국고용정보원_직업훈련_국민내일배움카드 훈련과정"(data.go.kr 15109032, API 유형 LINK). 설명에 국민내일배움카드·K-디지털 트레이닝·K-디지털 기초역량훈련 과정을 포함한다고 적혀 있다. 개발계정 자동승인, 운영계정 심사승인으로 표기돼 있다. LINK 유형이라 실제 호출은 고용24로 가는 것으로 보인다. 공공데이터포털 키로 고용24 API를 부를 수 있는지는 **미확인**이다.
- 키 없이 호출하면 `<GO24><error>인증키가 존재하지 않습니다</error></GO24>`, 엉터리 키를 넣으면 `신청하신 OpenApi 서비스가 존재하지 않습니다`가 온다(2026-10-11 실제 호출).

## 3. 훈련 관련 API 목록

| API | 엔드포인트 (`https://www.work24.go.kr/cm/openApi/call/hr/` + ) | 명세 fullApiSvcId 끝자리 |
|---|---|---|
| 국민내일배움카드 훈련과정 — 목록 | `callOpenApiSvcInfo310L01.do` | 4^5 |
| 국민내일배움카드 훈련과정 — 과정/기관정보 | `callOpenApiSvcInfo310L02.do` | 4^6 |
| 국민내일배움카드 훈련과정 — 훈련일정 | `callOpenApiSvcInfo310L03.do` | 4^7 |
| 사업주훈련 훈련과정 — 목록 | `callOpenApiSvcInfo311L01.do` (L02·L03 동일 패턴으로 추정) | 9^10 |
| 국가인적자원개발 컨소시엄 훈련과정 — 목록 | `callOpenApiSvcInfo312L01.do` | 13^14 |
| 일학습병행 훈련과정 — 목록 | `callOpenApiSvcInfo313L01.do` | 17^18 |
| 구직자취업역량 강화프로그램 | `callOpenApiSvcInfo217L01.do` | 98^99 |
| 공통코드 — 훈련(KECO, NCS, 훈련종류 등) | `callOpenApiSvcInfo319L01.do` | 94^95 |

명세 페이지 URL 형식: `https://www.work24.go.kr/cm/e/a/0110/selectOpenApiSvcInfo.do?fullApiSvcId=000000000000000000000000000004%5E000000000000000000000000000005` (앞뒤 30자리 0패딩, `^`로 연결). 로그인 없이 열린다.

## 4. 목록 API (310L01) 명세

예시:
```
https://www.work24.go.kr/cm/openApi/call/hr/callOpenApiSvcInfo310L01.do
  ?authKey=[인증키]&returnType=XML&outType=1&pageNum=1&pageSize=20
  &srchTraStDt=20141001&srchTraEndDt=20141231&srchTraArea1=[훈련지역 대분류]
  &sort=ASC&sortCol=2
```

| 파라미터 | 필수 | 설명 |
|---|---|---|
| authKey | 필수 | 인증키 |
| returnType | 필수 | `XML` 또는 `JSON` |
| outType | 필수 | `1` 리스트, `2` 상세 |
| pageNum | 필수 | 시작페이지, 기본 1, **최대 1000** |
| pageSize | 필수 | 페이지당 건수, 기본 10, **최대 100** |
| srchTraStDt | 필수 | 훈련시작일 From (YYYYMMDD) |
| srchTraEndDt | 필수 | 훈련시작일 To (YYYYMMDD) |
| sort | 필수 | `ASC` / `DESC` |
| sortCol | 필수 | `1` 훈련기관명, `2` 훈련시작일, `3` 훈련기관 직종별 취업률, `5` 만족도점수 |
| wkendSe | 선택 | 주말 `1`, 주말·주중 혼합 `2`, 주중 `3`, 해당없음 `9` |
| srchTraArea1 | 선택 | 훈련지역 대분류: `11` 서울, `12` 전남광주, `26` 부산, `27` 대구, `28` 인천, `30` 대전, `31` 울산, `36` 세종, `41` 경기, `43` 충북, `44` 충남, `45` 전북, `47` 경북, `48` 경남, `50` 제주, `51` 강원 |
| srchTraArea2 | 선택 | 훈련지역 중분류(시군구). 코드는 공통코드 API(srchType=01) |
| srchNcs1 | 선택 | NCS 대분류: `01` 사업관리, `02` 경영/회계/사무, `03` 금융/보험, `04` 교육/자연/사회과학, `05` 법률/경찰/소방/교도/국방, `06` 보건/의료, `07` 사회복지/종교, `08` 문화/예술/디자인/방송, `09` 운전/운송, `10` 영업판매, `11` 경비/청소, `12` 이용/숙박/여행/오락/스포츠, `13` 음식서비스, `14` 건설, `15` 기계, `16` 재료, `17` 화학/바이오, `18` 섬유/의복, `19` 전기/전자, `20` 정보통신, `21` 식품가공, `22` 인쇄/목재/가구/공예, `23` 환경/에너지/안전, `24` 농림어업 |
| srchNcs2~4 | 선택 | NCS 중·소·세분류. 코드는 공통코드 API |
| crseTracseSe | 선택 | 훈련유형: `C0061` 국민내일배움카드(일반), `C0061S` 내배카(구직자 주대상), `C0061I` 내배카(재직자 주대상), `C0054` 국가기간전략산업직종, `C0055C` 과정평가형, `C0054G` 기업맞춤형, `C0054Y` 스마트혼합, `C0054S` 일반고특화, **`C0104` K-디지털 트레이닝**, **`C0105` K-디지털 기초역량훈련**, **`C0102` 산업구조변화대응**, `C0055` 실업자 원격, `C0031` 근로자 원격, `C0031C` 돌봄서비스, `C0031F` 근로자 외국어 |
| srchTraGbn | 선택 | 훈련구분: `M1001` 일반(집체), `M1005` 인터넷, `M1010` 혼합(BL), `M1014` 스마트혼합 |
| srchTraType | 선택 | 훈련종류(공통코드 API) |
| srchTraProcessNm | 선택 | 훈련과정명 (키워드 검색) |
| srchTraOrganNm | 선택 | 훈련기관명 |

선택 파라미터는 "전체"일 때 아예 빼야 한다(명세 원문: "전체일 경우에는 옵션 파라미터의 미등록처리").

응답(목록) 주요 필드 — 루트 `<HRDNet>`, `<scn_cnt>` 총건수, `<srchList><scn_list>` 반복:

| 필드 | 의미 |
|---|---|
| TRPR_ID / TRPR_DEGR | 훈련과정ID / 회차 (상세·일정 API 키) |
| TRAINST_CST_ID | 훈련기관ID (상세·일정 API의 srchTorgId) |
| TITLE / SUB_TITLE | 과정명 / 기관명(부제목) |
| TITLE_LINK / SUB_TITLE_LINK | 고용24 상세 링크 |
| TRA_START_DATE / TRA_END_DATE | 훈련 시작/종료일 |
| ADDRESS / TEL_NO / TRNG_AREA_CD | 주소 / 전화 / 지역코드(중분류) |
| NCS_CD | NCS 코드 |
| COURSE_MAN / REAL_MAN | 수강비 / 실제 훈련비 |
| YARD_MAN / REG_COURSE_MAN | 정원 / 수강신청 인원 |
| EI_EMPL_RATE3 / EI_EMPL_RATE6 / EI_EMPL_CNT3 | 고용보험 3·6개월 취업률 / 취업인원 |
| STDG_SCOR / GRADE | 만족도 점수 / 등급 |
| TRAIN_TARGET / TRAIN_TARGET_CD | 훈련대상 / 훈련구분 |
| WKED_SE | 주말/주중 구분 |
| CERTIFICATE / CONTENTS | 자격증 / 컨텐츠 |

## 5. 과정/기관정보 API (310L02)

- 파라미터: authKey, returnType, `outType=2`, `srchTrprId`(필수), `srchTrprDegr`(필수), `srchTorgId`(필수)
- 응답 블록: `inst_base_info`(기관명, 주소, 홈페이지, 과정명, NCS명, 총 훈련시간 TRTM, 총 훈련일수 TR_DCNT, 실제 훈련비 INST_PER_TRCO, **정부지원금 PER_TRCO**, 훈련방법코드, 담당자 연락처, 국가기간전략산업직종 여부 TRPR_UP_YN), `inst_detail_info`(훈련분야명, **본인부담액 TGCR_GNRL_TRNE_OWEP_ALLT**), 시설·장비 목록

## 6. 훈련일정 API (310L03)

- 파라미터: authKey, returnType, `outType=2`, `srchTrprId`(필수), `srchTrprDegr`(선택, 비우면 전 회차), `srchTorgId`(필수)
- 응답: 회차별 시작/종료일, 모집정원 TOT_FXNUM, 수강인원, 수료인원, 총 훈련비, 3·6개월 취업률(값이 `A` 개설예정, `B` 진행중, `C` 미실시, `D` 수료자 없음 중 하나일 수도 있음)

## 7. 공통코드 API (319L01)

- `returnType`은 **XML만** 지원(명세 원문 "반드시 XML 로 지정")
- `srchType`: `00` 훈련지역 대분류, `01` 중분류, `02~04` KECO 대·중·소, `05~08` NCS 대·중·소·세, `09` 훈련종류, `10` 훈련방법, `11` 훈련기관 구분
- `srchOption1`, `srchOption2`: 하위 코드 조회용 (예: srchType=01 + srchOption1=11 → 서울의 시군구 코드)
- 응답: RSLT_CODE / RSLT_NAME / USE_YN

## 8. 서비스 적용 메모

- **일 배치 설계:** srchTraStDt=오늘, srchTraEndDt=오늘+90일 정도로 잡고 pageSize=100으로 페이지를 넘긴다. 필요하면 crseTracseSe(C0104/C0105/C0102/C0061)별로 나눠 호출한다. 이 API에는 "AI" 분류가 없다. 분야 분류는 과정명 키워드(생성형, 챗GPT, AI 영상, 바이브코딩, 자동화, n8n 등)와 NCS(20 정보통신, 08 문화/예술/디자인/방송, 02 경영/회계/사무)를 섞어서 우리가 직접 붙여야 한다.
- **페이지 상한:** pageNum 최대 1000 × pageSize 100 = 한 쿼리 최대 10만 건. 날짜 범위만 적당히 쪼개면 충분하다.
- **지역 매칭:** 원격(인터넷, M1005) 과정은 기관 주소만 있고 지역과는 사실상 상관없다. 이런 과정은 "전국 온라인"으로 따로 분류한다. KDC는 전부 원격이다.
- **비용 표시:** 목록의 REAL_MAN만으로는 자부담을 알 수 없다. 상세 API의 본인부담액(TGCR_GNRL_TRNE_OWEP_ALLT)을 쓴다. 다만 이 값은 '일반 훈련생' 기준이고, 실제 자부담은 훈련생 유형마다 달라진다(공개 검색 화면에도 "'일반 훈련생' 참여 유형 본인부담금액"이라고 적혀 있다).
- **출처 표기:** 고용24(한국고용정보원) 출처를 표기한다. 이용약관 세부 조건은 키 신청 단계에서 다시 확인한다(미확인).

## 9. 키가 없을 때의 대안 — 공개 검색 화면 크롤링

- `https://www.work24.go.kr/hr/a/a/1100/trnnCrsInf.do?keyword=...&startDate=YYYYMMDD&endDate=YYYYMMDD&pageIndex=1&orderKey=2&orderBy=ASC&action=trnnCrsInfPost.do&pageId=2`
- **서버 렌더링(SSR)** 이다. GET 한 번이면 HTML에 과정명, 기관명, 회차, 기간, 지역, 본인부담금이 들어 있다(2026-10-11 실제 요청으로 확인). 결과 총건수도 표시된다. 예: 키워드 "생성형" 1,027건, "바이브코딩" 82건.
- 화면에 엑셀 다운로드(`trnnCrsInfExcelPost.do`)도 있다(동작은 미확인).
- robots.txt (2026-10-11): `User-Agent: *`에 대해 `/cm/common/`, `/sa/`, `/ei/`, 통합검색(`/cm/f/c/0100/selectUnifySearchPost.do`)만 막혀 있고 `/hr/` 훈련 검색은 막혀 있지 않다. 그래도 공식 API가 있는 만큼 크롤링은 **키 발급 전 임시 수단**으로만 쓰고, 호출 빈도는 낮게 유지한다.
- 이 화면에서 pageSize=50을 줘도 실제로는 10건씩 나왔다. 화면 파라미터와 API 파라미터는 다르다.
