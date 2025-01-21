const dotenv = require("dotenv");
const os = require("os");
const { Cluster } = require("puppeteer-cluster");

const OS_CORES = os.cpus().length;
const OS_RAM = os.totalmem();

dotenv.config();

const concurrencyMode = {
	context: Cluster.CONCURRENCY_CONTEXT, // opens a new window for each task
	page: Cluster.CONCURRENCY_PAGE, // opens a new tab for each task (might require focus)
	browser: Cluster.CONCURRENCY_BROWSER, // opens a new browser for each task
};

const logMode = {
	none: "none",
	console: "console",
	file: "file",
	both: "both",
};

const logLevel = {
	none: 0,
	error: 1,
	warn: 2,
	info: 3,
};

module.exports = {
	port: process.env.PORT || 3000,
	license: {
		licenseName: process.env.LICENSE_NAME,
		licenseKey: process.env.LICENSE_KEY,
	},
	rendering: {
		chunkPartialBufferSize: 5 * 1024 * 1024, // 5MB
		maxCoresPerVideo: OS_CORES,
		maxRamPerVideo: "4096",
		maxGpuPerVideo: "512",
		preferredDecodingAcceleration: "prefer-software",
		preferredEncodingAcceleration: "prefer-software",
		concurrencyMode: concurrencyMode.browser,
	},
	logging: {
		logMode: logMode.console,
		consoleLogLevel: logLevel.warn, // Only for console logging, file logs will contain everything
	},
	logMode,
	logLevel,
};
