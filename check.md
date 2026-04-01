# KSOR 기능 검토 체크리스트 (Feature Review Checklist)

> 각 페이지별 프론트엔드 ↔ 백엔드 ↔ DB 전체 검증 항목

---

## 1. 로그인 페이지 (`/login`)

### 1.1 UI 렌더링
- [ ] 로고 및 브랜딩 정상 표시
- [ ] 이메일(login_id) 입력 필드 표시
- [ ] 비밀번호 입력 필드 표시
- [ ] 비밀번호 보기/숨기기 토글 동작
- [ ] 로그인 버튼 표시
- [ ] 데모 계정 빠른 로그인 버튼 표시 (Admin, Doctor)

### 1.2 로그인 기능
- [ ] 정상 계정 로그인 → JWT 발급 → `ksor_token` localStorage 저장
- [ ] 로그인 성공 후 대시보드(`/`)로 리다이렉트
- [ ] 잘못된 비밀번호 → 인라인 에러 메시지 표시
- [ ] 존재하지 않는 계정 → 에러 메시지 표시
- [ ] 빈 필드 제출 시 → 클라이언트 사이드 유효성 검사
- [ ] 로그인 중 버튼 로딩 상태 표시 (중복 클릭 방지)
- [ ] 잠긴 계정(`is_locked=true`) → 적절한 에러 메시지
- [ ] 비활성 계정(`is_active=false`) → 적절한 에러 메시지

### 1.3 데모 모드
- [ ] 데모 Admin 버튼 클릭 → `admin@ksor.kr / ksor2024`로 자동 입력 및 로그인
- [ ] 데모 Doctor 버튼 클릭 → `doctor@ksor.kr / doctor123`로 자동 입력 및 로그인
- [ ] 데모 로그인 시 `token = null`, `user.id`가 `demo-`로 시작
- [ ] 데모 유저는 백엔드 없이 UI만 접근 가능

### 1.4 백엔드 검증
- [ ] `POST /api/auth/login` — 요청 본문: `{ login_id, password }`
- [ ] 응답: `{ access_token, refresh_token, user }` 구조 일치
- [ ] `auth.user_account` 테이블에서 사용자 조회 정상
- [ ] `auth.auth_session` 테이블에 세션 생성
- [ ] `audit.security_event`에 로그인 이벤트 기록
- [ ] 비밀번호 해시 비교 (argon2id) 정상 동작
- [ ] 로그인 실패 횟수 카운트 (`failed_login_count`)
- [ ] 연속 실패 시 계정 잠금 (`login_failure_lock_count=5`)
- [ ] IP 기반 스로틀링 동작 확인

---

## 2. 대시보드 페이지 (`/`)

### 2.1 UI 렌더링
- [ ] 요약 통계 카드 4개 표시 (총 수술, 이번 달 수술, PROM 대기, 합병증)
- [ ] VAS & ODI 추이 꺾은선 그래프 표시
- [ ] 수술 접근법 분포 파이 차트 표시 (Full-endo, UBE, Biportal, Open)
- [ ] 로딩 스피너 표시 후 데이터 로드

### 2.2 데이터 정합성
- [ ] 총 수술 수 — DB `clinical.case_record` count와 일치
- [ ] 이번 달 수술 수 — 현재 월 기준 필터링 정확
- [ ] PROM 대기 수 — `survey.prom_request` 미완료 건수와 일치
- [ ] 합병증 수 — `clinical.case_outcome_form.complication_yn=true` 건수 일치
- [ ] VAS/ODI 추이 — `survey.prom_submission` 데이터 기반 평균값 정확

### 2.3 백엔드 검증
- [ ] `GET /api/dashboard/summary` — 응답 필드: `total_surgeries`, `this_month`, `prom_pending`, `complications`
- [ ] `GET /api/dashboard/my-surgeries` — 접근법별 분포 데이터
- [ ] `GET /api/dashboard/outcomes` — 시점별 VAS/ODI 평균값
- [ ] 인증 토큰 없이 접근 시 → 401 응답
- [ ] RLS 정책: 자기 병원 데이터만 조회

