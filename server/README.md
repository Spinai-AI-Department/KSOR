# KSOR FastAPI Server

이 프로젝트는 업로드하신 `ksor_schema.sql` 스키마를 그대로 사용하도록 맞춘 FastAPI 서버입니다.

## 포함 범위
- 폐쇄형 로그인 / JWT access + DB refresh session
- 기관 단위 데이터 격리(RLS 컨텍스트 연동)
- 환자 등록 / 임상 입력 / 잠금 / 메모
- PROM 알림톡 요청 / 모바일 설문 / 임시저장 / 제출
- 감사 로그 / API 요청 로그 / 로그인 이벤트 / 보안 이벤트
- 관리자 회원 관리
- 통계 대시보드 API
- CSV 다운로드 / 전체 반출 승인 요청
- 아웃박스 워커(수평확장 대응)
- Fernet 컬럼 암호화 + SHA-256 해시 검색

## 실행 순서
1. PostgreSQL에 `ksor_schema.sql` 실행
2. `ksor_bootstrap_template.sql`의 초기 관리자 해시를 채운 뒤 실행
3. Python 가상환경 생성 후 `pip install -r requirements.txt`
4. `.env.example`을 `.env`로 복사 후 값 수정
5. API 실행:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
   ```
6. 아웃박스 워커 실행:
   ```bash
   python -m app.workers.outbox_dispatcher
   ```

## 수평확장 포인트
- API는 무상태(stateless)입니다. sticky session이 필요 없습니다.
- refresh session, idempotency, outbox lease, 감사 로그는 PostgreSQL에 저장됩니다.
- 여러 API 노드와 여러 워커 노드가 동시에 동작할 수 있습니다.
- 메시지 dispatch는 `FOR UPDATE SKIP LOCKED` + lease token을 사용합니다.

## 1만 동시 접속 관련 주의
코드는 비동기 I/O, 다중 Uvicorn worker, DB pool, 수평확장 아웃박스 구조를 사용하지만,
**실제 1만 동시 접속 수용 여부는 서버 대수, CPU/RAM, 네트워크, PostgreSQL 튜닝, Nginx, 알림톡 벤더 지연시간, OS 한계**에 따라 달라집니다.
반드시 k6/JMeter/Gatling 같은 부하 테스트로 검증해야 합니다.

## Windows 배포 팁
- API 인스턴스를 여러 개 띄우고 Nginx for Windows에서 reverse proxy / load balancing
- Uvicorn worker 수는 CPU 코어/메모리를 기준으로 조절
- 워커는 별도 프로세스로 분리 실행
- 백업은 pg_dump + 작업 스케줄러 사용

## 설문 문항
스키마에는 `ref.prom_question_bank`가 있으며, 기본 시드 스크립트는 `app/scripts/seed_prom_questions.py` 입니다.
ODI/NDI/EQ-5D 원문은 기관 표준 문구로 최종 검토 후 넣어야 합니다.
