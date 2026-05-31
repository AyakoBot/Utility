import { inspect } from 'util';

import logLocation from './Functions/logLocation.js';
import logger, { Logger, LogLevel } from './Logger.js';

export default class ScopedLogger extends Logger {
 logger = logger;
 level = LogLevel.info;

 constructor() {
  super();
 }

 setLevel(logLevel: LogLevel) {
  this.level = logLevel;
 }

 writeLog = (level: LogLevel, ...data: unknown[]) => {
  if (this.level === LogLevel.silent) return;

  const levels = Object.values(LogLevel);
  if (levels.indexOf(level) < levels.indexOf(this.level)) return;

  const message = data.map(Logger.stringify).join(' ');
  this.file.write(`${this.getDebugInfo()} ${inspect(message)}\n`);
  // eslint-disable-next-line no-console
  console.log(`[${level}]`, inspect(message));
 };

 logLocation = (level: LogLevel, message?: string) => {
  logLocation.call(this, level, message);
 };
}
