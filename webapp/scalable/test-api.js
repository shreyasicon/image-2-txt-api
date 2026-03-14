// test-api.js - Simple test script for the OCR API
const fs = require("fs");
const FormData = require("form-data");

// Use built-in fetch (Node 18+) or node-fetch (older versions)
let fetch;
try {
    // Try built-in fetch first (Node 18+)
    fetch = globalThis.fetch || require("node-fetch");
} catch (err) {
    console.error("⚠️  fetch not available. Install node-fetch: npm install node-fetch");
    process.exit(1);
}

const API_URL = "http://localhost:3001";

// Test 1: Health check
async function testHealth() {
    console.log("\n=== Testing Health Endpoint ===");
    try {
        const response = await fetch(`${API_URL}/health`);
        const data = await response.json();
        console.log("✅ Health check:", data);
    } catch (err) {
        console.error("❌ Health check failed:", err.message);
    }
}

// Test 2: File upload OCR
async function testFileUpload(imagePath) {
    console.log("\n=== Testing File Upload OCR ===");
    if (!fs.existsSync(imagePath)) {
        console.log(`⚠️  Image file not found: ${imagePath}`);
        console.log("   Skipping file upload test...");
        return;
    }

    try {
        const formData = new FormData();
        formData.append("image", fs.createReadStream(imagePath));
        formData.append("language", "eng");
        formData.append("details", "false");

        const response = await fetch(`${API_URL}/ocr`, {
            method: "POST",
            body: formData,
        });

        const data = await response.json();
        if (response.ok) {
            console.log("✅ File upload OCR successful!");
            console.log("   Text:", data.text.substring(0, 100) + "...");
            console.log("   Confidence:", data.confidence);
        } else {
            console.error("❌ File upload OCR failed:", data);
        }
    } catch (err) {
        console.error("❌ File upload test error:", err.message);
    }
}

// Test 3: Base64 OCR
async function testBase64(imagePath) {
    console.log("\n=== Testing Base64 OCR ===");
    if (!fs.existsSync(imagePath)) {
        console.log(`⚠️  Image file not found: ${imagePath}`);
        console.log("   Skipping base64 test...");
        return;
    }

    try {
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = imageBuffer.toString("base64");
        const mimeType = "image/png"; // Adjust based on your image type
        const dataUri = `data:${mimeType};base64,${base64Image}`;

        const response = await fetch(`${API_URL}/ocr/base64`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                image: dataUri,
                language: "eng",
                details: false,
            }),
        });

        const data = await response.json();
        if (response.ok) {
            console.log("✅ Base64 OCR successful!");
            console.log("   Text:", data.text.substring(0, 100) + "...");
            console.log("   Confidence:", data.confidence);
        } else {
            console.error("❌ Base64 OCR failed:", data);
        }
    } catch (err) {
        console.error("❌ Base64 test error:", err.message);
    }
}

// Test 4: Error handling
async function testErrorHandling() {
    console.log("\n=== Testing Error Handling ===");

    // Test without file
    try {
        const response = await fetch(`${API_URL}/ocr`, {
            method: "POST",
        });
        const data = await response.json();
        if (!response.ok) {
            console.log("✅ Error handling works:", data.error);
        }
    } catch (err) {
        console.error("❌ Error test failed:", err.message);
    }
}

// Run all tests
async function runTests() {
    console.log("🧪 Starting API Tests...");
    console.log("Make sure the server is running on", API_URL);

    await testHealth();
    await testFileUpload("test-image.png"); // Change to your test image path
    await testBase64("test-image.png"); // Change to your test image path
    await testErrorHandling();

    console.log("\n✅ Tests completed!");
}

// Check if node-fetch is available
try {
    require("node-fetch");
    runTests();
} catch (err) {
    console.log("⚠️  node-fetch not installed. Install it with: npm install node-fetch");
    console.log("   Or use curl/Postman to test the API manually.");
}