### 2.4 데모 모드
- [ ] 토큰 없을 때 하드코딩된 데모 데이터 표시
- [ ] 차트 및 카드에 데모 값 정상 렌더링

---

## 3. 환자 추적 페이지 (`/patients`)

### 3.1 환자 목록 표시
- [ ] 테이블 컬럼 정상 표시: 번호, 등록번호, 이름, 성별/나이, 내원일, 수술일, 진단코드, 수술코드
- [ ] 추적관찰 상태 배지 5개 표시 (Pre-op, 1M, 3M, 6M, 1Y)
- [ ] 상태 배지 색상: Completed(녹), Pending(황), Not Due(회), Overdue(적)
- [ ] 페이지네이션 표시 (20건/페이지)
- [ ] 총 환자 수 표시
- [ ] 빈 목록 시 안내 메시지 표시

### 3.2 검색 및 필터
- [ ] 등록번호(ID) 검색 → 정확한 필터링
- [ ] 환자 이름 검색 → ILIKE 패턴 매칭
- [ ] 추적 기간 필터 (전체, Pre-op, 1개월, 3개월, 6개월, 1년)
- [ ] 검색어와 기간 필터 동시 적용
- [ ] 페이지 이동 시 검색 조건 유지

### 3.3 신규 환자 등록 (모달)
- [ ] "신규 환자 등록" 버튼 클릭 → 모달 표시
- [ ] 이름 입력 필드 — `maxLength={20}` 제한
- [ ] 성별 선택 (M/F)
- [ ] 생년월일 날짜 선택기 — `max="9999-12-31"` 제한
- [ ] 빈 이름 제출 → 인라인 에러 "환자 이름을 입력해주세요."
- [ ] 빈 생년월일 제출 → 인라인 에러 "생년월일을 선택해주세요."
- [ ] 에러 필드 포커스 및 빨간 테두리
- [ ] 등록 중 버튼 로딩 상태
- [ ] 등록 성공 → 모달 닫힘, 목록 갱신
- [ ] 등록 실패 → 에러 메시지 모달 내 표시

### 3.4 신규 환자 등록 — 백엔드
- [ ] `POST /api/patients` 요청 본문: `{ patient_initial, sex, birth_year, birth_date, visit_date }`
- [ ] `patient.patient` 테이블에 INSERT — `patient_id`는 시퀀스(`patient_id_seq`) 자동 생성
- [ ] `vault.patient_identity` 테이블에 INSERT — 암호화된 개인정보 저장
- [ ] `clinical.case_record` 테이블에 INSERT — `registration_id` 자동 생성 (`clinical.next_registration_id`)
- [ ] `hospital_code`가 JWT 세션에서 정확히 추출
- [ ] `birth_date` 암호화 (`crypto.encrypt_text`) 및 해시 (`crypto.birth_ymd_hash`)
- [ ] `phone` 미입력 시 NULL 처리 (NOT NULL 제약 위반 없음)
- [ ] `local_mrn` 미입력 시 NULL 처리
- [ ] 응답: `{ patient_id, case_id, registration_id, current_step }`

### 3.5 환자 삭제
- [ ] 삭제 버튼 클릭 → 확인 모달 표시
- [ ] 확인 → `DELETE /api/patients/{caseId}` 호출
- [ ] 소프트 삭제: `case_status = 'ARCHIVED'` 설정 (물리 삭제 아님)
- [ ] 잠긴 케이스 삭제 시도 → 403 에러 ("잠긴 케이스는 삭제할 수 없습니다")
- [ ] 삭제 후 목록 갱신

### 3.6 PROM 알림톡 발송
- [ ] 발송 버튼 클릭 → 시점 선택 UI
- [ ] `POST /api/patients/{caseId}/prom-alimtalk` 호출
- [ ] 요청 본문: `{ timepoint_code, expires_in_days?, remarks? }`
- [ ] `survey.prom_request` 테이블에 INSERT
- [ ] `messaging.message_outbox` 테이블에 INSERT (아웃박스 패턴)
- [ ] 환자 연락처 없을 시 → 에러 "환자 연락처가 없어 알림톡을 발송할 수 없습니다."
- [ ] 발송 성공 후 목록의 PROM 상태 배지 업데이트

