# MiniMall 운영 자동화 실습 — 7강 스타터 (수업용 가상 예시)

AI 활용 소프트웨어 공학 7강 "AI 기반 MLOps 및 운영자동화" 미니 프로젝트용 프로젝트입니다. Node.js 20 이상이면 되고 설치할 패키지는 없습니다(`npm install` 불필요).

## 빠른 시작
```bash
node --version            # v20 이상
npm run eval:ai           # AI 가 만든 산출물(ai_ops/)의 점수 — Mission 0 에서 측정
npm run eval              # 우리 팀 산출물의 점수
npm run retrain -- --scenario shift     # 재학습 → 평가 → 승격 판단 → 레지스트리
npm run runbook           # 런북 완결성 점검
npm run ops-ci            # 운영 품질 게이트 (Mission 5 에서 완성)
```

## 폴더
| 경로 | 설명 | 수정 |
|---|---|---|
| `docs/OPS_CONTRACT.md` | **기준 문서** — 규칙 · 인터페이스 · 점수 방식 | × |
| `pipeline/` `monitoring/` `mlops/` `deploy/` | 학생이 완성하는 4개 모듈 | ○ |
| `ops/runbook.json` | 런북 | ○ |
| `ai_ops/` | AI 가 만들었다고 가정한 산출물 4종 (리뷰 대상) | × |
| `incidents/INC-1~3` | 장애 분석용 번들 (로그 · 지표 · 배포 기록) | × |
| `changes/` `config/` `lib/` `sim/` `src/` | 변경 샘플 · SLO · 도우미 · 시뮬레이터 · 서비스 코드 | × |
| `scripts/` | 평가 · 점검 도구 (`ops-ci.js` 만 수정) | ops-ci.js |
| `docs/` 나머지 | 설계 · 리뷰 · 보고 양식 | ○ |

문제지(Word)의 미션 순서대로 진행하세요.
