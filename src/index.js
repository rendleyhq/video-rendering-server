const express = require("express");
const path = require("path");
const https = require("https");
const fs = require("fs");

const RenderController = require("./controllers/RenderController");
const RenderCompletedView = require("./views/render_completed");
const config = require("./config");

const sampleData = require("./data/data.json");

const app = express();

// Static directories
app.use(express.json());
app.use("/videos", express.static(path.join(__dirname, "../videos")));
app.use("/", express.static(path.join(__dirname, "../public")));

// Routes
app.get("/", (req, res) => handleRender(req, res, sampleData));
app.post("/", (req, res) => handleRender(req, res, req.body));
app.get("/packages/rendley-sdk", (req, res) => {
	const filePath = path.join(__dirname, "../node_modules/@rendley/sdk/dist/index.js");
	res.sendFile(filePath);
});

/*
app.listen(config.port, () => {
  console.log(`Server is running on port ${config.port}`);
});
*/
// SSL certificate and key
const sslOptions = {
	key: fs.readFileSync(path.join(__dirname, "../tmp_certificates/key.pem")),
	cert: fs.readFileSync(path.join(__dirname, "../tmp_certificates/cert.pem")),
};

// Start HTTPS server
https.createServer(sslOptions, app).listen(config.port, () => {
	console.log(`HTTPS server is running on port ${config.port}`);
});

// Helper function to handle rendering logic
async function handleRender(req, res, data) {
	const startTime = performance.now();

	try {
		const filePath = await RenderController.renderVideo(app, data);
		const duration = (performance.now() - startTime) / 1000;

		res.send(RenderCompletedView({ filePath, duration }));
	} catch (error) {
		console.error("Error in handleRender:", error);
		res.status(500).send("Something went wrong");
	}
}
