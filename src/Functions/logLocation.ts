import { inspect } from 'node:util';
import type { Logger, LogLevel } from '../Logger.js';

export default function (this: Logger, level: LogLevel, text?: string) {
 const error = inspect(new Error());
 const callStack = error
  .split(/\n/g)
  .filter((l, i) => i !== 0 && !l.includes('ScopedLogger'))
  .map((l) => l.replace('at ', '').split('(file:///')[0].trim())
  .slice(0, 4)
  .join(' <= ');

 this.writeLog(level, `== Trace == ${text ? `[${text}]: ` : ''}${callStack} ==`);
}
