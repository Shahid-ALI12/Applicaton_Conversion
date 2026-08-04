import pino from 'pino';
import { config } from './config.js';

const transports = config.isProd
  ? { destination: process.env.LOG_FILE ?? 1, sync: false }
  : { transport: { target: 'pino/file', options: { destination: 1 }, level: config.logLevel } };

export const logger = pino({
  level: config.logLevel,
  ...(config.isProd ? {} : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
});
