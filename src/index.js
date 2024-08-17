const express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dotenv = require("dotenv");

const sampleData = require("./data/data.json");
const { getRenderView } = require("./render_view");
const { getRenderCompletedView } = require("./render_completed_view");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

const MAX_BROWSER_MEMORY = 4096;

const LICENSE = {
  licenseName: process.env.LICENSE_NAME,
  licenseKey: process.env.LICENSE_KEY,
};

let browser;

app.use(express.json());
app.use("/videos", express.static(path.join(__dirname, "../videos")));

// Render routes
app.get("/", (req, res) => handleRender(req, res, sampleData));
app.post("/", (req, res) => handleRender(req, res, req.body));

// SDK exposure route
app.get("/packages/rendley-sdk", (req, res) => {
  const filePath = path.join(
    __dirname,
    "../node_modules/@rendley/sdk/dist/index.js"
  );
  res.sendFile(filePath);
});

app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`);
});

// Helper function to handle rendering logic
async function handleRender(req, res, data) {
  const startTime = performance.now();

  try {
    const filePath = await renderVideo(data);
    const duration = (performance.now() - startTime) / 1000;

    res.send(getRenderCompletedView({ filePath, duration }));
  } catch (error) {
    res.status(500).send("Something went wrong");
  }
}

// Main video rendering function
async function renderVideo(data) {
  const uuid = crypto.randomUUID();

  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        `--max-old-space-size=${MAX_BROWSER_MEMORY}`,
        "--disable-dev-shm-usage",
      ],
    });
  }

  const page = await browser.newPage();

  return new Promise((resolve, reject) => {
    page.exposeFunction("onRenderCompleted", async (buffer) => {
      const filePath = storeVideoInFs(buffer);
      await page.close();
      resolve(filePath);
    });

    page.exposeFunction("onRenderError", async (error) => {
      await page.close();
      reject(error);
    });

    app.get(`/renderer/${uuid}`, (req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.send(getRenderView({ data, license: LICENSE }));
    });

    page.goto(`http://localhost:${PORT}/renderer/${uuid}`);
  });
}

// Store video to the filesystem
function storeVideoInFs(buffer) {
  const uuid = crypto.randomUUID();
  const filename = `${uuid}.mp4`;
  const videosDir = path.join(__dirname, "../videos");

  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
  }

  const filePath = path.join(videosDir, filename);
  fs.writeFileSync(filePath, Buffer.from(buffer));

  return `/videos/${filename}`;
}
