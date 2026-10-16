# Store Insight · 매장 판매 실적 대시보드

`매장판매실적.xlsx`의 초기 데이터를 Supabase에 적재하고, DB의 최신 판매 기록을 읽는 한국어 반응형 대시보드입니다. 브라우저에서 Supabase REST API를 직접 조회하며 별도 백엔드, 빌드 과정 또는 외부 CDN이 필요하지 않습니다.

## 실행

저장소 디렉터리에서:

```sh
python -m http.server 4173 --bind 0.0.0.0
```

브라우저로 서버의 4173 포트에 접속합니다. 정적 호스팅에는 `index.html`, `styles.css`, `app.js`, `analytics.js`, `supabase-config.js`, `supabase-client.js`를 함께 배치합니다. 이 저장소의 `main` 푸시는 연결된 Vercel 프로젝트의 배포를 실행합니다.

## Supabase 최초 설정

1. [초기화 SQL 본문](https://raw.githubusercontent.com/m48483/skt_khp_dashboard_test/main/supabase/setup.sql)을 열고 **파일 내용 전체**를 복사합니다. 파일 경로나 URL을 SQL로 입력하지 않습니다.
2. [프로젝트 SQL Editor](https://supabase.com/dashboard/project/dbtsoovorkvtmlohpiuv/sql/new)에 붙여 넣고 **Run**을 누릅니다. `BEGIN;`으로 시작하는 트랜잭션 안에서 테이블 생성·권한 설정·1,017건 적재가 함께 실행됩니다.
3. 초기 결과 `rows=1017`, `revenue=515999400`, `quantity=1722`, `missing_quantity=5`를 확인합니다.
4. 대시보드에서 **새로고침**을 누릅니다. 연결 상태에 `Supabase 연결됨`이 표시되어야 합니다.

사용 테이블은 `public.dashboard_sales`입니다. `supabase/setup.sql`을 다시 실행해도 `source_row`가 같은 데이터는 추가하거나 덮어쓰지 않습니다. 기존 레코드 수정은 보존되며, 삭제했던 원본 행은 다시 추가됩니다. API의 `id`는 DB에서 생성되고 원본 Excel 행 번호는 `source_row`에 보존됩니다.

`supabase-config.js`에는 브라우저용 **publishable key**와 프로젝트 URL만 들어 있습니다. 이 키는 공개 설정이며 DB 비밀번호, service-role key, secret key는 사용하지 않습니다. Supabase의 RLS와 권한으로 `anon`/`authenticated`의 조회만 허용하고 추가·수정·삭제는 허용하지 않습니다. 이 공개 대시보드의 판매 기록은 익명 방문자가 조회할 수 있습니다.

## 데이터 운영 및 연결 동작

- Supabase **Table Editor → dashboard_sales**에서 관리자 권한으로 판매 기록을 추가·수정합니다. 새 행의 `id`는 자동 생성되며 `source_row`는 비워 둘 수 있습니다.
- 페이지를 열거나 **새로고침**을 누르면 DB를 다시 조회합니다. 자동 실시간 구독은 사용하지 않습니다.
- 조회는 ID 순서로 500건씩 진행하며 Supabase의 전체 건수를 확인합니다. 서버의 최대 응답 행 수가 더 작아도 끝까지 읽어 1,000건 제한에 따른 집계 누락을 방지합니다.
- 모든 페이지를 정상적으로 받은 후에만 차트와 KPI를 갱신합니다. 연결 실패, 시간 초과, 테이블 미생성, 권한 오류, 잘못된 행 형식은 화면에 표시합니다. 이전 엑셀 데이터나 직전 조회 합계를 최신 데이터처럼 표시하지 않습니다.
- 조회 결과가 0건이면 데이터와 SELECT 정책을 확인하도록 안내합니다. RLS가 모든 행을 숨긴 경우도 빈 응답이므로 ‘DB가 비어 있다’고 단정하지 않습니다.
- 새 날짜·월·연도·지역·매장·상품군은 DB 데이터에 맞춰 자동 반영됩니다. 새로고침 시 유효한 필터는 유지하며 전체 기간 조회 중에는 새 날짜까지 확장합니다.
- 현재 브라우저 집계는 최대 100,000건을 지원합니다. 이보다 많으면 서버 측 집계가 필요하다는 오류를 표시합니다.

실제 DB 연결을 읽기 전용으로 확인하려면 Node.js 18 이상에서:

```sh
node scripts/check_supabase.mjs
```

이 명령은 실제 Supabase를 조회합니다. 접속 가능한 네트워크와 초기 SQL 설정이 필요하며, 출력은 건수·합계·기간만 포함합니다.

## 제공 기능

- 기간, 월별 빠른 선택, 지역, 매장, 상품군 필터와 초기화
- 총 매출, 판매 수량, 판매 건수, 판매 매장 수 및 건당·일평균 매출
- 일별·월별 매출 추이, 상품군별 매출 비중, 상위 5개 매장, 지역별 매출
- 상세 내역 검색, 날짜·매출 정렬, 10건 단위 페이지 이동
- 현재 필터와 상세 검색을 모두 반영한 CSV 다운로드 (모든 페이지 포함, UTF-8 BOM)
- 중복 의심 행 제외 옵션, 수량 미기재 및 정제 기준 안내
- 모바일·태블릿·데스크톱 화면 지원

상단 집계와 차트는 조회 조건을 따르며, 상세 검색은 표와 CSV에만 적용됩니다. 매출 순위와 상품 비중은 매출액을 기준으로 합니다. 차트 위에 마우스를 올리면 구간별 정확한 매출과 건수가 표시됩니다.

## 데이터 기준

| 항목 | 기본 집계 |
| --- | ---: |
| 기간 | 2026-07-01 ~ 2026-09-30 |
| 판매 기록 | 1,017건 |
| 총 매출 | 515,999,400원 |
| 기재된 판매 수량 합계 | 1,722개 |
| 매장 / 지역 | 13개 / 7개 |
| 수량 미기재 | 5건 |
| 정규화 후 중복 의심 | 18건 |

- 날짜 객체, Excel 날짜 일련번호, `YYYYMMDD`, `YYYY.M.D`를 ISO 날짜로 통일합니다.
- 서울특별시·서울시 등 행정구역 표기를 서울·경기·부산·인천·대구·광주·대전으로 통일합니다.
- 매출 금액의 쉼표와 `원` 표기를 제거합니다. 매출액 열은 이미 거래 매출이므로 수량을 다시 곱하지 않습니다.
- 수량 누락은 추정하지 않습니다. 해당 기록의 매출과 판매 건수는 유지하고 수량 합계에서만 제외합니다.
- 요금제 공란 197건은 미기재로 표시합니다.
- 거래 ID가 없어 모든 기록을 기본적으로 보존합니다. 정규화 후 날짜·지역·매장·상품군·요금제·수량·매출·담당자가 모두 같은 추가 행 18건을 중복 의심으로 표시합니다. 제외 옵션을 켜면 첫 번째 기록만 남겨 999건이 됩니다. 원본 행 번호는 초기 파일의 `id`, DB의 `source_row`에 유지됩니다. DB에서 읽을 때 중복 여부를 다시 계산합니다.
- 일평균은 선택한 시작일과 종료일을 모두 포함한 달력 일수 기준이며, 판매가 없는 날은 0으로 처리합니다.

`data/sales.js`는 초기 적재 SQL 생성 및 테스트용 원본 스냅샷으로 보존됩니다. 대시보드는 이 파일을 로드하지 않고 Supabase의 판매 기록을 읽습니다. 원본 Excel 바이너리는 저장소에 포함하지 않았습니다.

## 데이터 재생성

Python 3.10 이상과 `openpyxl`이 필요합니다.

```sh
python -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python scripts/import_excel.py /path/to/매장판매실적.xlsx
```

변환 결과는 `data/sales.js`에 저장됩니다. 초기 적재 SQL 재생성은 `python scripts/prepare_supabase.py`로 실행합니다. SQL은 기존 `source_row`를 덮어쓰지 않으므로 다른 파일을 기존 DB와 병합할 때는 원본 행 번호 충돌을 먼저 확인해야 합니다. 일상적인 변경은 Supabase Table Editor에서 처리합니다. 엑셀은 데이터로만 읽고 매크로 또는 문서 내 지시를 실행하지 않습니다.

## 검증

집계 테스트는 Node.js 18 이상, 변환·브라우저 검증은 `requirements-dev.txt`의 Python 패키지를 사용합니다.

```sh
node --test tests/*.test.js
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
.venv/bin/python tests/browser_smoke.py
.venv/bin/python tests/browser_connection.py
```

단위·브라우저 테스트는 Supabase 응답을 모의하므로 실제 DB 연결 성공을 증명하지 않습니다. `scripts/check_supabase.mjs`와 배포된 화면의 연결 상태로 실제 연결을 확인합니다.

브라우저 테스트는 설치된 `chromium` 또는 `google-chrome`을 사용합니다. 시스템 브라우저가 없으면 `.venv/bin/python -m playwright install chromium`으로 설치할 수 있습니다. 테스트는 임시 로컬 서버를 자동으로 시작하고 종료합니다.

검증 범위: 원본 합계 보존, 복합 필터, 중복 처리, 누락 수량, 그룹별 합계, 92일 추이와 월별 집계, 검색, CSV 이스케이프 및 수식 보호, 날짜 오류·빈 결과, 페이지 이동, 실제 파일 다운로드, 320~1440px 화면, 브라우저 오류 여부.

## 파일 구성

- `index.html`, `styles.css`: 대시보드 화면과 반응형 스타일
- `app.js`: 필터와 화면 상호작용, SVG 차트, CSV 다운로드
- `analytics.js`: 독립적으로 검증 가능한 집계·검색·CSV 함수
- `data/sales.js`: 초기 적재·테스트용 정규화 원본 스냅샷
- `supabase-config.js`, `supabase-client.js`: 공개 연결 설정과 페이지 단위 DB 조회
- `supabase/schema.sql`, `supabase/setup.sql`: 조회 전용 RLS 테이블 및 초기 데이터 적재 SQL
- `scripts/prepare_supabase.py`, `scripts/check_supabase.mjs`: SQL 생성·실제 연결 확인
- `scripts/import_excel.py`: Excel 변환 도구
- `tests/`: 집계, 날짜 변환 및 브라우저 검증