### 3.7 환자 잠금/해제
- [ ] 잠금 토글 → `PATCH /api/patients/{caseId}/lock`
- [ ] 잠금 설정: `is_locked=true`, `locked_at`, `locked_by` 기록
- [ ] 해제: PI/ADMIN 이상 권한 필요
- [ ] 잠긴 케이스의 임상 데이터 수정 불가

### 3.8 최근 추적 관찰 위젯
- [ ] `GET /api/dashboard/recent-followups` 호출
- [ ] 최근 PROM 제출 항목 표시 (환자명, 상태, 날짜)

### 3.9 데모 모드
- [ ] 토큰 없을 때 5건의 하드코딩 데모 환자 표시
- [ ] 데모 환자 등록 → 로컬 state에만 추가 (API 호출 없음)
- [ ] 데모 환자 삭제 → 로컬 state에서만 제거

---

## 4. 수술 입력 페이지 (`/surgery-entry`)

### 4.1 데이터 로드
- [ ] URL 파라미터에서 `caseId` 추출
- [ ] `GET /api/patients/{caseId}` 호출 → 기존 데이터 로드
- [ ] 기존 데이터가 있으면 폼에 프리필

### 4.2 기본 정보 섹션
- [ ] 환자 ID 입력 필드 (`data-field="patientId"`)
- [ ] 수술일 날짜 선택기 — `max="9999-12-31"` 제한
- [ ] 집도의 이름 입력
- [ ] ASA 분류 선택 (Class I–IV)
- [ ] 빈 환자 ID 제출 → 에러 표시 + 스크롤
- [ ] 빈 수술일 제출 → 에러 표시 + 스크롤

### 4.3 진단 정보 섹션
- [ ] 주진단 드롭다운 (HNP, Stenosis, Spondylolisthesis 등 6개)
- [ ] 진단 레벨 입력 (L4-5, L5-S1 등)
- [ ] 척수병증 유무 (예/아니오)
- [ ] 동반질환 체크박스 (당뇨, 심혈관, 신경, 우울/불안, 이전 수술)

### 4.4 수술 정보 섹션
- [ ] 수술 방법 드롭다운 (6개 코드: P001, P002, P003, UBE, FULL_ENDO, SPINOSCOPY)
- [ ] 접근법 라디오 (Full-endo, UBE, Biportal, Open)
- [ ] 편측성 입력
- [ ] 수술 레벨 수 입력
- [ ] 수술 시간(분) 입력 — `ge=0` 유효성
- [ ] 출혈량(ml) 입력 — `ge=0` 유효성
- [ ] 재원 일수 입력 — `ge=0` 유효성
- [ ] 마취 유형 드롭다운
- [ ] 임플란트 사용 여부 체크박스 (cage, screw)
- [ ] 집도의 경력(년) 입력
- [ ] 항생제 예방적 투여 여부

### 4.5 내시경 전용 필드
- [ ] 내시경 기술 드롭다운
- [ ] 내시경 장비 드롭다운 (Joimax, RIWOspine, Stryker, Endovision)
- [ ] 스코프 각도 입력
- [ ] 시야 품질 입력
- [ ] 개복 전환 여부

### 4.6 합병증 & 결과 섹션
- [ ] 술중 합병증 유무 (예/아니오)
- [ ] 합병증 유형 드롭다운 (경막파열, 신경손상, 혈관손상, 기타)
- [ ] 합병증 발생일 날짜 선택기 — `max="9999-12-31"` 제한
- [ ] 재수술 유무 토글
- [ ] 재수술일 날짜 선택기 — `max="9999-12-31"` 제한 (비활성 시 disabled)
- [ ] 재수술 사유 드롭다운
- [ ] 30일 내 재입원 유무
- [ ] 추적관찰 시점 체크박스 (Pre-op, 1M, 3M, 6M, 12M, 24M)

