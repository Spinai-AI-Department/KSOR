#!/bin/bash
set -e

echo "=== KSOR 개발 환경 초기화 ==="

# --- 프론트엔드 ---
echo ""
echo "[1/3] 프론트엔드 의존성 설치 (web/)"
cd web
npm install

# .env.local이 없으면 기본값으로 생성
if [ ! -f .env.local ]; then
  echo "VITE_API_BASE_URL=http://localhost:8000" > .env.local
  echo "  → web/.env.local 생성 (VITE_API_BASE_URL=http://localhost:8000)"
fi

cd ..

# --- 백엔드 ---
echo ""
echo "[2/3] 백엔드 의존성 설치 (server/)"
cd server

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "  → server/.env.example → server/.env 복사. 값을 실제 환경에 맞게 수정하세요."
  else
    echo "  ⚠️  server/.env.example이 없습니다. 수동으로 server/.env를 생성하세요."
  fi
fi

pip install -r requirements.txt

cd ..

# --- 안내 ---
echo ""
echo "[3/3] 실행 명령 안내"
echo ""
echo "  프론트엔드 개발 서버:"
echo "    cd web && npm run dev"
echo ""
echo "  백엔드 서버:"
echo "    cd server && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
echo ""
echo "  AlimTalk 아웃박스 워커 (별도 터미널):"
echo "    cd server && python -m app.workers.outbox_dispatcher"
echo ""
echo "=== 초기화 완료 ==="
