# Exact steps: Deploy webapp to AWS and see updates

## Prerequisites

- Node.js 18+ installed.
- AWS CLI configured (e.g. `aws configure` with Access Key, Secret Key, region `us-east-1`).
- You are in the **webapp** folder: `webapp/scalable`.

## 1. Deploy (one command)

From the project root, run:

```bash
cd webapp/scalable
node deploy.js
```

Or from repo root:

```bash
node webapp/scalable/deploy.js
```

**What the script does (in order):**

1. Ensures Cognito User Pool + App Client (for Sign in / My Uploads).
2. Builds the app with `npm run build` (output in `out/`).
3. Ensures S3 bucket `image2text-webapp-<your-account-id>` exists.
4. Ensures CloudFront distribution **whose origin is that bucket** exists (or creates it).
5. If the distribution already exists: updates it so the **default cache TTL = 0** (so HTML is not cached), then **waits until the distribution status is "Deployed"** (can take 5–15 min).
6. Uploads everything in `out/` to the S3 bucket (overwrites existing files).
7. Verifies `index.html` is in S3.
8. Creates a CloudFront invalidation for `/*` and **waits until the invalidation is "Completed"**.
9. Prints the live URL and Cognito IDs.

**Important:** The “wait for distribution to deploy” step can take several minutes. Do not interrupt the script.

## 2. Open the live site

Use the URL printed at the end, e.g.:

```
https://d1234abcd.cloudfront.net
```

## 3. If you still see old content

1. **Hard refresh:** `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac).
2. **Or open in an incognito/private window** so the browser does not use cache.
3. **Confirm you’re on the right URL:** It must be the CloudFront URL from the script output (or from `node get-url.js`), not an old bookmark or a different environment.

## 4. Get the CloudFront URL later

From `webapp/scalable`:

```bash
node get-url.js
```

## 5. If the script says “Build output not found”

- Ensure `next.config` has `output: 'export'`.
- Run `npm run build` in `webapp/scalable` and confirm the `out/` folder appears.

## 6. If updates still never appear

- **Check bucket name:** The script uses bucket `image2text-webapp-<accountId>`. In AWS Console → S3, open that bucket and check that `index.html` and `dashboard/` (etc.) were updated (e.g. by Last modified).
- **Check CloudFront origin:** In AWS Console → CloudFront → your distribution → Origins. The origin domain must be exactly `image2text-webapp-<accountId>.s3.us-east-1.amazonaws.com`. If you have another distribution pointing at a different bucket, the script only updates the one that matches this bucket.
- **Run deploy again** and let it finish (including “Waiting for CloudFront config to deploy” and “Invalidation completed”).
