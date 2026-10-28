# 공공 Open API·파일데이터 목록 (교육·훈련·강좌)

- 작성일: 2026-10-11 / 담당: E(데이터 수집)
- 표기: **확인** = 2026-10-11에 원문 페이지를 직접 열어 봄. **미확인** = 원문 근거를 찾지 못함.

## 요약 표

| # | 데이터 | 제공기관 | 방식 | 인증키 | 갱신 | 라이선스 | 우선순위 |
|---|---|---|---|---|---|---|---|
| 1 | 국민내일배움카드 훈련과정 목록 API | 한국고용정보원 (고용24) | REST(XML/JSON) | 고용24 **기업회원** 가입 후 신청, 담당자 심사 | 실시간 | data.go.kr 표기 "이용허락범위 제한 없음" | **상** |
| 2 | 전국평생학습강좌표준데이터 API | 교육부 소관, 지자체·교육청 348개 제공 | REST(XML/JSON) | data.go.kr 활용신청(자동승인) | 분기 (월초 전국 취합) | 미확인 (페이지에 표기 없음) | **상** |
| 3 | 서울시 공공서비스예약 – 교육 (`ListPublicReservationEducation`) | 서울특별시 | REST(XML/JSON) | 서울 열린데이터광장 인증키 | 비정기(수시) | 공공누리 1유형 | **상** (서울) |
| 4 | 경기데이터드림 평생학습 강좌 데이터셋 | 경기도평생교육진흥원 외 | REST(XML/JSON) | 경기데이터드림 인증키 | 미확인 | 미확인 | 중 (경기) |
| 5 | K-MOOC 강좌정보 API | 국가평생교육진흥원 | REST(JSON) | data.go.kr 활용신청 | 실시간 | 이용허락범위 제한 없음 | 중 (온라인 전국) |
| 6 | 대구 평생학습포털 강좌조회서비스 | 대구광역시 | REST(XML) | data.go.kr 활용신청 | 실시간 | 이용허락범위 제한 없음 | 하~중 (대구) |
| 7 | 대한민국 공공서비스(혜택) 정보 (보조금24) | 행정안전부 | REST(JSON/XML) | data.go.kr 활용신청(자동승인) | 실시간 | 이용허락범위 제한 없음 | 하 (강좌가 아니라 지원제도) |

> 공공데이터법 제3조 제4항: 공공기관은 다른 법률의 특별 규정 등이 아니면 **영리적 이용이어도 금지·제한하면 안 된다.** 그래서 공공 API는 상업 서비스의 1순위 소스다. 다만 공공누리 2·4유형이 붙은 데이터는 상업적 이용 금지다(아래 라이선스 참고).
> 출처: https://www.nepla.ai/law/공공데이터의-제공-및-이용-활성화에-관한-법률 (확인일 2026-10-11)

---

## 1. 국민내일배움카드 훈련과정 API (고용24) — 확인

- data.go.kr 등록명: `한국고용정보원_직업훈련_국민내일배움카드 훈련과정` (유형 LINK → 실제 호출은 고용24)
  - 키워드에 "AI, 빅데이터, 디지털트레이닝" 포함. K-디지털 트레이닝, K-디지털 기초역량훈련 과정도 이 API로 조회한다.
  - 무료, 업데이트 실시간, 이용허락범위 제한 없음, 트래픽은 "해당 기관의 정책에 따라 상이"
- **요청 URL (목록)**: `https://www.work24.go.kr/cm/openApi/call/hr/callOpenApiSvcInfo310L01.do`
  - 같은 묶음으로 "과정/기관정보", "훈련일정" API도 있다. 상세 URL은 미확인(고용24 Open-API 메뉴에서 확인).
- **인증키**: 고용24 Open-API 안내 원문에 따르면 "OPEN-API는 고용 24 **기업회원 전용** 서비스"다. 로그인 → OPEN-API 서비스 소개 및 신청 → **담당자 심사 후 발급**. 인증키는 타 기관 양도 불가.
  - 개인사업자라도 사업자 등록 후 기업회원으로 가입해야 할 것으로 보인다(추정, 확인 필요).
