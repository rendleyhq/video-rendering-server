const dotenv = require("dotenv");
const os = require("os");

const OS_CORES = os.cpus().length;
const OS_RAM = os.totalmem();

dotenv.config();

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
  },
};
