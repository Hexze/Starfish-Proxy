const path = require('path');
const fs = require('fs');

class PluginManager {
    constructor(proxyManager, proxyAPI, baseDir) {
        this.proxyManager = proxyManager;
        this.proxyAPI = proxyAPI;
        this.BASE_DIR = baseDir;
        
        this.plugins = new Map();
        this.pluginStates = new Map();
        this.pluginDebugStates = new Map();
        this.pluginEventHandlers = new Map();
    }

    /**
     * Register a plugin with the system
     * @param {Object} pluginInfo - Plugin information object
     * @param {Object|null} instance - The plugin's class instance
     */
    registerPlugin(pluginInfo, instance = null) {
        if (!pluginInfo || !pluginInfo.name) return;

        const normalizedName = pluginInfo.name.toLowerCase();

        const handlers = this.pluginEventHandlers.get(normalizedName) || new Set();

        this.plugins.set(normalizedName, { info: pluginInfo, instance });
        this.pluginStates.set(normalizedName, true);
        if (!this.pluginDebugStates.has(normalizedName)) {
            this.pluginDebugStates.set(normalizedName, false);
        }
        this.pluginEventHandlers.set(normalizedName, handlers);

        console.log(`Registered plugin: ${pluginInfo.name} (enabled)`);

        if (instance && typeof instance.onEnable === 'function' && this.proxyManager.currentPlayer) {
            try {
                const state = this.proxyManager.getJoinState();
                instance.onEnable(state);
            } catch (e) {
                console.error(`Error during onEnable for ${normalizedName}:`, e);
            }
        }
    }

    /**
     * Enable or disable a plugin
     * @param {string} pluginName - Name of the plugin
     * @param {boolean} enabled - Whether to enable (true) or disable (false)
     */
    setPluginEnabled(pluginName, enabled) {
        if (!this.plugins.has(pluginName)) {
            return false;
        }
        
        const previouslyEnabled = this.pluginStates.get(pluginName);
        this.pluginStates.set(pluginName, enabled);

        const pluginData = this.plugins.get(pluginName);

        if (!enabled && previouslyEnabled) {
            if (pluginData.instance && typeof pluginData.instance.onDisable === 'function') {
                try {
                    pluginData.instance.onDisable();
                } catch (e) {
                    console.error(`Error during onDisable for ${pluginName}:`, e);
                }
            }
        }

        if (enabled && !previouslyEnabled) {
            if (pluginData.instance && typeof pluginData.instance.onEnable === 'function') {
                try {
                    const state = this.proxyManager.getJoinState();
                    pluginData.instance.onEnable(state);
                } catch (e) {
                    console.error(`Error during onEnable for ${pluginName}:`, e);
                }
            }
        }
        
        const status = enabled ? 'enabled' : 'disabled';
        console.log(`Plugin ${pluginName} ${status}`);
        return true;
    }
    
    /**
     * Check if a plugin is enabled
     * @param {string} pluginName - Name of the plugin
     * @returns {boolean} - True if enabled, false if disabled or not found
     */
    isPluginEnabled(pluginName) {
        return this.pluginStates.get(pluginName) || false;
    }

    /**
     * Enable or disable debug mode for a plugin
     * @param {string} pluginName - Name of the plugin
     * @param {boolean} debug - Whether to enable (true) or disable (false) debug mode
     */
    setPluginDebug(pluginName, debug) {
        if (!this.plugins.has(pluginName)) {
            return false;
        }
        
        this.pluginDebugStates.set(pluginName, debug);
        
        const status = debug ? 'enabled' : 'disabled';
        console.log(`Plugin ${pluginName} debug ${status}`);
        return true;
    }
    
    /**
     * Check if debug mode is enabled for a plugin
     * @param {string} pluginName - Name of the plugin
     * @returns {boolean} - True if debug enabled, false if disabled or not found
     */
    isPluginDebugEnabled(pluginName) {
        return this.pluginDebugStates.get(pluginName) || false;
    }

