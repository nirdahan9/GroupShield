// src/logger.js - Advanced Logging with Winston
const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Create logs directory if not exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for Israeli timezone
const israelTimeFormat = winston.format((info) => {
    info.timestamp = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    return info;
});

const consoleFormat = winston.format.combine(
    israelTimeFormat(),
    winston.format.colorize(),
    winston.format.printf(({ level, message, timestamp }) => {
        return `[${timestamp}] ${level}: ${message}`;
    })
);

const fileFormat = winston.format.combine(
    israelTimeFormat(),
    winston.format.printf(({ level, message, timestamp }) => {
        return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    })
);

const logger = winston.createLogger({
    level: config.get('logging.level', 'info'),
    transports: []
});

if (config.get('logging.console', true)) {
    logger.add(new winston.transports.Console({ format: consoleFormat }));
}

if (config.get('logging.file.enabled', true)) {
    logger.add(new winston.transports.File({
        filename: path.join(__dirname, '../', config.get('logging.file.generalLog', 'logs/bot.log')),
        format: fileFormat,
        level: 'info'
    }));
    logger.add(new winston.transports.File({
        filename: path.join(__dirname, '../', config.get('logging.file.errorLog', 'logs/error.log')),
        format: fileFormat,
        level: 'error'
    }));
}

function appendLog(filePath, text) {
    const time = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    fs.appendFile(filePath, `[${time}] ${text}\n`, 'utf8', (err) => {
        if (err) {
            logger.error(`Failed to append log file ${filePath}: ${err.message}`);
        }
    });
}

let criticalErrorCallback = null;

function onCriticalError(callback) {
    criticalErrorCallback = callback;
}

function critical(message, error = null) {
    const fullMessage = error ? `${message}: ${error.message}` : message;
    logger.error(`🚨 CRITICAL: ${fullMessage}`);
    if (criticalErrorCallback) {
        criticalErrorCallback(fullMessage, error);
    }
}

function auditLog(adminJid, action, details, success = true) {
    const auditFile = path.join(__dirname, '../', config.get('logging.file.auditLog', 'audit_log.txt'));
    const time = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    const status = success ? 'SUCCESS' : 'FAILED';
    const adminNumber = adminJid ? adminJid.split('@')[0] : 'system';
    const normalized = typeof details === 'object' && details !== null
        ? details
        : { message: String(details || '') };
    const message = normalized.message || normalized.details || '';
    const meta = { ...normalized };
    delete meta.message;
    delete meta.details;
    const metaStr = Object.keys(meta).length > 0 ? ` | meta=${JSON.stringify(meta)}` : '';
    const logLine = `[${time}] [${adminNumber}] [${action}] [${status}] ${message}${metaStr}`;
    fs.appendFile(auditFile, logLine + '\n', 'utf8', (err) => {
        if (err) {
            logger.error(`Failed to append audit log: ${err.message}`);
        }
    });
    logger.info(`AUDIT: ${action} by ${adminNumber}`);
}

module.exports = {
    debug: (msg) => logger.debug(msg),
    info: (msg) => logger.info(msg),
    warn: (msg) => logger.warn(msg),
    error: (msg, err = null) => logger.error(err ? `${msg}: ${err.message}` : msg),
    critical,
    onCriticalError,
    appendLog,
    auditLog,
    log: (msg) => logger.info(msg)
};
