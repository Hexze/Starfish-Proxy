const fs = require('fs');
const path = require('path');
const { getPluginConfigDir } = require('../utils/paths');
const { getCryptoManager } = require('../utils/crypto');

class Core {
    constructor(proxy, metadata) {
        this.proxy = proxy;
        this.metadata = metadata;
        this.enabled = true;
        this.debug = false;
        
        this._initializeConfig();
    }
    
    _initializeConfig() {
        if (!this.metadata?.path) {
            this.config = {
                get: () => ({}),
                set: () => true
            };
            return;
        }
        
        const configPath = path.join(getPluginConfigDir(), `${this.metadata.name}.config.json`);
        
        const defaultConfig = {
            enabled: true,
            debug: false
        };
        
        let config = defaultConfig;
        if (fs.existsSync(configPath)) {
            try {
                const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                config = { ...defaultConfig, ...saved };
            } catch (e) {
                this.log(`Failed to load config: ${e.message}`);
            }
        }
        
        try {
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        } catch (e) {
            this.log(`Failed to save config: ${e.message}`);
        }
        
        this.enabled = config.enabled;
        this.debug = config.debug;
        this.hypixelSafeMode = true;
        
        this.config = {
            get: (key) => {
                try {
                    const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    let value = key ? this._getNestedValue(current, key) : current;
                    
                    if (key && this._isEncryptedField(key) && typeof value === 'string' && this._isEncryptedData(value)) {
                        value = this._decryptValue(value);
                    }
                    
                    return value;
                } catch (e) {
                    return key ? this._getNestedValue(defaultConfig, key) : defaultConfig;
                }
            },
            
            set: (key, value) => {
                try {
                    const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    
                    let valueToStore = value;
                    if (this._isEncryptedField(key) && typeof value === 'string' && value !== '') {
                        valueToStore = this._encryptValue(value);
                    }
                    
                    this._setNestedValue(current, key, valueToStore);
                    fs.writeFileSync(configPath, JSON.stringify(current, null, 2));
                    
                    if (key === 'enabled') this.enabled = value;
                    if (key === 'debug') this.debug = value;
                    
                    return true;
                } catch (e) {
                    this.log(`Failed to save config: ${e.message}`);
                    return false;
                }
            },

            setEncrypted: (key, value) => {
                try {
                    const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    
                    let valueToStore = value;
                    if (typeof value === 'string' && value !== '') {
                        valueToStore = this._encryptValue(value);
                    }
                    
                    this._setNestedValue(current, key, valueToStore);
                    fs.writeFileSync(configPath, JSON.stringify(current, null, 2));
                    
                    return true;
                } catch (e) {
                    this.log(`Failed to save encrypted config: ${e.message}`);
                    return false;
                }
            },

            getDecrypted: (key) => {
                try {
                    const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    let value = this._getNestedValue(current, key);
                    
                    if (typeof value === 'string' && this._isEncryptedData(value)) {
                        value = this._decryptValue(value);
                    }
                    
                    return value;
                } catch (e) {
                    return undefined;
                }
            }
        };
    }
    
    _getNestedValue(obj, path) {
        if (!path) return obj;
        const keys = path.split('.');
        let current = obj;
        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return undefined;
            }
        }
        return current;
    }
    
    _setNestedValue(obj, path, value) {
        const keys = path.split('.');
        let current = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        current[keys[keys.length - 1]] = value;
    }

    _isEncryptedField(key) {
        if (!this.configSchema || !Array.isArray(this.configSchema)) {
            return false;
        }

        for (const section of this.configSchema) {
            if (section.settings && Array.isArray(section.settings)) {
                const setting = section.settings.find(s => s.key === key);
                if (setting && setting.encrypted === true) {
                    return true;
                }
            }
        }
        return false;
    }

    _encryptValue(value) {
        try {
            const crypto = getCryptoManager();
            return crypto.encrypt(value);
        } catch (error) {
            this.log(`Failed to encrypt value: ${error.message}`);
            return value;
        }
    }

    _decryptValue(value) {
        try {
            const crypto = getCryptoManager();
            return crypto.decrypt(value);
        } catch (error) {
            this.log(`Failed to decrypt value: ${error.message}`);
            return value;
        }
    }

    _isEncryptedData(value) {
        const crypto = getCryptoManager();
        return crypto.isEncrypted(value);
    }
    
        log(message) {
        const pluginName = this.metadata?.displayName || 'Proxy';
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [${pluginName}] ${message}`);
    }

    debugLog(message) {
        const currentDebug = this.config.get('debug');
        if (currentDebug) {
            const pluginName = this.metadata?.displayName || 'Proxy';
            const timestamp = new Date().toLocaleTimeString();
            console.log(`[${timestamp}] [${pluginName}] [DEBUG] ${message}`);
        }
    }
    
    initializeConfig(schema) {
        this.configSchema = schema;
        
        if (schema && Array.isArray(schema)) {
            const current = this.config.get();
            
            schema.forEach(section => {
                if (section.defaults) {
                    this._mergeDefaults(current, section.defaults);
                }
            });
            
            const configPath = path.join(getPluginConfigDir(), `${this.metadata.name}.config.json`);
            try {
                fs.writeFileSync(configPath, JSON.stringify(current, null, 2));
            } catch (e) {
                this.log(`Failed to save config: ${e.message}`);
            }
        }
    }
    
    _mergeDefaults(current, defaults) {
        for (const [key, value] of Object.entries(defaults)) {
            if (!(key in current)) {
                current[key] = value;
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                if (typeof current[key] !== 'object' || current[key] === null) {
                    current[key] = {};
                }
                this._mergeDefaults(current[key], value);
            }
        }
    }
    
    saveCurrentConfig() {
        const current = this.config.get();
        Object.keys(current).forEach(key => {
            this.config.set(key, current[key]);
        });
        return true;
    }
    
    isHypixelSafe(methodName) {
        if (!this.hypixelSafeMode) return true;
        
        const unsafeMethods = new Set([
            'sendPosition', 'sendHealth', 'sendExperience', 'sendAbilities',
            'spawnPlayer', 'spawnLiving', 'spawnObject', 'spawnExperienceOrb',
            'setEntityVelocity', 'teleportEntity', 'moveEntity', 'setEntityLook',
            'setEntityLookAndMove', 'setEntityHeadRotation', 'setEntityEquipment',
            'addEntityEffect', 'removeEntityEffect', 'setEntityStatus', 
            'setEntityMetadata', 'animateEntity', 'collectEntity', 'attachEntity',
            
            'openWindow', 'closeWindow', 'setSlot', 'setWindowItems', 'sendTransaction',
            'sendCraftProgress', 'setHeldItemSlot', 'creativeInventoryAction', 'enchantItem',
            'createChest', 'createHopper', 'createDispenser', 'fillWindow', 'clearWindow',
            
            'sendExplosion', 'sendBlockChange', 'sendMultiBlockChange', 'sendWorldEvent',
            'sendTimeUpdate', 'sendSpawnPosition', 'sendGameStateChange',
            
            'kick', 'sendLogin'
        ]);
        
        return !unsafeMethods.has(methodName);
    }
    
    logHypixelBlock(methodName) {
        if (this.debug) {
            this.log(`Method '${methodName}' blocked by safe mode.`);
        }
    }
}

module.exports = Core; 