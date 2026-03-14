# Lambda test events (API Gateway HTTP API payload 2.0)

Use these in the AWS Lambda console **Test** tab so the request is routed correctly.

- **health.json** – `GET /health` (returns `{"status":"healthy",...}`).

To test **POST /ocr** or **POST /ocr/base64**, use the real API URL from API Gateway (see deploy output), e.g.:

```bash
curl -X POST "https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/prod/ocr" \
  -F "image=@your-image.jpg"
```

Or in the console: create a new test event and paste the JSON from `health.json`, then change `routeKey` and `rawPath` (and `requestContext.http.method` / `path`) to match the route you want. The default "Hello World" event does **not** match API Gateway format, so Express returns 404.
