const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { exec } = require("child_process");
const { Cluster } = require("puppeteer-cluster");
const fsSync = require("fs");

const RenderView = require("../views/render");
const config = require("../config");

if (config.logging.logMode === config.logMode.file || config.logging.logMode === config.logMode.both) {
	if (!fsSync.existsSync("logs")) {
		fsSync.mkdirSync("logs");
	}
}

process.on("exit", () => {
	console.log("\x1b[0m"); // Reset all colors
});

process.on("SIGINT", () => {
	process.exit();
});

process.on("SIGTERM", () => {
	process.exit();
});

function getVideoExtensionsFromData(data) {
	if (data.settings.encoderCodec) {
		if (data.settings.encoderCodec === "vp9" || data.settings.encoderCodec === "vp8") {
			return ["webm", "ogg"];
		} else {
			return ["mp4", "aac"];
		}
	} else {
		return ["mp4", "aac"];
	}
}

async function renderVideo(expressApp, data) {
	const randomId = crypto.randomUUID();
	const extensions = getVideoExtensionsFromData(data);

	const chunksCount = Math.min(
		config.rendering.maxCoresPerVideo,
		Math.ceil(data.timeline.fitDuration / 60) // 1 minute per chunk
	);

	const timeout = data.timeline.fitDuration * chunksCount * 10000;

	const fitDuration = data.timeline.fitDuration;
	const chunkDuration = fitDuration / chunksCount;
	const totalChunks = Math.ceil(fitDuration / chunkDuration);

	let chunksPaths = [];
	let hasAudio = true;

	const cluster = await Cluster.launch({
		concurrency: config.rendering.concurrencyMode,
		maxConcurrency: totalChunks + 1,
		timeout,
		puppeteerOptions: {
			headless: true,
			timeout,
			protocolTimeout: timeout,
			ignoreHTTPSErrors: true,
			args: [
				"--use-gl=angle",
				"--use-angle=gl-egl",
				"--ignore-certificate-errors",
				"--ignore-certificate-errors-spki-list",
				"--no-sandbox",
				"--disable-dev-shm-usage",
				`--max-old-space-size=${config.rendering.maxRamPerVideo}`,
				`--force-gpu-mem-available-mb=${config.rendering.maxGpuPerVideo}`,
				"--disable-setuid-sandbox",
				"--ignore-gpu-blacklist",
				"--enable-webgl",
				"--enable-webcodecs",
				"--force-high-performance-gpu",
				"--enable-accelerated-video-decode",
				"--disable-background-timer-throttling",
				"--disable-renderer-backgrounding",
				"--disable-backgrounding-occluded-windows",
				"--disable-software-rasterizer",
				"--disable-gpu-vsync",
				"--enable-oop-rasterization",
			],
			// \/ This bellow causes the browser player to break on Windows under D3D11, leaving for investigations
			//args: ["--ignore-certificate-errors", "--ignore-certificate-errors-spki-list", "--no-sandbox", "--disable-dev-shm-usage", `--max-old-space-size=${config.rendering.maxRamPerVideo}`, `--force-gpu-mem-available-mb=${config.rendering.maxGpuPerVideo}`, "--disable-setuid-sandbox", "--ignore-gpu-blacklist", "--enable-webgl", "--enable-webcodecs", "--force-high-performance-gpu", "--enable-accelerated-video-decode", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--disable-software-rasterizer", "--disable-gpu-vsync", "--enable-oop-rasterization"],
		},
	});

	await cluster.task(async ({ page, data: payload }) => {
		const { from, to, index, exportType, excludeClipTypes } = payload;

		console.log(`[CLUSTER ${index}] Rendering ${from} to ${to}`);

		const start = performance.now();

		expressApp.get(`/renderer/${randomId}/${index}`, (req, res) => {
			res.setHeader("Content-Type", "text/html");
			res.send(RenderView({ data, from, to, exportType, excludeClipTypes }));
		});

		let buffer = null;
		let cursor = 0;

		const queuedText = [];
		let outputCounter = 0;
		let stream;
		if (config.logging.logMode === config.logMode.file || config.logging.logMode === config.logMode.both) {
			stream = fsSync.createWriteStream(`logs/${randomId}-${index}.log`, { flags: "w" });
		}

		const ANSI_REGEX = /\x1b\[[0-9;]*m/g;
		const logOutput = (args) => {
			if (config.logging.logMode === config.logMode.console || config.logging.logMode === config.logMode.both) {
				console.log(...args);
			}
			if (config.logging.logMode === config.logMode.file || config.logging.logMode === config.logMode.both) {
				stream.write(
					args
						.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : arg))
						.join(" ")
						.replace(ANSI_REGEX, "") + "\n"
				);
			}
		};
		const flushQueuedText = () => {
			if (queuedText.length > 0) {
				let removeAt = -1;
				for (let i = 0; i < queuedText.length; i++) {
					if (queuedText[i].queueIndex <= outputCounter) {
						logOutput(queuedText[i].args);
						removeAt = i;
					}
				}
				if (removeAt > -1) {
					queuedText.splice(0, removeAt + 1);
				}
			}
		};
		const tryOutputText = (counter, args) => {
			flushQueuedText();
			if (counter <= outputCounter) {
				logOutput(args);
			} else {
				queuedText.push({ queueIndex: counter, args });
			}
		};

		page.on("console", async (msg) => {
			const localCounter = ++outputCounter;
			const logArgs = [];
			logArgs.push(`\x1b[1mCLUSTER ${index} \x1b[22m`);
			if (msg.args().length > 0) {
				let skipSecond = false;
				for (let i = 0; i < msg.args().length; i++) {
					if (skipSecond && i == 1) continue;
					try {
						const arg = msg.args()[i];
						const txt = await arg.jsonValue();
						if (i == 0 && txt.startsWith("%c")) {
							skipSecond = true;
							if (txt.startsWith("%c[WARN]")) {
								if (config.logging.consoleLogLevel < config.logLevel.warn) {
									return;
								}

								logArgs[0] = "\x1b[33m" + logArgs[0];
								logArgs.push("\x1b[1m[WARN]: \x1b[22m");
							} else if (txt.startsWith("%c[ERROR]")) {
								if (config.logging.consoleLogLevel < config.logLevel.error) {
									return;
								}

								logArgs[0] = "\x1b[31m" + logArgs[0];
								logArgs.push("\x1b[1m[ERROR]: \x1b[22m");
							} else {
								if (config.logging.consoleLogLevel < config.logLevel.info) {
									return;
								}

								logArgs[0] = "\x1b[37m" + logArgs[0];
								logArgs.push("\x1b[1m[INFO]: \x1b[22m");
							}
						} else {
							if (typeof txt === "object") {
								logArgs.push("\x1b[0m"); // Reset the colors if we're pushing an object as it will mess the other colors from console.log formating
							}
							logArgs.push(txt);
						}
					} catch (err) {
						// If jsonValue() fails, fallback to evaluate()
						try {
							const arg = msg.args()[i];
							const txt = await arg.evaluate((obj) => {
								// Convert object to a string in the browser context
								return obj instanceof Node
									? obj.outerHTML // For DOM elements
									: obj.toString();
							});
							if (i == 0 && txt.startsWith("%c")) {
								skipSecond = true;
								if (txt.startsWith("%c[WARN]")) {
									if (config.logging.consoleLogLevel < config.logLevel.warn) {
										return;
									}

									logArgs[0] = "\x1b[33m" + logArgs[0];
									logArgs.push("\x1b[1m[WARN]: \x1b[22m");
								} else if (txt.startsWith("%c[ERROR]")) {
									if (config.logging.consoleLogLevel < config.logLevel.error) {
										return;
									}

									logArgs[0] = "\x1b[31m" + logArgs[0];
									logArgs.push("\x1b[1m[ERROR]: \x1b[22m");
								} else {
									if (config.logging.consoleLogLevel < config.logLevel.info) {
										return;
									}

									logArgs[0] = "\x1b[37m" + logArgs[0];
									logArgs.push("\x1b[1m[INFO]: \x1b[22m");
								}
							} else {
								logArgs.push(txt);
							}
						} catch (e) {
							logArgs.push("[Unserializable]");
						}
					}
				}

				tryOutputText(localCounter, logArgs);
			}
		});

		const pageUrl = `http://localhost:${config.port}/renderer/${randomId}/${index}`;
		console.log(`[CLUSTER ${index}] Page URL: ${pageUrl}`);
		await page.goto(pageUrl, { waitUntil: "domcontentloaded" });

		await page.waitForFunction(() => typeof window.exportVideo === "function", {
			timeout: timeout,
		});

		await page.exposeFunction("prepareBuffer", (size) => {
			buffer = new Uint8Array(size);
		});

		await page.exposeFunction("feedBuffer", (data) => {
			buffer.set(new Uint8Array(data), cursor);
			cursor += data.length;
		});

		const result = await page.evaluate(async () => {
			return await window.exportVideo();
		});

		//await new Promise((resolve) => setTimeout(resolve, 2000000));

		if (stream) {
			stream.end();
		}

		if (!result) {
			if (exportType === "audio_only") {
				hasAudio = false;
			}
			throw new Error(`CLUSTER ${index}: Something went wrong`);
		}

		console.log(`[CLUSTER ${index}] End rendering chunk`, `(Took: ${(performance.now() - start) / 1000})`);

		const extension = exportType === "audio_only" ? extensions[1] : extensions[0];

		const storedPath = path.join(getTempDir(randomId), `${index}.${extension}`);

		await storeToFS(storedPath, buffer);

		chunksPaths[index] = storedPath;

		return true;
	});

	for (let i = 0; i < totalChunks; i++) {
		const from = i * chunkDuration;
		const to = Math.min(from + chunkDuration, fitDuration);

		cluster.queue({ from, to, index: i, exportType: "video_only", excludeClipTypes: [] });
	}

	cluster.queue({
		from: 0,
		to: fitDuration,
		index: totalChunks,
		exportType: "audio_only",
		excludeClipTypes: [],
	});

	let finalVideoPath;

	try {
		await cluster.idle();
		//await new Promise((resolve) => setTimeout(resolve, 2000000));
		await cluster.close();

		finalVideoPath = await mergeFinalVideoFromChunks(randomId, chunksPaths, fitDuration, hasAudio, extensions);
	} catch (error) {
		console.log("[ERROR]", error);
	} finally {
		await deleteFromFS(getTempDir(randomId));
	}

	console.log(`[RENDER DONE] Final video path: ${finalVideoPath}`);
	return `/videos/${randomId}.${extensions[0]}`;
}

function mergeFinalVideoFromChunks(randomId, chunksPaths, fitDuration, hasAudio, extensions) {
	return new Promise(async (resolve, reject) => {
		const outputFilePath = getOutputPath(randomId, extensions);

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
			const audioCodec = extensions[1] === "aac" ? "aac" : "libvorbis";
			ffmpegCmd = `ffmpeg -f concat -safe 0 -i ${tempChunksInputFile} -ss 00:00:00 -t ${fitDuration} -i ${audioChunk}  -c:v copy -c:a ${audioCodec} -map 0:v:0 -map 1:a:0 ${outputFilePath}`;
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

function getOutputPath(id, extensions) {
	return path.join(__dirname, `../../videos/${id}.${extensions[0]}`);
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
