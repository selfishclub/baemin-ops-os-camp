@echo off
chcp 65001 >nul
title 해모닉 업무 체크리스트
cd /d "%~dp0"
set PORT=8777

rem 이미 켜져 있으면 창만 다시 엽니다
netstat -ano | findstr /r /c:"127.0.0.1:%PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  start "" "http://localhost:%PORT%/index.html"
  exit /b
)

where py >nul 2>&1
if not errorlevel 1 (
  set "RUN=py -3"
  goto serve
)
where python >nul 2>&1
if not errorlevel 1 (
  set "RUN=python"
  goto serve
)
goto direct

:serve
echo 해모닉 업무 체크리스트를 시작합니다...
echo.
echo 이 검은 창은 그대로 두세요. 닫으면 앱이 꺼집니다.
start "" "http://localhost:%PORT%/index.html"
%RUN% -m http.server %PORT% --bind 127.0.0.1
goto :eof

:direct
echo 파이썬이 없어 파일을 직접 엽니다.
echo.
echo 이 방식도 대부분 정상 동작합니다. 다만 앱 위쪽에 빨간 경고가 뜨면
echo 저장이 막힌 것이니 크롬이나 엣지로 열어 주세요.
start "" "index.html"
timeout /t 6 >nul
