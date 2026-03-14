# GitHub Actions – Webapp CI & Security

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **webapp-ci.yml** | Push/PR to `main` or `master` (webapp paths) | Build, lint, **SonarCloud** scan |
| **webapp-security-zap.yml** | Push/PR to `main` or `master` (webapp paths), or **manual** (workflow_dispatch) | **OWASP ZAP** baseline scan, upload HTML/JSON/MD reports |

## SonarCloud

- **Org:** [shreyasicon](https://sonarcloud.io/organizations/shreyasicon/projects)  
- **Project key:** `image-2-txt-api` (set in `webapp/scalable/sonar-project.properties`).
- **GitHub secret:** `SONAR_KEY` = SonarCloud token (SonarCloud → My Account → Security → Generate Tokens).

Pushes and PRs that touch `webapp/scalable/` run the CI workflow and SonarCloud analysis.

## OWASP ZAP

The ZAP workflow builds the webapp, serves it with nginx in a container, runs a ZAP baseline scan against it, and uploads reports as artifacts.

- **Artifacts:** After the run, open the job → **Artifacts** and download:
  - `zap-owasp-report` (HTML)
  - `zap-owasp-report-json` (JSON)
  - `zap-owasp-report-md` (Markdown)
- **Optional:** To fail the job when ZAP finds issues, remove the `-I` flag from the `zap-baseline.py` command in **webapp-security-zap.yml**.

## Optional: package-lock.json

For faster and more reliable installs, commit a lockfile:

```bash
cd webapp/scalable && npm install && git add package-lock.json && git commit -m "Add package-lock.json"
```

If `package-lock.json` is missing, the workflows use `npm install` instead of `npm ci`.
