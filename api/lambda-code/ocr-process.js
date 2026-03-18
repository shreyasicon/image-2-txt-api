"use strict";

const fs = require("fs");
const path = require("path");
const { createWorker } = require("tesseract.js");
const { TextractClient, DetectDocumentTextCommand } = require("@aws-sdk/client-textract");

let sharp;
try {
    sharp = require("sharp");
} catch (_) {
    sharp = null;
}

const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const textractClient = new TextractClient({ region: AWS_REGION });

function cleanupFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (_) {}
    }
}

async function preprocessForTesseract(imagePath) {
    if (!sharp) return imagePath;
    const ext = path.extname(imagePath);
    const outPath = path.join(path.dirname(imagePath), `prep-${Date.now()}${ext}`);
    try {
        await sharp(imagePath)
            .grayscale()
            .normalize()
            .resize(null, 1200, { fit: "inside", withoutEnlargement: true })
            .sharpen()
            .toFile(outPath);
        return outPath;
    } catch (_) {
        return imagePath;
    }
}

async function ocrWithTextract(imagePath) {
    const imageBytes = fs.readFileSync(imagePath);
    const command = new DetectDocumentTextCommand({
        Document: { Bytes: imageBytes }
    });
    const result = await textractClient.send(command);
    const blocks = result.Blocks || [];
    const lines = blocks
        .filter((b) => b.BlockType === "LINE" && b.Text)
        .map((b) => b.Text);
    const text = lines.join("\n").trim();
    const confidences = blocks
        .filter((b) => b.BlockType === "LINE" && b.Confidence != null)
        .map((b) => b.Confidence);
    const confidence = confidences.length
        ? Math.round(confidences.reduce((a, c) => a + c, 0) / confidences.length)
        : 95;
    return { text, confidence };
}

async function ocrWithTesseract(imagePath, language = "eng") {
    let toProcess = imagePath;
    let preprocessedPath = null;
    if (sharp) {
        preprocessedPath = await preprocessForTesseract(imagePath);
        toProcess = preprocessedPath;
    }
    const worker = await createWorker();
    await worker.loadLanguage(language);
    await worker.initialize(language);
    await worker.setParameters({ tessedit_pageseg_mode: 3 });
    const result = await worker.recognize(toProcess);
    await worker.terminate();
    if (preprocessedPath) cleanupFile(preprocessedPath);
    return {
        text: (result.data.text || "").trim(),
        confidence: Math.round(result.data.confidence || 0)
    };
}

/**
 * Run OCR on an image file. Uses Textract first, falls back to Tesseract.
 * @param {string} imagePath - Path to image file
 * @param {string} [language='eng'] - Tesseract language code
 * @returns {Promise<{text: string, confidence: number}>}
 */
async function processOCR(imagePath, language = "eng") {
    try {
        const out = await ocrWithTextract(imagePath);
        if (out && (out.text || out.confidence !== undefined)) return out;
    } catch (e) {
        if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
            console.warn("Textract failed, falling back to Tesseract:", e.message);
        }
    }
    return ocrWithTesseract(imagePath, language);
}

module.exports = { processOCR, cleanupFile };
