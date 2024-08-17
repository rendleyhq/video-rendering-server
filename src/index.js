const express = require("express");
const app = express();
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dotenv = require("dotenv");

const sampleData = require("./data/data.json");
const { getRenderView } = require("./render_view");
const { getRenderCompletedView } = require("./render_completed_view");

dotenv.config();

const PORT = process.env.PORT || 3000;
const MAX_BROWSER_MEMORY = 4096;

// Get a free license on https://app.rendley.com
const LICENSE = {
  licenseName: process.env.LICENSE_NAME,
  licenseKey: process.env.LICENSE_KEY,
};

let browser;

// store the final videos
app.use("/videos", express.static(path.join(__dirname, "../videos")));

// Render
app.get("/", async (req, res) => {
  const now = performance.now();

  try {
    const data = sampleData;
    const filePath = await renderVideo(data);

    res.send(
      getRenderCompletedView({
        filePath,
        duration: (performance.now() - now) / 1000,
      })
    );
  } catch (error) {
    res.send("Something went wrong");
  }
});

// Expose the SDK from local node_modules
app.get("/packages/rendley-sdk", function (req, res) {
  const filePath = path.join(
    __dirname,
    "../node_modules/@rendley/sdk/dist/index.js"
  );
  res.sendFile(filePath);
});

app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`);
});

function renderVideo(data) {
  return new Promise(async (resolve, reject) => {
    const uuid = crypto.randomUUID();

    if (browser == null) {
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

    // Expose a function to handle the rendered video
    await page.exposeFunction("onRenderCompleted", async (buffer) => {
      const uuid = crypto.randomUUID();
      const filename = `${uuid}.mp4`;
      const data = new Uint8Array(buffer);

      const filePath = storeVideoInFs(filename, data);

      await page.close();

      resolve(filePath);
    });

    // Expose a function to handle render errors
    await page.exposeFunction("onRenderError", async (error) => {
      await page.close();
      reject(error);
    });

    // launch an endpoint for rendering
    app.get(`/renderer/${uuid}`, async (req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.send(getRenderView({ data, license: LICENSE }));
    });

    await page.goto(`http://localhost:3000/renderer/${uuid}`);
  });
}

function storeVideoInFs(filename, data) {
  const videosDir = path.join(__dirname, "../videos");
  const publicPath = `/videos/${filename}`;
  const filePath = path.join(videosDir, filename);

  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
  }

  fs.writeFileSync(filePath, Buffer.from(data));

  return publicPath;
}
