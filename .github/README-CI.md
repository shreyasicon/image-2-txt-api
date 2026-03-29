# GitHub Actions – Webapp CI & Security

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **webapp-ci.yml** | Push/PR to `main` or `master` (webapp paths) | Build, lint, **SonarCloud** scan |
| **webapp-ci.yml** (`zap-scan` job) | Same triggers as above | **OWASP ZAP** baseline scan, **artifacts** `zap-owasp-reports` |

## SonarCloud

- **Project:** [shreyasicon_image-2-txt-api](https://sonarcloud.io/project/overview?id=shreyasicon_image-2-txt-api)
- **GitHub secret:** `SONAR_TOKEN` = SonarCloud token (SonarCloud → My Account → Security → Generate Tokens).
- **Required:** In SonarCloud go to **Project Settings → Analysis Method** and **disable "Automatic Analysis"**. The workflow uses CI analysis (GitHub Action); having both enabled causes: *"You are running CI analysis while Automatic Analysis is enabled"*.

Pushes and PRs that touch `webapp/scalable/` run the CI workflow and SonarCloud analysis.

## OWASP ZAP

The **zap-scan** job in **webapp-ci.yml** builds the static site, serves it with **nginx** on `127.0.0.1:8080`, runs **ZAP baseline** via **`ghcr.io/zaproxy/zaproxy:stable`** (not the deprecated `owasp/zap2docker-stable` image), with `--network host` (reliable reachability). **Do not use `--autooff` in Docker:** the baseline script only writes HTML/JSON/MD via the **Automation Framework** path when running inside the ZAP container; `--autooff` skips AF and never reaches report generation.

- **Nginx for ZAP:** `.github/nginx-zap.conf` adds `try_files` for the Next.js export (fewer 404s), plus `favicon.ico` / `robots.txt` responses so probes do not return 404.
- **Baseline rules:** `.github/zap-baseline.conf` is passed as `-c` to `zap-baseline.py`. Each non-comment line must have **three tab-separated fields** (`pluginId`, `IGNORE`/`WARN`/…, comment text); two columns will fail to parse and the scan will exit without writing reports. This file **IGNORE**s CI noise: **50003** (stats), **10116** (ZAP out of date), **10109** (modern web app), **100000** (httpsender HTTP error codes). Adjust if you need stricter findings.
- **Artifacts:** Open the workflow run → **zap-scan** job → **Artifacts** → download **`zap-owasp-reports`** (zip containing `zap-report.html`, `zap-report.json`, `zap-report.md`). If ZAP did not write a file, a small placeholder is added so the artifact always downloads.
- **Optional:** To fail the job when ZAP finds issues, remove the `-I` flag from `zap-baseline.py` in **webapp-ci.yml**.

## Optional: package-lock.json

For faster and more reliable installs, commit a lockfile:

```bash
cd webapp/scalable && npm install && git add package-lock.json && git commit -m "Add package-lock.json"
```

If `package-lock.json` is missing, the workflows use `npm install` instead of `npm ci`.
