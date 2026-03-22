// src/config.js - Configuration Management
const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor(configPath = null) {
        this.configPath = configPath || path.join(__dirname, '../config.json');
        this.config = null;
        this.load();
    }

    load() {
        try {
            const raw = fs.readFileSync(this.configPath, 'utf8');
            this.config = JSON.parse(raw);

            // Merge local overrides (config.local.json) — not committed to git
            const localPath = this.configPath.replace('config.json', 'config.local.json');
            if (fs.existsSync(localPath)) {
                const localRaw = fs.readFileSync(localPath, 'utf8');
                const local = JSON.parse(localRaw);
                this.config = this._deepMerge(this.config, local);
            }

            this.validate();
        } catch (error) {
            process.stderr.write(`❌ Failed to load config: ${error.message}\n`);
            process.exit(1);
        }
    }

    _deepMerge(base, override) {
        const result = { ...base };
        for (const key of Object.keys(override)) {
            if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])) {
                result[key] = this._deepMerge(base[key] || {}, override[key]);
            } else {
                result[key] = override[key];
            }
        }
        return result;
    }

    validate() {
        const required = ['developer.jid'];
        for (const key of required) {
            if (!this.get(key)) {
                throw new Error(`Missing required config: ${key}`);
            }
        }
    }

    get(key, defaultValue = null) {
        const keys = key.split('.');
        let value = this.config;
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return defaultValue;
            }
        }
        return value;
    }

    getDeveloperJid() {
        return this.get('developer.jid');
    }

    isDeveloper(jid) {
        return jid === this.getDeveloperJid();
    }
}

module.exports = new ConfigManager();