- **필수 파라미터**: `authKey`, `returnType`(XML|JSON), `outType`(1 리스트/2 상세), `pageNum`(최대 1000), `pageSize`(최대 100), `srchTraStDt`, `srchTraEndDt`(훈련시작일 From/To, YYYYMMDD), `sort`(ASC|DESC), `sortCol`(1 기관명, 2 시작일, 3 취업률, 5 만족도)
- **선택 파라미터 (매칭에 쓸 것)**
  - `srchTraArea1` 훈련지역 대분류: '11' 서울, '26' 부산, '27' 대구, '28' 인천, '30' 대전, '31' 울산, '36' 세종, '41' 경기, '43' 충북, '44' 충남, '45' 전북, '47' 경북, '48' 경남, '50' 제주, '51' 강원, '12' 전남광주 (원문 그대로)
  - `srchTraArea2` 중분류(코드 API 별도), `srchNcs1~4`(NCS 직종, '20' 정보통신, '08' 문화/예술/디자인/방송 등)
  - `crseTracseSe` 훈련유형: `C0104` K-디지털 트레이닝, `C0105` K-디지털 기초역량훈련, `C0061` 국민내일배움카드(일반) 등
  - `srchTraGbn`: `M1001` 일반, `M1005` 인터넷, `M1010` 혼합(BL), `M1014` 스마트혼합 → 온/오프라인 판별에 사용
  - `srchTraProcessNm` 과정명 키워드 검색 → "AI", "생성형", "챗GPT" 등으로 1차 필터 가능
- **주요 응답 필드**: `title`, `subTitle`(기관명), `titleLink`, `subTitleLink`, `address`, `telNo`, `traStartDate`, `traEndDate`, `trainTarget`, `trainTargetCd`, `courseMan`(수강비), `realMan`(실제 훈련비), `yardMan`(정원), `regCourseMan`(신청인원), `trngAreaCd`(지역 중분류), `ncsCd`, `trprId`+`trprDegr`(과정ID+회차 → **고유키**), `trainstCstId`, `stdgScor`, `eiEmplRate3/6`, `wkendSe`
- 주의: 모집기간(접수 시작/마감) 필드는 목록 응답에 없다. 마감 판단은 `traStartDate` 기준으로 하거나 상세/일정 API를 써야 한다(미확인).
- 출처 (확인일 2026-10-11)
  - https://www.data.go.kr/data/15109032/openapi.do
  - https://www.data.go.kr/catalog/15109032/openapi.json
  - https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do (이용절차, 기업회원 전용 문구)
  - 고용24 Open-API "국민내일배움카드 훈련과정 API - 목록" 명세 (selectOpenApiSvcInfoPost.do, POST 화면이라 직접 링크 불가)

## 2. 전국평생학습강좌표준데이터 — 확인

- 소관: 교육부. 제공: 지자체·교육청 (제공기관 348개 목록)
- **요청주소**: `https://api.data.go.kr/openapi/tn_pubr_public_lftm_lrn_lctre_api`
- 인증: data.go.kr 회원가입 → 활용신청. 개발·운영단계 모두 **자동승인**
- 트래픽: 개발계정 10,000 / 운영계정은 활용사례 등록 시 증가 신청
- 갱신: **분기**. "기관별 데이터는 매월 초 전국 단위로 취합"되어 지연될 수 있음. 페이지 수정일 2026-09-03
- 포맷: XML/JSON(API), 파일 XLS/CSV/JSON/XML/RDF. 그리드 다운로드는 5만 건 제한 → 전체는 API로
- 요청변수: `serviceKey`, `pageNo`, `numOfRows`, `type`(xml/json) + 각 출력항목으로 필터
- **출력필드**: `lctreNm` 강좌명, `instrctrNm` 강사명, `edcStartDay`/`edcEndDay` 교육기간, `edcStartTime`/`edcColseTime`, `lctreCo` 강좌내용, `edcTrgetType` 교육대상, `edcMthType` 교육방법(온/오프), `operDay`, `edcPlace`, `psncpa` 정원, `lctreCost` 수강료, `edcRdnmadr` 교육장 도로명주소, `operInstitutionNm` 운영기관, `operPhoneNumber`, `rceptStartDate`/`rceptEndDate` **접수기간**, `rceptMthType`, `slctnMthType`, `homepageUrl`, `oadtCtLctreYn` 직업능력개발훈련비 지원 여부, `pntBankAckestYn`, `lrnAcnutAckestYn`, `referenceDate`, `instt_code`/`instt_nm` 제공기관
- 장점: 공통 스키마라 어댑터 1개로 전국 평생학습관 강좌를 받는다. 접수기간 필드가 있어 마감 처리가 쉽다.
- 단점: 분기 갱신이라 신규 강좌 반영이 늦다. 지역은 시군구 코드가 아니라 `edcRdnmadr`(주소) → 직접 파싱해야 한다. 라이선스 표기가 페이지에서 확인되지 않음(미확인, data.go.kr 표준데이터는 통상 제한 없음이나 확인 필요).
- 출처: https://www.data.go.kr/data/15013110/standard.do (확인일 2026-10-11)

