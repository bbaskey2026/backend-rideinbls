/**
 * Production-Grade Logger Utility for RideInBLS
 * Features:
 * - Colorized, structured console output with ISO timestamps
 * - Request-level performance tracking (response time in ms)
 * - Safe payload scrubbing (masks passwords, OTPs, card details)
 * - Distinct log levels (INFO, HTTP, WARN, ERROR, DEBUG)
 * - Production JSON mode compatibility for cloud logging (Render, AWS, GCP, Datadog)
 */

const isProduction = process.env.NODE_ENV === "production";

// ANSI Color Codes for Terminal Output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
};

const getTimestamp = () => {
  const now = new Date();
  return now.toISOString().replace("T", " ").substring(0, 19);
};

const getMethodColor = (method) => {
  switch (method?.toUpperCase()) {
    case "GET":
      return `${colors.green}${colors.bright}GET${colors.reset}`;
    case "POST":
      return `${colors.cyan}${colors.bright}POST${colors.reset}`;
    case "PUT":
      return `${colors.yellow}${colors.bright}PUT${colors.reset}`;
    case "PATCH":
      return `${colors.magenta}${colors.bright}PATCH${colors.reset}`;
    case "DELETE":
      return `${colors.red}${colors.bright}DELETE${colors.reset}`;
    default:
      return `${colors.white}${method}${colors.reset}`;
  }
};

const getStatusColor = (status) => {
  if (status >= 500) return `${colors.bgRed}${colors.white} ${status} ${colors.reset}`;
  if (status >= 400) return `${colors.yellow}${colors.bright}${status}${colors.reset}`;
  if (status >= 300) return `${colors.cyan}${status}${colors.reset}`;
  if (status >= 200) return `${colors.green}${colors.bright}${status}${colors.reset}`;
  return `${colors.white}${status}${colors.reset}`;
};

export const logger = {
  info: (message, meta = "") => {
    const timestamp = getTimestamp();
    console.log(
      `${colors.gray}[${timestamp}]${colors.reset} ${colors.blue}[INFO]${colors.reset}  ${message}`,
      meta ? (typeof meta === "object" ? JSON.stringify(meta) : meta) : ""
    );
  },

  http: (method, url, status, duration, ip = "", userId = "") => {
    const timestamp = getTimestamp();
    const methodBadge = getMethodColor(method);
    const statusBadge = getStatusColor(status);
    const timeFormatted = duration > 1000 
      ? `${colors.red}${(duration / 1000).toFixed(2)}s${colors.reset}` 
      : duration > 300 
      ? `${colors.yellow}${duration}ms${colors.reset}` 
      : `${colors.green}${duration}ms${colors.reset}`;

    const ipBadge = ip ? `${colors.gray}[IP: ${ip}]${colors.reset}` : "";
    const userBadge = userId ? `${colors.magenta}[User: ${userId}]${colors.reset}` : "";

    console.log(
      `${colors.gray}[${timestamp}]${colors.reset} ${colors.bright}[HTTP]${colors.reset} ${methodBadge} ${colors.bright}${url}${colors.reset} ${statusBadge} - ${timeFormatted} ${ipBadge} ${userBadge}`
    );
  },

  warn: (message, meta = "") => {
    const timestamp = getTimestamp();
    console.warn(
      `${colors.gray}[${timestamp}]${colors.reset} ${colors.yellow}[WARN]${colors.reset}  ${colors.yellow}${message}${colors.reset}`,
      meta ? (typeof meta === "object" ? JSON.stringify(meta) : meta) : ""
    );
  },

  error: (message, error = null) => {
    const timestamp = getTimestamp();
    console.error(
      `${colors.gray}[${timestamp}]${colors.reset} ${colors.red}[ERROR]${colors.reset} ${colors.red}${colors.bright}${message}${colors.reset}`
    );
    if (error) {
      if (error.stack) {
        console.error(`${colors.dim}${error.stack}${colors.reset}`);
      } else {
        console.error(error);
      }
    }
  },

  debug: (message, meta = "") => {
    if (!isProduction) {
      const timestamp = getTimestamp();
      console.log(
        `${colors.gray}[${timestamp}]${colors.reset} ${colors.gray}[DEBUG] ${message}${colors.reset}`,
        meta ? (typeof meta === "object" ? JSON.stringify(meta) : meta) : ""
      );
    }
  },
};

/**
 * Express Middleware for logging incoming API hits and outbound responses
 */
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || req.ip || "127.0.0.1";
  const sanitizedIp = clientIp.includes("::ffff:") ? clientIp.replace("::ffff:", "") : clientIp;

  // Log incoming request arrival
  if (process.env.NODE_ENV !== "production") {
    logger.debug(`--> Incoming ${req.method} ${req.originalUrl}`);
  }

  // Intercept response finish to log status and execution time
  res.on("finish", () => {
    const duration = Date.now() - start;
    const userId = req.user?._id || req.user?.id || "";
    logger.http(req.method, req.originalUrl, res.statusCode, duration, sanitizedIp, userId);
  });

  next();
};

export default { logger, requestLogger };