### 4.7 데이터 저장 — 백엔드
- [ ] `PATCH /api/patients/{caseId}/clinical` 호출
- [ ] `clinical.case_record` 업데이트: `diagnosis_code`, `procedure_code`, `spinal_region`, `surgery_date`
- [ ] `clinical.case_initial_form` UPSERT: 동반질환, 진단상세
- [ ] `clinical.case_extended_form` UPSERT: 수술시간, 출혈량, 접근법 등
- [ ] `additional_attributes` JSONB 병합 (기존 값 유지 + 새 값 추가)
- [ ] `PATCH /api/patients/{caseId}/outcomes` 호출 (합병증/결과 데이터)
- [ ] `clinical.case_outcome_form` UPSERT: 합병증, 재수술, 재입원
- [ ] 잠긴 케이스 수정 시도 → 에러 응답
- [ ] 성공 시 "저장 완료" 메시지

### 4.8 데모 모드
- [ ] 토큰 없을 때 → "데모 모드에서는 저장할 수 없습니다." 에러

---

## 5. 통계 분석 페이지 (`/analysis`)

### 5.1 UI 렌더링
- [ ] 기간 필터 드롭다운 (전체, 1년, 6개월, 3개월)
- [ ] 핵심 지표 카드 4개: VAS 개선율, ODI 개선율, 환자 만족도, 재수술/합병증률
- [ ] 회복 추이 꺾은선 차트 (VAS back, VAS leg, ODI, EQ-5D × 5시점)
- [ ] 환자 만족도 레이더 차트 (5단계)
- [ ] 접근법 비교 막대 차트 (수술시간, 출혈량, 재원일수, 합병증률)
- [ ] 환자 결과 산점도 (나이 vs 개선율)
- [ ] 최근 환자 결과 테이블

### 5.2 데이터 정합성
- [ ] VAS 개선율 — PROM 제출 데이터 기반 계산 정확
- [ ] ODI 개선율 — PROM 제출 데이터 기반 계산 정확
- [ ] 접근법 비교 데이터 — `case_extended_form.approach_type` 기반
- [ ] 환자 나이 계산 — `patient.birth_year` vs `case_record.visit_date`
- [ ] 기간 필터 적용 시 데이터 변경 확인

### 5.3 백엔드 검증
- [ ] `GET /api/dashboard/statistics` — 응답 구조 확인
- [ ] 접근법별 비교 데이터 정확성
- [ ] 만족도 점수 분포 정확성
- [ ] 환자별 결과 데이터 (나이, VAS 전/후, 개선율, 만족도)

### 5.4 데모 모드
- [ ] 토큰 없을 때 하드코딩된 통계 데이터 표시
- [ ] 모든 차트 정상 렌더링

---

## 6. 보고서/내보내기 페이지 (`/reports`)

### 6.1 UI 렌더링
- [ ] 날짜 범위 선택기 (시작일, 종료일) — `max="9999-12-31"` 제한
- [ ] 날짜 선택기 토글 버튼
- [ ] CSV 다운로드 버튼
- [ ] 요약 카드 4개: 총 수술, 성공률, 합병증률, 평균 재원일수
- [ ] 월별 추이 막대 차트 (수술 vs 합병증)
- [ ] 접근법별 결과 비교 차트
- [ ] 월별 상세 테이블

### 6.2 보고서 데이터
- [ ] `GET /api/reports?date_from=...&date_to=...` 호출
- [ ] 날짜 범위 필터 적용 시 데이터 변경 확인
- [ ] 요약 카드 수치가 테이블 합계와 일치
- [ ] 월별 데이터 정렬 (최신순 or 시간순)