    /**
     * Get the standard plugin settings that should be injected into all plugin configs
     * @param {string} pluginName - Name of the plugin
     * @returns {Object} - Standard plugin settings schema section
     */
    getStandardPluginSettings(pluginName) {
        const pluginData = this.plugins.get(pluginName);
        const displayName = pluginData?.info.displayName || pluginName;

        return {
            label: `${displayName} Plugin`,
            resetAll: true,
            defaults: { enabled: true, debug: false },
            settings: [
                {
                    key: 'enabled',
                    type: 'toggle',
                    text: ['DISABLED', 'ENABLED'],
                    description: `Globally enables or disables the ${displayName} plugin.`
                },
                {
                    key: 'debug',
                    type: 'toggle',
                    displayLabel: 'Debug',
                    description: `Toggles verbose logging for the ${displayName} plugin.`
                }
            ]
        };
    }
    
    /**
     * Get all plugins and their states
     * @returns {Array} - Array of {name, displayName, enabled, debug} objects
     */
    getAllPluginStates() {
        const states = [];
        for (const [name, pluginData] of this.plugins.entries()) {
            states.push({
                name,
                displayName: pluginData.info.displayName || name,
                enabled: this.pluginStates.get(name) || false,
                debug: this.pluginDebugStates.get(name) || false
            });
        }
        return states;
    }

    /**
     * Get loaded plugins info
     * @returns {Array} - Array of plugin info objects
     */
    getLoadedPlugins() {
        return Array.from(this.plugins.values()).map(p => p.info);
    }

    /**
     * Register an event listener for a specific plugin
     * @param {string} pluginName - Name of the plugin registering the listener
     * @param {string} eventName - Name of the event
     * @param {function} listener - Event listener function
     */
    registerPluginEventListener(pluginName, eventName, listener) {
        if (!this.pluginEventHandlers.has(pluginName)) {
            this.pluginEventHandlers.set(pluginName, new Set());
        }
        
        this.pluginEventHandlers.get(pluginName).add(listener);
        this.proxyAPI.on(eventName, listener);
    }

    /**
     * Filter event listeners to only include enabled plugins
     * @param {Array} listeners - Array of event listeners
     * @returns {Array} - Filtered array of listeners from enabled plugins
     */
    filterEnabledListeners(listeners) {
        return listeners.filter(listener => {
            for (const [pluginName, handlers] of this.pluginEventHandlers.entries()) {
                if (handlers.has(listener) && !this.isPluginEnabled(pluginName)) {
                    return false;
                }
            }
            return true;
        });
    }

    /**
     * Add toggle command for plugin management to a commander.js module.
     * @param {Object} moduleCommand - Commander.js command object
     * @param {string} moduleName - Name of the plugin module
     */
    addPluginManagementCommands(moduleCommand, moduleName) {
        const toggleCommand = moduleCommand.createCommand('toggle');
        toggleCommand
            .description(`Toggle the ${moduleName} plugin on/off`)
            .action((client) => {
                const currentState = this.isPluginEnabled(moduleName);
                const newState = !currentState;
                
                if (this.setPluginEnabled(moduleName, newState)) {
                    const pluginData = this.plugins.get(moduleName);
                    const suffix = pluginData?.info?.suffix || `§8[§e${moduleName.toUpperCase()}§8]§r`;
                    const prefix = `§8[${this.proxyAPI.proxyPrefix}§8${suffix}§8]§r`;
                    const status = newState ? '§ais now enabled' : '§cis now disabled';
                    this.proxyManager.sendChatMessage(client, `${prefix} ${status}§7.`);
                } else {
                    this.proxyManager.sendChatMessage(client, `§cFailed to toggle ${moduleName} plugin.`);
                }
            });
        moduleCommand.addCommand(toggleCommand);
    }

    /**
     * Loads plugins from the 'scripts' directory.
     */
    loadPlugins() {
        const scriptsFolder = path.join(this.BASE_DIR, 'scripts');
        console.log(`Looking for scripts in: ${scriptsFolder}`);
        if (!fs.existsSync(scriptsFolder)) {
            console.log('Scripts folder not found. Create a "scripts" folder to add plugins.');
            return;
        }

        fs.readdirSync(scriptsFolder).forEach((file) => {
            if (file.endsWith('.js')) {
                try {
                    const pluginPath = path.join(scriptsFolder, file);
                    delete require.cache[require.resolve(pluginPath)];
                    const plugin = require(pluginPath);
                    if (typeof plugin === 'function') {
                        const pluginAPI = this.createPluginAPI(file);
                        plugin(pluginAPI);
                    }
                } catch (err) {
                    console.error(`Failed to load plugin ${file}: ${err.message}`);
                    console.error(err.stack);
                }
            }
        });
        console.log(`Loaded ${this.getLoadedPlugins().length} plugins.`);
    }

