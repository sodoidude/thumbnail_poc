# 프로젝트 구조

작성일: 2026-02-10.

## 최상위

- `app/` - Next.js App Router 진입점. 페이지, 레이아웃, UI 컴포넌트.
- `lib/` - 공용 애플리케이션 로직과 유틸리티.
- `prisma/` - Prisma 스키마, 마이그레이션, DB 관련 산출물.
- `public/` - Next.js가 제공하는 정적 자산.
- `docs/` - 프로젝트 문서(이 파일).
- `dev.db`, `prisma/dev.db` - 로컬 SQLite 데이터베이스.
- 설정/도구: `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `prisma.config.ts`, `package.json`, `package-lock.json`.
- 환경 파일: `.env`, `.env.local`.

## 앱 디렉토리 (`app/`)

- `app/layout.tsx` - 루트 레이아웃.
- `app/page.tsx` - 홈 페이지.
- `app/globals.css` - 전역 스타일.
- `app/favicon.ico` - 파비콘.
- `app/admin/page.tsx` - 관리자 페이지.
- `app/components/SettingsModal.tsx` - UI 컴포넌트.
- `app/api/` - API 라우트 그룹(현재 비어 있음).

## 라이브러리 (`lib/`)

- `lib/prisma.ts` - Prisma 클라이언트 설정.
- `lib/modelRegistry.ts` - 모델 레지스트리 로직.
- `lib/costing.ts` - 비용 계산 유틸리티.

## Prisma (`prisma/`)

- `prisma/schema.prisma` - Prisma 스키마.
- `prisma/migrations/` - 마이그레이션 이력.
- `prisma/migrations/migration_lock.toml` - 마이그레이션 잠금 파일.

## 공개 자산 (`public/`)

- `public/*.svg` - 정적 SVG 자산.

## 비고

- `.next/`, `node_modules/`는 빌드 및 의존성 산출물이라 위 목록에서 제외했음.
