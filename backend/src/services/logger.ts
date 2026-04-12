import fs from "fs";
import path from "path";

const LOG_DIR = path.resolve(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB max before rotation

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
	fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getTimestamp(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function rotateIfNeeded(): void {
	try {
		if (fs.existsSync(LOG_FILE)) {
			const stats = fs.statSync(LOG_FILE);
			if (stats.size > MAX_LOG_SIZE) {
				const rotated = LOG_FILE + ".old";
				if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
				fs.renameSync(LOG_FILE, rotated);
			}
		}
	} catch {
		// Ignore rotation errors
	}
}

function writeToFile(level: string, message: string, ...args: any[]): void {
	try {
		rotateIfNeeded();
		const extra =
			args.length > 0
				? " " +
					args
						.map((a) =>
							a instanceof Error
								? `${a.message}\n${a.stack}`
								: typeof a === "object"
									? JSON.stringify(a, null, 2)
									: String(a),
						)
						.join(" ")
				: "";
		const line = `[${getTimestamp()}] [${level}] ${message}${extra}\n`;
		fs.appendFileSync(LOG_FILE, line, "utf8");
	} catch {
		// If file logging fails, silently ignore
	}
}

const logger = {
	/** Log info to file only (not terminal) */
	info(message: string, ...args: any[]): void {
		writeToFile("INFO", message, ...args);
	},

	/** Log warning to file only */
	warn(message: string, ...args: any[]): void {
		writeToFile("WARN", message, ...args);
	},

	/** Log error to file only */
	error(message: string, ...args: any[]): void {
		writeToFile("ERROR", message, ...args);
	},

	/** Log debug to file only */
	debug(message: string, ...args: any[]): void {
		writeToFile("DEBUG", message, ...args);
	},
};

export default logger;
