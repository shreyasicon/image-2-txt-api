# OCR API (Image to Text)

## Project structure

- **Root (`/`)**  
  - `deploy.js` – deploys Lambda, API Gateway, DynamoDB, IAM (Textract + DynamoDB).  
  - `package.json` – dependencies for **deploy only** (e.g. `archiver`, `aws-sdk`).  
  - `index.html`, `app.js` – optional local frontend for the API.

- **`lambda-code/`**  
  - `server.js` – Lambda handler (Express app: OCR, DynamoDB).  
  - `package.json` – dependencies for the **Lambda runtime** (Express, Textract, Tesseract, etc.).  
  - No duplicate frontend here; the API is used by the root frontend or any client.

The two `package.json` files are **intentional**: one for the deploy script (root), one for the Lambda (lambda-code). Do not remove either.

## Deploy

```bash
npm install          # root deps for deploy
node deploy.js
```

## Run Lambda locally

```bash
cd lambda-code
npm install
npm start
```