## 3. 서울시 공공서비스예약 – 교육 — 확인 (실호출)

- 서비스명 `ListPublicReservationEducation`. 2026-10-11에 sample 키로 실제 호출해 응답을 받았다(`list_total_count` 392건).
  - 예: `http://openapi.seoul.go.kr:8088/{KEY}/json/ListPublicReservationEducation/1/1000/`
- 원본: 서울시 공공서비스예약(yeyak.seoul.go.kr). 제공부서 디지털도시국 정보시스템과. 갱신 비정기(수시). **공공누리 1유형**(출처표시, 상업적 이용·변경 가능)
- 응답 필드: `SVCID`(고유키), `SVCNM`, `MAXCLASSNM`/`MINCLASSNM`(대/소분류), `SVCSTATNM`(접수중/마감 등 → **마감 처리에 바로 사용**), `PAYATNM`(무료/유료), `PLACENM`, `USETGTINFO`(대상), `SVCURL`(원문), `X`/`Y`, `SVCOPNBGNDT`/`SVCOPNENDDT`, `RCPTBGNDT`/`RCPTENDDT`(접수), `AREANM`(자치구), `IMGURL`, `DTLCONT`(HTML), `TELNO`, `V_MAX`/`V_MIN`, `REVSTDDAYNM`, `REVSTDDAY`
- 1회 호출 최대 건수: 1,000건으로 알려져 있음(미확인)
- 데이터셋 페이지: OA-2271 "서울시 공공서비스예약 정보"(전체), 자치구별 교육 데이터셋도 별도(예: OA-12092 동작구). `ListPublicReservationEducation`이 어느 OA 번호에 매핑되는지는 미확인.
- 출처 (확인일 2026-10-11)
  - https://data.seoul.go.kr/dataList/OA-2271/S/1/datasetView.do
  - https://data.seoul.go.kr/dataList/OA-12092/S/1/datasetView.do

## 4. 경기데이터드림 — 일부 확인

- 공통 규칙(확인): 기본 주소 `https://openapi.gg.go.kr`, 파라미터 `KEY`, `Type`(xml|json, 기본 xml), `pIndex`, `pSize`(1~1,000). "OpenAPI 요청 횟수에 제한을 두고 있지 않음". 키 없으면 sample로 5건만 출력.
- 후보 데이터셋 (검색으로 존재 확인, 상세 페이지가 JS 렌더링이라 서비스명·필드·라이선스 **미확인**)
  - 경기도평생교육진흥원_우리동네 평생학습강좌 개설 현황 — 시군 평생학습관·주민자치센터 강좌 (강좌명, 기관명, 장소, 접수·강의기간, 수강료, 정원 등으로 소개됨)
  - 평생학습 강좌 현황(제공표준) — 위 2번 표준데이터의 경기 분량으로 보임(추정). 2번을 쓰면 중복
  - 온라인경력개발센터 꿈날개 교육정보 — 경력단절여성 대상 온라인 교육
  - 경기도 인재개발원 교육과정 현황 — 공무원 교육이라 대상 아님
