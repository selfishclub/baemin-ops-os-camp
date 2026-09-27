#!/bin/bash
# content.md → content.js 로 바꿉니다. (내용을 고친 뒤 한 번 실행)
# 사용: bash make-content.sh
cd "$(dirname "$0")"
{
  printf '/* 자동 생성 파일. 내용은 content.md 를 고치고 make-content.sh 를 실행하세요. */\n'
  printf 'window.BOOK_MD = `'
  sed -e 's/\\/\\\\/g' -e 's/`/\\`/g' -e 's/\${/\\${/g' content.md
  printf '`;\n'
} > content.js
echo "content.js 생성 완료 ($(wc -l < content.md) 줄)"
