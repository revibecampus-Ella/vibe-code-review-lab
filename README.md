# Vibe Code Review Lab

공개 GitHub Repository와 선택 입력한 배포 URL을 바탕으로 프로젝트를 읽기 전용으로 진단하는 반응형 웹 애플리케이션입니다.

## 주요 기능

- 공개 Repository 키워드 검색 및 Star 높은 순 정렬
- 검색 결과를 유지하고 Repo를 한 개씩 독립 진단
- README와 주요 설정·소스·테스트 파일 읽기
- 코드 구조, 오류 가능성, 보안 위험 신호, 테스트 상태 진단
- 배포 URL이 있을 때만 UI·UX 진단
- 확인됨·추정됨·확인 필요 구분
- 종합결론, 분야별 판단, 다음 행동 제시
- 보고서 복사, Markdown 복사, 인쇄 및 PDF 저장

## 보안 보완 사항

- `.env`, `.env.local`, `.env.production` 등을 전체 파일 목록에서 탐지
- 로컬·사설 IP·메타데이터 주소에 대한 서버 요청 차단
- 배포 URL의 리디렉션 목적지를 단계마다 다시 검증
- 화면 응답 수집을 최대 500KB와 제한 시간 8초로 제한
- 만료된 검색 캐시 자동 정리
- 인메모리 검색 캐시를 최대 100개로 제한

## 서비스 원칙

이 프로젝트는 공개 데이터를 읽기 전용으로 조회합니다. Fork, Commit, Push, PR 생성, 코드 수정, 패키지 설치, 자동 테스트, 데이터베이스 변경 및 운영 환경변수 조회를 수행하지 않습니다.

분석 결과는 다음처럼 구분합니다.

- **확인됨:** 코드 또는 화면에서 직접 확인
- **추정됨:** 확인한 구조와 흐름을 근거로 판단
- **확인 필요:** 실행 환경이나 추가 권한이 필요

## 기술 구성

- TypeScript
- React
- Vinext/Vite
- GitHub REST API
- Cloudflare Worker 호환 서버 라우트

## 주요 폴더

```text
app/
├── api/
│   ├── analyze/        # 선택한 Repository 진단
│   └── search-repos/   # 공개 Repository 검색
├── globals.css         # 반응형 화면 디자인
├── layout.tsx
└── page.tsx            # 입력·검색·진단 결과 화면
```

## 로컬 실행

Node.js 22 이상이 필요합니다.

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run build
```

## 공개 배포 화면

[Vibe Code Review Lab](https://vibe-code-review-lab.soomikim.chatgpt.site)

## 주의사항

- GitHub 공개 API의 요청 한도가 적용됩니다.
- `raw.githubusercontent.com`은 검색이 아니라 선택한 Repository 파일의 원문 조회에 사용합니다.
- 실제 빌드와 테스트를 실행하지 않으므로 테스트 통과나 운영 배포 가능 여부를 확정하지 않습니다.
- 배포 URL이 없거나 화면을 읽지 못하면 UI·UX 결과를 생성하지 않습니다.