    /**
     * Creates a plugin-specific API wrapper that tracks event listeners
     * @param {string} filename - The plugin filename
     * @returns {Object} - Plugin-specific API wrapper
     */
    createPluginAPI(filename) {
        let pluginName = path.basename(filename, '.js');
        
        const pluginAPI = {
            get currentPlayer() { return this.proxyAPI.currentPlayer; },
            sendToClient: (...args) => this.proxyAPI.sendToClient(...args),
            sendToServer: (...args) => this.proxyAPI.sendToServer(...args),
            sendChatMessage: (...args) => this.proxyAPI.sendChatMessage(...args),
            registerPlugin: (pluginInfo, instance = null) => {
                if (pluginInfo && pluginInfo.name) {
                    const newName = pluginInfo.name.toLowerCase();
                    if (newName !== pluginName) {
                        const oldHandlers = this.pluginEventHandlers.get(pluginName);
                        if (oldHandlers) {
                            const existing = this.pluginEventHandlers.get(newName) || new Set();
                            for (const h of oldHandlers) existing.add(h);
                            this.pluginEventHandlers.set(newName, existing);
                            this.pluginEventHandlers.delete(pluginName);
                        }
                        pluginName = newName;
                    }
                }
                return this.registerPlugin(pluginInfo, instance);
            },
            getLoadedPlugins: (...args) => this.getLoadedPlugins(...args),
            registerCommands: (...args) => this.proxyAPI.registerCommands(...args),
            kickPlayer: (...args) => this.proxyAPI.kickPlayer(...args),
            isPluginEnabled: (...args) => this.isPluginEnabled(...args),
            isPluginDebugEnabled: (name = pluginName) => this.isPluginDebugEnabled(name),

            // Automatic prefix generation
            getPluginPrefix: () => {
                const pluginData = this.plugins.get(pluginName);
                const suffix = pluginData?.info?.suffix || `§8[§e${pluginName.toUpperCase()}§8]§r`;
                return `§8[${this.proxyAPI.proxyPrefix}§8${suffix}§8]§r`;
            },

            getLogPrefix: () => {
                const pluginData = this.plugins.get(pluginName);
                const displayName = pluginData?.info?.displayName || pluginName;
                return `[${displayName}]`;
            },

            getDebugPrefix: () => {
                const pluginData = this.plugins.get(pluginName);
                const displayName = pluginData?.info?.displayName || pluginName;
                return `[${displayName}-Debug]`;
            },

            log: (message, ...args) => {
                const prefix = pluginAPI.getLogPrefix();
                console.log(`${prefix} ${message}`, ...args);
            },

            debugLog: (message, ...args) => {
                if (this.isPluginDebugEnabled(pluginName)) {
                    const prefix = pluginAPI.getDebugPrefix();
                    console.log(`${prefix} ${message}`, ...args);
                }
            },

            on: (eventName, listener) => {
                this.registerPluginEventListener(pluginName, eventName, listener);
                return pluginAPI;
            },

            once: (eventName, listener) => {
                const onceWrapper = (...args) => {
                    const handlers = this.pluginEventHandlers.get(pluginName);
                    if (handlers) {
                        handlers.delete(onceWrapper);
                    }
                    listener(...args);
                };
                this.registerPluginEventListener(pluginName, eventName, onceWrapper);
                return pluginAPI;
            },

            off: (eventName, listener) => {
                const handlers = this.pluginEventHandlers.get(pluginName);
                if (handlers) {
                    handlers.delete(listener);
                }
                this.proxyAPI.off(eventName, listener);
                return pluginAPI;
            },

            removeListener: (eventName, listener) => {
                return pluginAPI.off(eventName, listener);
            }
        };

        Object.setPrototypeOf(pluginAPI, Object.getPrototypeOf(this.proxyAPI));
        pluginAPI.proxyAPI = this.proxyAPI;
        pluginAPI.pluginManager = this;

        return pluginAPI;
    }
}

module.exports = PluginManager; 