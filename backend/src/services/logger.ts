import fs from "fs";
import os from "os";
import path from "path";

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB max before rotation

let resolvedLogFile: string | null | undefined;

function canWriteToDirectory(dir: string): boolean {
	try {
		fs.mkdirSync(dir, { recursive: true });
		fs.accessSync(dir, fs.constants.W_OK);
		return true;
	} catch {
		return false;
	}
}

function getLogFile(): string | null {
	if (resolvedLogFile !== undefined) {
		return resolvedLogFile;
	}

	const candidates = [
		process.env.APP_LOG_DIR,
		process.env.LOG_DIR,
		path.resolve(process.cwd(), "logs"),
		path.resolve(process.cwd(), "tmp", "logs"),
		path.join(os.tmpdir(), "studentportal-logs"),
	].filter((dir): dir is string => Boolean(dir));

	for (const dir of candidates) {
		if (canWriteToDirectory(dir)) {
			resolvedLogFile = path.join(dir, "app.log");
			return resolvedLogFile;
		}
	}

	resolvedLogFile = null;
	return null;
}

function getTimestamp(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function rotateIfNeeded(): void {
	try {
		const logFile = getLogFile();
		if (!logFile) return;

		if (fs.existsSync(logFile)) {
			const stats = fs.statSync(logFile);
			if (stats.size > MAX_LOG_SIZE) {
				const rotated = logFile + ".old";
				if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
				fs.renameSync(logFile, rotated);
			}
		}
	} catch {
		// Ignore rotation errors
	}
}

function writeToFile(level: string, message: string, ...args: any[]): void {
	try {
		const logFile = getLogFile();
		if (!logFile) return;

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
		fs.appendFileSync(logFile, line, "utf8");
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
