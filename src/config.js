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
            this.validate();
            console.log('✅ Configuration loaded successfully');
        } catch (error) {
            console.error(`❌ Failed to load config: ${error.message}`);
            process.exit(1);
        }
    }

    validate() {
        const required = ['developer.jid'];
        for (const key of required) {
            if (!this.get(key)) {
                throw new Error(`Missing required config: ${key}`);
            }
        }
        console.log('✅ Configuration validation passed');
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