### 6.3 CSV 다운로드
- [ ] 다운로드 버튼 클릭 → 파일 다운로드 시작
- [ ] `GET /api/reports/download?date_from=...&date_to=...` 호출
- [ ] 다운로드된 CSV 파일 — 헤더 행 포함
- [ ] CSV 컬럼: 환자ID, 수술일, 진단코드, 수술코드, 접근법, 합병증 등
- [ ] 한글 인코딩 정상 (UTF-8 BOM)
- [ ] 날짜 범위 필터 반영

### 6.4 백엔드 검증
- [ ] `GET /api/reports` — JSON 응답 구조 확인
- [ ] `GET /api/reports/download` — Content-Type: `text/csv`
- [ ] 날짜 필터 SQL 쿼리 정확성
- [ ] RLS 정책: 자기 병원 데이터만 포함

### 6.5 데모 모드
- [ ] 토큰 없을 때 하드코딩된 보고서 데이터 표시
- [ ] CSV 다운로드 비활성 또는 데모 데이터 다운로드

---

## 7. 프로필 페이지 (`/profile`)

### 7.1 기본 정보 탭
- [ ] 프로필 아바타 (이니셜) 표시
- [ ] 이름, 병원, 부서, 역할, 전문분야, 면허번호 — 읽기 전용
- [ ] 이메일 입력 — 수정 가능
- [ ] 전화번호 입력 — 수정 가능
- [ ] 저장 버튼 클릭 → `PUT /api/auth/me/info` 호출
- [ ] 저장 성공 → 성공 메시지 표시
- [ ] 저장 실패 → 에러 메시지 표시

### 7.2 비밀번호 변경 탭
- [ ] 현재 비밀번호 입력 (보기/숨기기 토글)
- [ ] 새 비밀번호 입력 (보기/숨기기 토글)
- [ ] 비밀번호 확인 입력 (보기/숨기기 토글)
- [ ] 비밀번호 강도 표시기 (4단계 바)
- [ ] 새 비밀번호 !== 확인 → 에러 메시지
- [ ] 비밀번호 정규식 유효성: `^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,128}$`
- [ ] `PUT /api/auth/password` 호출: `{ current_password, new_password, new_password_confirm }`
- [ ] 현재 비밀번호 틀림 → 에러 메시지
- [ ] 변경 성공 → 성공 메시지 + 로그아웃 유도 (선택)

### 7.3 백엔드 검증
- [ ] `GET /api/auth/me` — 유저 프로필 반환
- [ ] `PUT /api/auth/me/info` — 이메일/전화번호만 업데이트
- [ ] `PUT /api/auth/password` — argon2id 해시 검증 + 새 해시 저장
- [ ] `auth.user_account` 테이블 업데이트 확인
- [ ] `last_password_changed_at` 타임스탬프 갱신

---

## 8. 환자 설문 — 환영 페이지 (`/patient-survey`)

### 8.1 UI 렌더링
- [ ] 로고 및 제목 표시 ("척추 수술 후 관리 포털")
- [ ] 환영 메시지 및 설문 목적 설명
- [ ] "설문 시작하기" 버튼 표시

### 8.2 토큰 유효성 확인
- [ ] URL의 `tokenUuid` 파라미터로 `GET /api/survey/{tokenUuid}/status` 호출
- [ ] 유효한 토큰 → 설문 시작 가능
- [ ] 만료된 토큰 → "설문 기간이 만료되었습니다" 에러 표시
- [ ] 이미 제출된 토큰 → "이미 제출된 설문입니다" 에러 표시
- [ ] 존재하지 않는 토큰 → 에러 표시

### 8.3 본인 인증 단계
- [ ] 인증 방법 선택: 생년월일(8자리) 또는 전화번호 뒷4자리
- [ ] 생년월일 입력 필드 (YYYYMMDD)
- [ ] 전화번호 뒷4자리 입력 필드
- [ ] `POST /api/survey/{tokenUuid}/verify` 호출: `{ method_code, value }`
- [ ] 인증 성공 → `survey_token` (JWT) 발급 → 설문 페이지로 이동
- [ ] 인증 실패 → 에러 메시지
- [ ] 뒤로가기 버튼 → 환영 화면으로 복귀
- [ ] `vault.patient_identity`의 `birth_ymd_sha256` 또는 `phone_last4_sha256`로 해시 비교

