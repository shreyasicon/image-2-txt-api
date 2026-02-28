// app.js - Frontend logic for index.html (external to satisfy CSP)
(function() {
    function getApiBase() {
        // Always use the API server URL - the page may be served from Live Preview,
        // file://, or another port; the OCR API runs on port 3001.
        // Use same origin when page is from our server; otherwise localhost:3000
        if (window.location.protocol === "http:" || window.location.protocol === "https:") {
            return window.location.origin;
        }
        return "http://localhost:3001";
    }

    async function sendImage() {
        console.log("sendImage() called");

        const uploadEl = document.getElementById("upload");
        const output = document.getElementById("output");
        const button = document.querySelector("button");

        if (!uploadEl || !output) {
            alert("Page is missing required elements (#upload or #output).");
            console.error("Missing elements:", { uploadEl, output });
            return;
        }

        const file = uploadEl.files && uploadEl.files[0];
        if (!file) {
            alert("Please select an image file first");
            return;
        }

        console.log("File selected:", file.name, file.size, file.type);

        const formData = new FormData();
        formData.append("image", file);

        // Clear previous output and show loading
        output.textContent = "Processing OCR... Please wait, this may take a moment...";
        output.className = "";
        output.style.display = "block";
        output.style.visibility = "visible";
        output.style.opacity = "1";
        if (button) button.disabled = true;

        const API_BASE = getApiBase();
        console.log("API Base URL:", API_BASE);

        try {
            console.log("Sending fetch request to:", `${API_BASE}/ocr`);

            const res = await fetch(`${API_BASE}/ocr`, {
                method: "POST",
                body: formData,
            });

            console.log("Response received:", res.status, res.statusText);
            console.log("Response headers:", res.headers.get("content-type"));

            // Read response body once as text, then parse as JSON
            const responseText = await res.text();
            console.log("Response text length:", responseText.length);
            console.log("Response text preview:", responseText.substring(0, 200));

            let data;

            try {
                data = JSON.parse(responseText);
                console.log("Parsed JSON data:", data);
            } catch (parseErr) {
                console.error("JSON parse error:", parseErr);
                console.error("Response text:", responseText);
                throw new Error(`Server returned non-JSON response: ${res.status} ${res.statusText}\n${responseText.substring(0, 500)}`);
            }

            if (!res.ok) {
                console.error("Response not OK:", res.status, data);
                throw new Error(data.message || data.error || `HTTP ${res.status}: ${res.statusText}`);
            }

            console.log("Checking data.text:", data.text);
            console.log("Text length:", data.text ? String(data.text).trim().length : 0);

            if (data.text && String(data.text).trim().length > 0) {
                let displayText = String(data.text).trim();
                if (data.confidence !== undefined && data.confidence !== null && !Number.isNaN(Number(data.confidence))) {
                    displayText += "\n\n(Confidence: " + Number(data.confidence).toFixed(2) + "%)";
                }

                output.textContent = displayText;
                output.className = "";
                output.style.cssText = "display:block !important; visibility:visible !important; opacity:1 !important; color:#333; background:#f9f9f9; margin-top:20px; padding:15px; border:2px solid #667eea; border-radius:5px; min-height:50px; white-space:pre-wrap; word-wrap:break-word; font-size:16px; line-height:1.6;";
                output.scrollIntoView({ behavior: "smooth", block: "nearest" });
            } else {
                console.log("No text found in response");
                output.textContent = "No text detected in image. Try a clearer image with visible text.";
                output.className = "";
                output.style.display = "block";
            }
        } catch (err) {
            console.error("Error in sendImage:", err);
            const msg = (err && err.message) ? err.message : String(err);
            output.textContent = msg.includes("Failed to fetch") ?
                "Cannot connect to server. Start it with: npm start (http://localhost:3001)" :
                `Error: ${msg}`;
            output.className = "error";
            output.style.display = "block";
        } finally {
            if (button) button.disabled = false;
        }
    }

    // Expose globally for the button onclick in index.html
    window.sendImage = sendImage;
    console.log("sendImage function exposed to window");

    // Wait for DOM to be ready, then attach event listeners
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    function init() {
        console.log("Initializing app.js");

        // Optional debug log for file selection
        const uploadEl = document.getElementById("upload");
        if (uploadEl) {
            uploadEl.addEventListener("change", function() {
                const f = this.files && this.files[0];
                if (f) console.log("File selected:", f.name, f.type, f.size);
            });
        }

        // Verify output element exists
        const output = document.getElementById("output");
        if (output) {
            console.log("Output element found:", output);
            // Set initial content to verify it's visible
            output.textContent = "Ready to upload image...";
        } else {
            console.error("Output element not found!");
        }
    }
})();