/* eslint-disable @typescript-eslint/naming-convention */
import { createWriteStream, mkdirSync } from 'fs';

export enum LogLevel {
 silly = 'silly', // silly, debug, info, warn, error
 debug = 'debug', // debug, info, warn, error
 info = 'info', // info, warn, error
 warn = 'warn', // warn, error
 error = 'error', // error
 silent = 'silent', // no logs
}

class Logger {
 level: LogLevel = LogLevel.info;
 readonly file = createWriteStream(
  `logs/console_${new Date().getDate()}-${new Date().getMonth() + 1}-${new Date().getFullYear()}.log`,
  { flags: 'a' },
 );

 constructor() {
  mkdirSync('logs', { recursive: true });
  this.file.write(`\n\n\n===== New Session: ${new Date().toLocaleString()} =====\n\n`);

  const logLevel =
   (process.argv.find((arg) => arg.startsWith('--log-level='))?.split('=')[1] as LogLevel) ||
   (() => {
    this.log('No log level specified, defaulting to "info"');
    return LogLevel.info;
   })();

  if (!LogLevel[logLevel]) throw new Error(`Invalid log level: ${logLevel}`);

  if (logLevel) this.level = logLevel;

  this.log(`[Logger] Log level set to: ${this.level}`);
 }

 writeLog = (level: LogLevel, ...data: unknown[]) => {
  if (this.level === LogLevel.silent) return;

  const levels = Object.values(LogLevel);
  if (levels.indexOf(level) < levels.indexOf(this.level)) return;

  const message = data.map(Logger.stringify).join(' ');
  this.file.write(`${this.getDebugInfo()} ${message}\n`);
  // eslint-disable-next-line no-console
  console.log(message);
 };

 log = (...data: unknown[]) => this.writeLog(LogLevel.info, ...data);

 debug = (...data: unknown[]) => this.writeLog(LogLevel.debug, ...data);

 warn = (...data: unknown[]) => this.writeLog(LogLevel.warn, ...data);

 error = (...data: unknown[]) => this.writeLog(LogLevel.error, ...data);

 silly = (...data: unknown[]) => this.writeLog(LogLevel.silly, ...data);

 static stringify = (data: unknown) => {
  if (typeof data === 'string') return data;

  try {
   return JSON.stringify(data, null, 2);
  } catch {
   return JSON.stringify(data, (_, val) => (typeof val === 'bigint' ? val.toString() : val), 2);
  }
 };

 getDebugInfo = () => {
  const dateObject = new Date();

  const time = dateObject.toLocaleTimeString([], {
   hour: '2-digit',
   minute: '2-digit',
   second: '2-digit',
  });

  const timestamp = dateObject.getTime();

  return `${this.level} [${time} | ${timestamp}]`;
 };
}

const logger = new Logger();
export default logger;