---

## 9. 환자 설문 — 질문 페이지 (`/patient-survey/questions`)

### 9.1 UI 렌더링
- [ ] 모바일 프레임(MobileFrame) 래퍼 적용
- [ ] 진행률 바 표시 (현재 질문 / 전체 질문 수)
- [ ] VAS 슬라이더 질문 렌더링 (0-10 범위)
- [ ] 객관식 질문 렌더링 (라디오 버튼)
- [ ] 이전/다음 네비게이션 버튼

### 9.2 설문 데이터
- [ ] `GET /api/survey/{tokenUuid}/questions?jwt={surveyToken}` 호출
- [ ] 환자명, 담당의, 시점 라벨 표시
- [ ] 질문 목록 동적 로딩
- [ ] 정적 질문 폴백 (API 실패 시)
- [ ] VAS 슬라이더 값 변경 → 라벨 피드백 표시 ("통증 없음" ~ "최악의 통증")
- [ ] 모든 질문 응답 후 제출 버튼 활성화

### 9.3 설문 제출
- [ ] `POST /api/survey/{tokenUuid}/submit` 호출
- [ ] 요청 본문: `{ answers: { question_id: value, ... } }`
- [ ] `survey.prom_submission` 테이블에 INSERT
- [ ] `survey.prom_request.token_status` → `'SUBMITTED'` 업데이트
- [ ] 제출 성공 → 완료 페이지(`/patient-survey/complete`)로 이동
- [ ] 제출 실패 → 에러 메시지 + 재시도 가능
- [ ] 중복 제출 방지

### 9.4 드래프트 저장
- [ ] `PATCH /api/survey/{tokenUuid}/save` — 중간 저장 (현재 미사용)

---

## 10. 환자 설문 — 완료 페이지 (`/patient-survey/complete`)

### 10.1 UI 렌더링
- [ ] 성공 아이콘 표시
- [ ] 완료 확인 메시지
- [ ] 다음 설문 안내 정보 박스
- [ ] "처음으로 돌아가기" 버튼
- [ ] 하단 연락처 정보 표시

---

## 11. 공통 검증 사항 (Cross-cutting Concerns)

### 11.1 인증 & 세션
- [ ] 모든 보호 라우트 — 토큰 없으면 로그인 페이지로 리다이렉트
- [ ] JWT 만료(60분) 후 → 401 응답 → 재로그인 필요
- [ ] `Authorization: Bearer {token}` 헤더 정상 전송
- [ ] 로그아웃 → `POST /api/auth/logout` → 세션 무효화
- [ ] 로그아웃 → localStorage에서 `ksor_token`, `ksor_user` 제거
- [ ] JWT 리프레시 토큰(30일) 동작 여부 (현재 미구현)

### 11.2 RLS (Row-Level Security)
- [ ] `patient.patient` — 자기 병원 환자만 조회/수정
- [ ] `vault.patient_identity` — 자기 병원 환자 PII만 접근
- [ ] `clinical.case_record` — 자기 병원 케이스만 조회/수정
- [ ] `audit.change_log` — 자기 병원 로그만 조회
- [ ] ADMIN 역할은 모든 병원 데이터 접근 가능

### 11.3 데이터 암호화
- [ ] `vault.patient_identity.birth_date_enc` — Fernet 암호화 저장
- [ ] `vault.patient_identity.phone_enc` — Fernet 암호화 저장
- [ ] `vault.patient_identity.local_mrn_enc` — Fernet 암호화 저장
- [ ] SHA-256 해시: `birth_ymd_sha256`, `phone_sha256`, `phone_last4_sha256`, `local_mrn_sha256`
- [ ] 복호화 가능 여부 (Fernet 키 일관성)

