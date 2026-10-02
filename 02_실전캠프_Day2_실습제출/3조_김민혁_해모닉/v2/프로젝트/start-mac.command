#!/bin/bash
# 해모닉 업무 체크리스트 — 더블클릭으로 실행합니다.
cd "$(dirname "$0")"
PORT=8777
if curl -s -o /dev/null "http://localhost:$PORT"; then
  open "http://localhost:$PORT"
  exit 0
fi
echo "해모닉 업무 체크리스트를 시작합니다..."
echo "이 검은 창은 그대로 두세요. 닫으면 앱이 꺼집니다."
python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
sleep 1
open "http://localhost:$PORT"
trap "kill $SRV 2>/dev/null" EXIT
wait $SRV
