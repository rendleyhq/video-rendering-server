const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { exec } = require("child_process");
const puppeteer = require("puppeteer");

const RenderView = require("../views/render");
const config = require("../config");

async function renderVideo(expressApp, data) {
	const randomId = crypto.randomUUID();

	const chunksCount = Math.min(
		config.rendering.maxCoresPerVideo,
		Math.ceil(data.timeline.fitDuration / 60) // 1 minute per chunk
	);

	const timeout = data.timeline.fitDuration * 5 * 1000;

	const browser = await puppeteer.launch({
		headless: false,
		timeout,
		protocolTimeout: timeout,
		args: ["--no-sandbox", `--max-old-space-size=${config.rendering.maxRamPerVideo}`, `--force-gpu-mem-available-mb=${config.rendering.maxGpuPerVideo}`, "--disable-setuid-sandbox", "--ignore-gpu-blacklist", "--enable-webgl", "--enable-webcodecs", "--force-high-performance-gpu", "--enable-accelerated-video-decode", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--disable-software-rasterizer", "--disable-gpu-vsync", "--disable-dev-shm-usage", "--disable-background-timer-throttling", "--enable-oop-rasterization", "--disable-gpu-process-crash-limit"],
	});

	const fitDuration = data.timeline.fitDuration;
	const chunkDuration = fitDuration / chunksCount;
	const totalChunks = Math.ceil(fitDuration / chunkDuration);

	let chunksPaths = [];
	let hasAudio = true;

	const renderTask = async (page, { from, to, index, exportType }) => {
		const start = performance.now();

		console.log(`[CLUSTER ${index}] Start rendering chunks`, `(${from}, ${to}, ${exportType})`, Date.now());

		expressApp.get(`/renderer/${randomId}/${index}`, (req, res) => {
			res.setHeader("Content-Type", "text/html");
			res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
			res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
			res.send(RenderView({ data, from, to, exportType }));
		});

		let buffer = null;
		let cursor = 0;

		//page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));

		await page.goto(`http://localhost:${config.port}/renderer/${randomId}/${index}`, { waitUntil: "domcontentloaded" });

		await page.exposeFunction("prepareBuffer", (size) => {
			buffer = new Uint8Array(size);
		});

		await page.exposeFunction("feedBuffer", (data) => {
			buffer.set(new Uint8Array(data), cursor);
			cursor += data.length;
		});

		await page.waitForFunction(() => {
			return typeof window.exportVideo === "function";
		});

		return async () => {
			await page.bringToFront();

			const result = await page.evaluate(
				async () => {
					return await window.exportVideo();
				},
				{ timeout }
			);
			console.log("Evaluate result: ", result);
			if (!result) {
				hasAudio = false;
			} else {
				console.log(`[CLUSTER ${index}] End rendering chunk`, `(Took: ${(performance.now() - start) / 1000})`);

				const extension = exportType === "audio_only" ? "aac" : "mp4";
				const storedPath = path.join(getTempDir(randomId), `${index}.${extension}`);

				await storeToFS(storedPath, buffer);

				chunksPaths[index] = storedPath;
			}

			await page.close();
		};
	};

	// Queue tasks for each chunk
	let openedTasks = [];

	for (let i = 0; i < totalChunks; i++) {
		const from = i * chunkDuration;
		const to = Math.min(from + chunkDuration, fitDuration);
		const page = await browser.newPage();

		const renderFn = await renderTask(page, {
			from,
			to,
			index: i,
			exportType: "video_only",
		});

		openedTasks[i] = renderFn();
	}

	const audioPage = await browser.newPage();

	const renderAudioFn = await renderTask(audioPage, {
		from: 0,
		to: fitDuration,
		index: totalChunks,
		exportType: "audio_only",
	});

	openedTasks[totalChunks] = renderAudioFn();

	let finalVideoPath;

	try {
		await Promise.all(openedTasks);

		finalVideoPath = await mergeFinalVideoFromChunks(randomId, chunksPaths, fitDuration, hasAudio);
	} catch (error) {
		console.log("ERROR", error);
	} finally {
		await deleteFromFS(getTempDir(randomId));
		browser.close();
	}

	return finalVideoPath;
}

function mergeFinalVideoFromChunks(randomId, chunksPaths, fitDuration, hasAudio) {
	return new Promise(async (resolve, reject) => {
		const outputFilePath = getOutputPath(randomId);

		const tempChunksInputFile = path.join(getTempDir(randomId), `input_chunks.txt`);

		await createPathIfNotExists(outputFilePath);

		// the audio chunk is added last
		// pop removes the last element and mutates the array
		const audioChunk = hasAudio ? chunksPaths.pop() : null;

		// Write chunk paths to the temporary file
		const fileContent = chunksPaths.map((fileName) => `file '${fileName}'`).join("\n");

		await storeToFS(tempChunksInputFile, fileContent);

		// Construct the ffmpeg command using the temporary file
		// using fitDuration to trim the mixed audio - not necessary if the whole video is being rendered
		let ffmpegCmd;
		if (audioChunk) {
			ffmpegCmd = `ffmpeg -f concat -safe 0 -i ${tempChunksInputFile} -ss 00:00:00 -t ${fitDuration} -i ${audioChunk}  -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 ${outputFilePath}`;
		} else {
			ffmpegCmd = `ffmpeg -f concat -safe 0 -i ${tempChunksInputFile} -c:v copy -map 0:v:0 ${outputFilePath}`;
		}

		exec(ffmpegCmd, (error, stdout, stderr) => {
			if (error) {
				console.error("Error during ffmpeg merge:", stderr);
				reject(error);
			} else {
				resolve(outputFilePath);
			}
		});
	});
}

function getTempDir(id) {
	return path.join(__dirname, `../../temp/${id}`);
}

function getOutputPath(id) {
	return path.join(__dirname, `../../videos/${id}.mp4`);
}

async function storeToFS(absolutePath, file) {
	await createPathIfNotExists(absolutePath);

	await fs.writeFile(absolutePath, file);

	return absolutePath;
}

async function deleteFromFS(absolutePath) {
	try {
		await fs.unlink(absolutePath, { recursive: true, force: true });
	} catch {
		return null;
	}
}

async function createPathIfNotExists(absolutePath) {
	const dir = path.dirname(absolutePath);

	await fs.mkdir(dir, { recursive: true });
}

module.exports = { renderVideo };