### 11.4 감사 로그
- [ ] 모든 테이블 INSERT/UPDATE/DELETE → `audit.change_log`에 기록
- [ ] `tg_audit_row_change` 트리거 동작 확인
- [ ] 민감 컬럼 (password_hash, *_enc) 로그에서 삭제 (`redact_jsonb`)
- [ ] `tg_stamp` 트리거 — `created_at`, `updated_at`, `created_by`, `updated_by` 자동 설정

### 11.5 에러 처리
- [ ] `ForeignKeyViolation` → 400 ("참조 데이터가 존재하지 않습니다")
- [ ] `UniqueViolation` → 409 ("이미 존재하는 데이터입니다")
- [ ] `CheckViolation` → 400 ("데이터 제약 조건 위반")
- [ ] `NotNullViolation` → 400 ("필수 항목이 누락되었습니다")
- [ ] `InsufficientPrivilege` → 403 ("데이터 접근 권한이 없습니다")
- [ ] `RequestValidationError` → 422 ("요청 값 검증에 실패했습니다")
- [ ] 미처리 DB 에러 → 500 (상세 메시지 + 서버 로깅)

### 11.6 DB 스키마 vs 실제 DB 정합성
- [ ] `patient.patient.patient_id` — 스키마: `uuid`, 실제 DB: `varchar(20)` + 시퀀스 ⚠️ **불일치**
- [ ] `vault.patient_identity.patient_id` — 실제 DB: `varchar(20)` ⚠️ **스키마와 불일치**
- [ ] `clinical.case_record.patient_id` — 실제 DB: `varchar(20)` ⚠️ **스키마와 불일치**
- [ ] 모든 `case_id` 컬럼 — 실제 DB: `uuid` ✅ 일치
- [ ] 모든 `hospital_code` 컬럼 — 실제 DB: `varchar(20)` ✅ 일치
- [ ] `tg_stamp` 트리거 — `auth.auth_session` 테이블에 `hospital_code` 컬럼 없음 ⚠️ 잠재 오류

### 11.7 입력값 제한
- [ ] 모든 `type="date"` 입력 — `max="9999-12-31"` (연도 4자리 제한)
- [ ] `patient_initial` — `maxLength={20}` (varchar(20) 대응)
- [ ] Pydantic 모델: `birth_year` — `ge=1900, le=2100`
- [ ] Pydantic 모델: `patient_initial` — `min_length=1, max_length=20`
- [ ] Pydantic 모델: `operation_minutes`, `estimated_blood_loss_ml` — `ge=0`

### 11.8 트랜잭션 관리
- [ ] `create_patient_case` — 3개 INSERT (patient → identity → case_record) 원자적 실행
- [ ] 중간 실패 시 전체 롤백 확인
- [ ] `psycopg_pool.connection()` 정상 종료 시 자동 커밋
- [ ] 예외 발생 시 자동 롤백

---

## 12. 알려진 주요 이슈 & TODO

| # | 구분 | 내용 | 심각도 |
|---|------|------|--------|
| 1 | DB 스키마 | `patient_id`가 스키마 SQL(`uuid`)과 실제 DB(`varchar(20)`)가 불일치 | 🔴 높음 |
| 2 | 트리거 | `tg_stamp`가 `auth.auth_session`에서 `hospital_code` 참조 — 컬럼 미존재 | 🟡 중간 |
| 3 | 인증 | JWT 자동 리프레시 미구현 — 60분 후 재로그인 필요 | 🟡 중간 |
| 4 | 설문 | 전화번호 인증 백엔드 미완성 | 🟡 중간 |
| 5 | 내보내기 | PDF 생성 미구현 (라우트명 `/pdf`이지만 CSV 반환) | 🟢 낮음 |
| 6 | 통계 | 일부 차트에서 백엔드 엔드포인트 미정의 (데모 데이터 사용) | 🟡 중간 |
| 7 | 알림 | AlimTalk 실패 시 UI 토스트 미표시 | 🟢 낮음 |
| 8 | 벤치마크 | `GET /api/dashboard/benchmark` 엔드포인트 존재하나 UI 미사용 | 🟢 낮음 |