- 출처 (확인일 2026-10-11)
  - https://data.gg.go.kr/portal/openapi/usagePage.do
  - https://data.gg.go.kr/portal/data/service/selectServicePage.do?infId=73LZS4W49C1GMP9VVYJY30018287&infSeq=1
  - https://data.gg.go.kr/portal/data/service/selectServicePage.do?infId=Q318MFGTWD8D0Q36X8H112883673&infSeq=3
  - https://data.gg.go.kr/portal/data/service/selectServicePage.do?infId=NA8ICEBQG4RDQLAFAMAC30408067&infSeq=2

## 5. K-MOOC 강좌정보 API — 일부 확인

- data.go.kr `국가평생교육진흥원_K-MOOC_강좌정보API`, 기본 경로 `apis.data.go.kr/B552881/kmooc_v2_0` (오퍼레이션명 미확인)
- 실시간, 개발계정 10,000, 이용허락범위 제한 없음. 강좌명·코드·제공기관·학습기간 등 20여 항목 JSON
- 전부 온라인·무료라 "지역 무관 온라인" 탭에 넣기 좋다. 다만 대학 강의 위주라 N잡러 실무형(블로그 수익화 등) 비중은 낮을 것으로 예상.
- 출처: https://www.data.go.kr/data/15042355/openapi.do , https://www.data.go.kr/catalog/15042355/openapi.json (확인일 2026-10-11)

## 6. 대구광역시 평생학습포털 강좌조회서비스 — 확인

- REST/XML, 실시간, 개발계정 트래픽 1,800, 개발 자동승인·운영 심의승인, 이용허락범위 제한 없음. 엔드포인트·필드는 Swagger 이미지로만 제공(미확인)
- 출처: https://www.data.go.kr/data/15061491/openapi.do (확인일 2026-10-11)

## 7. 대한민국 공공서비스(혜택) 정보 (보조금24) — 확인

- 행정안전부. `https://api.odcloud.kr/api/gov24/v3/serviceList`, `/serviceDetail`, `/supportConditions`
- 개발 10,000, 자동승인, 실시간, 이용허락범위 제한 없음
- serviceList 필드: 서비스ID, 지원유형, 서비스명, 서비스목적요약, 지원대상, 선정기준, 지원내용, 신청방법, 신청기한, 상세조회URL, 소관기관코드/명, 부서명, 사용자구분, 서비스분야, 접수기관, 전화문의, 등록/수정일시
- 필터: `cond[서비스명::LIKE]`, `cond[서비스분야::LIKE]`, `cond[수정일시::GTE]` 등 → **수정일시 GTE로 증분 수집 가능**
- 용도: 개별 강좌가 아니라 "내일배움카드", "디지털 역량 교육 지원" 같은 **지원제도** 정보다. 강좌 목록 옆에 "이런 지원도 받을 수 있어요" 배너용. MVP에선 뺀다.
- 출처: https://www.data.go.kr/data/15113968/openapi.do , Swagger https://infuser.odcloud.kr/api/stages/44436/api-docs (확인일 2026-10-11)

## 찾지 못한 것 (미확인)

- **디지털배움터(NIA)** 교육과정 API: data.go.kr 검색에서 확인 안 됨 → 헤드리스 브라우저로 수집 (A 담당 문서 참고)
- **소상공인 교육(소진공 지식배움터 등)** API: 확인 안 됨. "지식배움터_학습과정정보"는 재정경제부 직원 교육 데이터라 무관
- 경기데이터드림 개별 서비스명·필드
- 지자체별 파일데이터(부산 서구, 울산 중구 정보화교육 등 CSV)는 다수 있으나 포맷이 제각각이고 갱신이 드물다 → MVP 제외

## 공공누리 유형 (라이선스 판단 기준)

| 유형 | 조건 | 우리 서비스 사용 |
|---|---|---|
| 1유형 | 출처표시, 상업적 이용 가능, 변경 가능 | 가능 (출처표시 필수) |
| 2유형 | 출처표시, **비상업적만** | 상업 서비스면 불가 |
| 3유형 | 출처표시, 상업 가능, **변경 금지** | 원문 그대로 노출만. 요약·재가공 주의 |
| 4유형 | 출처표시, 비상업, 변경 금지 | 불가 |

출처: https://www.kogl.or.kr/info/license.do (확인일 2026-10-11)
