# CI_GUIDE — 파이프라인을 실제 CI 서비스에 옮기면 (참고)

이 실습의 `pipeline.config.js` 는 "단계 → 게이트" 구조입니다. GitHub Actions 같은 서비스에서는 단계가 job 이 됩니다.

```yaml
name: pipeline
on: [pull_request]
jobs:
  validate:   { runs-on: ubuntu-latest, steps: [ { uses: actions/checkout@v4 }, { run: "node scripts/secret-scan.js" } ] }
  test:       { needs: validate, runs-on: ubuntu-latest, steps: [ { uses: actions/checkout@v4 }, { run: "npm test" }, { run: "npm run mutate" } ] }
  model-eval: { needs: test,     runs-on: ubuntu-latest, steps: [ { uses: actions/checkout@v4 }, { run: "node scripts/retrain.js --scenario normal" } ] }
  build:      { needs: model-eval, runs-on: ubuntu-latest, steps: [ { uses: actions/checkout@v4 }, { run: "docker build ." } ] }
  staging:    { needs: build, runs-on: ubuntu-latest, environment: staging, steps: [ { run: "./deploy.sh staging && ./smoke.sh" } ] }
  production: { needs: staging, environment: production, runs-on: ubuntu-latest, steps: [ { run: "./canary.sh" } ] }  # 승인 · 점진 배포
```
- `needs` 가 "앞 단계가 실패하면 뒤 단계는 실행하지 않는다"를 만든다. 그 단계에서 막지 못한 문제는 다음 단계의 비용으로 돌아온다.
- 운영 환경(`production`)에는 사람의 승인과 자동 롤백 조건을 붙인다.
- 위 YAML 은 형식을 보여 주는 예시이며 실제로 실행되지 않는다(스크립트 일부는 가상).
