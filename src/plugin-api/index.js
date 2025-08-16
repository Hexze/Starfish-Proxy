const Core = require('./core');
const Players = require('./api/player');
const Events = require('./events');
const DisplayNames = require('./display-names');
const Communication = require('./api/chat');
const Commands = require('./api/command');
const World = require('./api/world');
const Entities = require('./api/entity');
const Inventory = require('./api/inventory');
const Movement = require('./api/movement');
const Misc = require('./api/misc');
const Hypixel = require('./api/hypixel');
const Helpers = require('./api/helpers');
const fs = require('fs');
const path = require('path');
const {getPluginsDir} = require('../utils/paths');
const {VersionUtils} = require('../utils/version-utils');
const {DependencyResolver} = require('../utils/dependency-resolver');
const {PluginSignatureVerifier} = require('./security/verifier');
const packageJson = require('../../package.json');


class PluginAPI {
    constructor(proxy, metadata) {
        this.proxy = proxy;
        this.metadata = metadata;
        this.loadedPlugins = [];
        this.proxyVersion = packageJson.version;
        this.dependencyResolver = new DependencyResolver();
        this.signatureVerifier = new PluginSignatureVerifier();

        this.pluginStates = new Map();
        this.pluginInstances = new Map();

        this.core = new Core(proxy, metadata);
        this.playersModule = new Players(proxy, this.core);
        this.events = new Events(proxy, this.core);
        this.displayNames = new DisplayNames(proxy, this.core, this.events);
        this.communicationModule = new Communication(proxy, this.core);
        this.commandsModule = new Commands(proxy, this.core);
        this.worldModule = new World(proxy, this.core);
        this.entitiesModule = new Entities(proxy, this.core);
        this.inventoryModule = new Inventory(proxy, this.core);
        this.movementModule = new Movement(proxy, this.core);
        this.miscModule = new Misc(proxy, this.core);
        this.hypixelModule = new Hypixel(proxy, this.core);
        this.helpersModule = new Helpers(proxy, this.core);

        this.config = this.core.config;
        this.log = this.core.log.bind(this.core);
        this.debugLog = this.core.debugLog.bind(this.core);

        this.on = this.events.on.bind(this.events);
        this.emit = this.events.emit.bind(this.events);
        this.intercept = this.events.intercept.bind(this.events);
        this.everyTick = this.events.everyTick.bind(this.events);

        // chat methods
        this.chat = this.communicationModule.chat.bind(this.communicationModule);
        this.chatInteractive = this.communicationModule.chatInteractive.bind(this.communicationModule);
        this.sendTitle = this.communicationModule.sendTitle.bind(this.communicationModule);
        this.sendActionBar = this.communicationModule.sendActionBar.bind(this.communicationModule);
        this.sendTabComplete = this.communicationModule.sendTabComplete.bind(this.communicationModule);
        this.sendChatToServer = this.communicationModule.sendChatToServer.bind(this.communicationModule);

        // world methods
        this.sound = this.worldModule.sendSound.bind(this.worldModule);
        this.sendParticle = this.worldModule.sendParticle.bind(this.worldModule);

        // misc methods
        this.kick = this.miscModule.kick.bind(this.miscModule);
        this.sendKeepAlive = this.miscModule.sendKeepAlive.bind(this.miscModule);
        this.sendCustomPayload = this.miscModule.sendCustomPayload.bind(this.miscModule);
        this.sendLogin = this.miscModule.sendLogin.bind(this.miscModule);

        // hypixel methods
        this.getPartyInfo = this.hypixelModule.getPartyInfo.bind(this.hypixelModule);
        this.getPartyInfoAsync = this.hypixelModule.getPartyInfoAsync.bind(this.hypixelModule);
        this.isInParty = this.hypixelModule.isInParty.bind(this.hypixelModule);
        this.getPlayerRole = this.hypixelModule.getPlayerRole.bind(this.hypixelModule);
        this.getPing = this.hypixelModule.getPing.bind(this.hypixelModule);
        this.getPingAsync = this.hypixelModule.getPingAsync.bind(this.hypixelModule);

        // inventory/GUI methods
        this.openWindow = this.inventoryModule.openWindow.bind(this.inventoryModule);
        this.closeWindow = this.inventoryModule.closeWindow.bind(this.inventoryModule);
        this.setSlot = this.inventoryModule.setSlot.bind(this.inventoryModule);
        this.setWindowItems = this.inventoryModule.setWindowItems.bind(this.inventoryModule);
        this.sendTransaction = this.inventoryModule.sendTransaction.bind(this.inventoryModule);
        this.sendCraftProgress = this.inventoryModule.sendCraftProgress.bind(this.inventoryModule);
        this.setHeldItemSlot = this.inventoryModule.setHeldItemSlot.bind(this.inventoryModule);
        this.creativeInventoryAction = this.inventoryModule.creativeInventoryAction.bind(this.inventoryModule);
        this.enchantItem = this.inventoryModule.enchantItem.bind(this.inventoryModule);
        this.createChest = this.inventoryModule.createChest.bind(this.inventoryModule);
        this.createHopper = this.inventoryModule.createHopper.bind(this.inventoryModule);
        this.createDispenser = this.inventoryModule.createDispenser.bind(this.inventoryModule);
        this.fillWindow = this.inventoryModule.fillWindow.bind(this.inventoryModule);
        this.clearWindow = this.inventoryModule.clearWindow.bind(this.inventoryModule);

        Object.defineProperty(this, 'debug', {
            get: () => this.core.debug
        });

        Object.defineProperty(this, 'players', {
            get: () => this.playersModule.getPlayers()
        });

        // player query methods
        this.getPlayer = this.playersModule.getPlayer.bind(this.playersModule);
        this.getPlayerByName = this.playersModule.getPlayerByName.bind(this.playersModule);
        this.getCurrentPlayer = this.playersModule.getCurrentPlayer.bind(this.playersModule);
        this.getPlayerInfo = this.playersModule.getPlayerInfo.bind(this.playersModule);
        this.calculateDistance = this.playersModule.calculateDistance.bind(this.playersModule);
        this.getPlayersWithinDistance = this.playersModule.getPlayersWithinDistance.bind(this.playersModule);
        this.getPlayersInTeam = this.playersModule.getPlayersInTeam.bind(this.playersModule);

        // player state methods
        this.sendHealth = this.playersModule.sendHealth.bind(this.playersModule);
        this.sendExperience = this.playersModule.sendExperience.bind(this.playersModule);
        this.sendAbilities = this.playersModule.sendAbilities.bind(this.playersModule);
        this.sendPlayerInfo = this.playersModule.sendPlayerInfo.bind(this.playersModule);

        // movement methods
        this.sendPosition = this.movementModule.sendPosition.bind(this.movementModule);

        // entity methods
        this.spawnPlayer = this.entitiesModule.spawnPlayer.bind(this.entitiesModule);
        this.spawnLiving = this.entitiesModule.spawnLiving.bind(this.entitiesModule);
        this.spawnObject = this.entitiesModule.spawnObject.bind(this.entitiesModule);
        this.spawnExperienceOrb = this.entitiesModule.spawnExperienceOrb.bind(this.entitiesModule);
        this.setEntityVelocity = this.entitiesModule.setVelocity.bind(this.entitiesModule);
        this.teleportEntity = this.entitiesModule.teleport.bind(this.entitiesModule);
        this.moveEntity = this.entitiesModule.move.bind(this.entitiesModule);
        this.setEntityLook = this.entitiesModule.look.bind(this.entitiesModule);
        this.setEntityLookAndMove = this.entitiesModule.lookAndMove.bind(this.entitiesModule);
        this.setEntityHeadRotation = this.entitiesModule.setHeadRotation.bind(this.entitiesModule);
        this.setEntityEquipment = this.entitiesModule.setEquipment.bind(this.entitiesModule);
        this.addEntityEffect = this.entitiesModule.addEffect.bind(this.entitiesModule);
        this.removeEntityEffect = this.entitiesModule.removeEffect.bind(this.entitiesModule);
        this.setEntityStatus = this.entitiesModule.setStatus.bind(this.entitiesModule);
        this.setEntityMetadata = this.entitiesModule.setMetadata.bind(this.entitiesModule);
        this.animateEntity = this.entitiesModule.animate.bind(this.entitiesModule);
        this.collectEntity = this.entitiesModule.collect.bind(this.entitiesModule);
        this.attachEntity = this.entitiesModule.attach.bind(this.entitiesModule);

        // world methods
        this.getTeams = this.worldModule.getTeams.bind(this.worldModule);
        this.getPlayerTeam = this.worldModule.getPlayerTeam.bind(this.worldModule);
        this.sendExplosion = this.worldModule.sendExplosion.bind(this.worldModule);
        this.sendBlockChange = this.worldModule.sendBlockChange.bind(this.worldModule);
        this.sendMultiBlockChange = this.worldModule.sendMultiBlockChange.bind(this.worldModule);
        this.sendWorldEvent = this.worldModule.sendWorldEvent.bind(this.worldModule);
        this.sendTimeUpdate = this.worldModule.sendTimeUpdate.bind(this.worldModule);
        this.sendSpawnPosition = this.worldModule.sendSpawnPosition.bind(this.worldModule);
        this.sendGameStateChange = this.worldModule.sendGameStateChange.bind(this.worldModule);

        // scoreboardmethods
        this.sendScoreboardObjective = this.miscModule.sendScoreboardObjective.bind(this.miscModule);
        this.sendScoreboardScore = this.miscModule.sendScoreboardScore.bind(this.miscModule);
        this.sendScoreboardDisplay = this.miscModule.sendScoreboardDisplay.bind(this.miscModule);
        this.sendScoreboardTeam = this.miscModule.sendScoreboardTeam.bind(this.miscModule);
    }

    setPluginEnabled(pluginName, enabled) {
        const pluginState = this.pluginStates.get(pluginName);
        if (!pluginState) return {success: false, reason: 'Plugin not found'};

        if (!enabled) {
            const canDisable = this.dependencyResolver.canDisablePlugin(pluginName, this.pluginStates);
            if (!canDisable.canDisable) {
                return {
                    success: false,
                    reason: canDisable.reason,
                    dependents: canDisable.dependents
                };
            }
        } else {
            const missing = this.dependencyResolver.getMissingDependencies(pluginName);
            if (missing.length > 0) {
                return {
                    success: false,
                    reason: `Missing required dependencies: ${missing.join(', ')}`,
                    missingDependencies: missing
                };
            }

            const plugin = this.loadedPlugins.find(p => p.name === pluginName);
            if (plugin) {
                const disabledDeps = [];
                for (const dep of plugin.dependencies) {
                    const depName = typeof dep === 'string' ? dep : dep.name;
                    const depState = this.pluginStates.get(depName);
                    if (!depState || !depState.enabled) {
                        disabledDeps.push(depName);
                    }
                }

                if (disabledDeps.length > 0) {
                    return {
                        success: false,
                        reason: `Required dependencies are disabled: ${disabledDeps.join(', ')}`,
                        disabledDependencies: disabledDeps
                    };
                }
            }
        }

        const wasEnabled = pluginState.enabled;
        pluginState.enabled = enabled;

        if (wasEnabled && !enabled) {
            this._cleanupPlugin(pluginName, pluginState);
        } else if (!wasEnabled && enabled) {
            this._restorePluginState(pluginName, pluginState);
        }

        return {success: true};
    }

    _cleanupPlugin(pluginName, pluginState) {
        this.displayNames.clearAll(pluginName);

        for (const interceptorInfo of pluginState.modifications.interceptors) {
            if (interceptorInfo.unsubscribe) {
                interceptorInfo.unsubscribe();
            } else if (interceptorInfo.direction && interceptorInfo.packets && interceptorInfo.handler) {
                this.events.unregisterPacketInterceptor(interceptorInfo.direction, interceptorInfo.packets, interceptorInfo.handler);
            }
        }
        pluginState.modifications.interceptors.clear();

        console.log(`Cleaned up modifications for disabled plugin: ${pluginName}`);
    }

    _restorePluginState(pluginName, pluginState) {
        const currentState = {
            players: this.playersModule.getPlayers(),
            gameState: this.worldModule.gameState,
            teams: this.getTeams()
        };

        this.emit('plugin_restored', {pluginName, currentState});

        console.log(`Restored state for re-enabled plugin: ${pluginName}`);
    }

    _checkPluginEnabled(pluginName, methodName) {
        const pluginState = this.pluginStates.get(pluginName);
        if (!pluginState || !pluginState.enabled) {
            return false;
        }
        return true;
    }

    _ensureConfigCommandRegistered(pluginName) {
        if (this.proxy.commandHandler.modules.has(pluginName.toLowerCase())) {
            return;
        }

        this.proxy.commandHandler.register(pluginName, (registry) => {
        });
    }

    _getPluginEnabledState(pluginName) {
        try {
            const {getPluginConfigDir} = require('../utils/paths');
            const configPath = path.join(getPluginConfigDir(), `${pluginName}.config.json`);

            if (fs.existsSync(configPath)) {
                const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                return configData.enabled !== false;
            }
        } catch (error) {
            console.log(`Failed to read config for plugin ${pluginName}: ${error.message}`);
        }

        return true;
    }

    _validateAndFixDependencyStates(pluginMetadataMap) {
        const changedPlugins = [];

        const currentStates = new Map();
        for (const pluginName of pluginMetadataMap.keys()) {
            currentStates.set(pluginName, this._getPluginEnabledState(pluginName));
        }

        for (const [pluginName, metadata] of pluginMetadataMap) {
            const isEnabled = currentStates.get(pluginName);
            if (!isEnabled) continue;

            const dependencies = metadata.dependencies || [];
            let shouldDisable = false;
            const missingDeps = [];

            for (const dep of dependencies) {
                const depName = typeof dep === 'string' ? dep : dep.name;
                const depEnabled = currentStates.get(depName);

                if (!depEnabled) {
                    shouldDisable = true;
                    missingDeps.push(depName);
                }
            }

            if (shouldDisable) {
                this._setPluginEnabledInConfig(pluginName, false);
                currentStates.set(pluginName, false);
                changedPlugins.push(`${metadata.displayName} (missing dependencies: ${missingDeps.join(', ')})`);

                const dependentsToDisable = this._getEnabledDependents(pluginName, currentStates, pluginMetadataMap);
                for (const dependent of dependentsToDisable) {
                    this._setPluginEnabledInConfig(dependent, false);
                    currentStates.set(dependent, false);
                    const depMeta = pluginMetadataMap.get(dependent);
                    changedPlugins.push(`${depMeta.displayName} (dependency ${metadata.displayName} was disabled)`);
                }
            }
        }

        if (changedPlugins.length > 0) {
            console.log(`Auto-disabled plugins due to dependency constraints: ${changedPlugins.join(', ')}`);
        }
    }

    _getEnabledDependents(pluginName, currentStates, pluginMetadataMap) {
        const dependents = [];

        for (const [candidateName, metadata] of pluginMetadataMap) {
            if (!currentStates.get(candidateName)) continue;

            const dependencies = metadata.dependencies || [];
            const dependsOnTarget = dependencies.some(dep => {
                const depName = typeof dep === 'string' ? dep : dep.name;
                return depName === pluginName;
            });

            if (dependsOnTarget) {
                dependents.push(candidateName);
                dependents.push(...this._getEnabledDependents(candidateName, currentStates, pluginMetadataMap));
            }
        }

        return [...new Set(dependents)];
    }

    _setPluginEnabledInConfig(pluginName, enabled) {
        try {
            const {getPluginConfigDir} = require('../utils/paths');
            const configPath = path.join(getPluginConfigDir(), `${pluginName}.config.json`);

            let configData = {};
            if (fs.existsSync(configPath)) {
                configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }

            configData.enabled = enabled;

            const configDir = path.dirname(configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, {recursive: true});
            }

            fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
        } catch (error) {
            console.error(`Failed to update config for plugin ${pluginName}: ${error.message}`);
        }
    }

    async loadPlugins() {
        const pluginsDir = getPluginsDir();
        if (!fs.existsSync(pluginsDir)) {
            console.log('Plugins directory not found, no plugins to load');
            return;
        }

        const pluginFiles = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));
        const pluginMetadataMap = new Map();
        const pluginModules = new Map();

        const skippedPlugins = [];
        const loadedPlugins = [];

        for (const file of pluginFiles) {
            let pluginName;
            try {
                const pluginPath = path.join(pluginsDir, file);

                delete require.cache[require.resolve(pluginPath)];
                const plugin = require(pluginPath);

                const tempMetadata = {
                    name: null,
                    path: pluginPath,
                    displayName: null,
                    prefix: null,
                    version: '1.0.0',
                    minVersion: null,
                    maxVersion: null,
                    dependencies: [],
                    optionalDependencies: [],
                    official: false,
                    signature: null
                };

                const metadataWrapper = this.createMetadataOnlyWrapper(tempMetadata);

                try {
                    if (typeof plugin.init === 'function') {
                        plugin.init(metadataWrapper);
                    } else if (typeof plugin === 'function') {
                        plugin(metadataWrapper);
                    }
                } catch (initError) {
                }

                if (!tempMetadata.name) {
                    console.error(`❌ Plugin in ${file} does not declare a name - skipping`);
                    skippedPlugins.push(`${file} (no name declared)`);
                    continue;
                }

                pluginName = tempMetadata.name;

                if (pluginMetadataMap.has(pluginName)) {
                    console.error(`❌ Plugin name conflict: ${pluginName} already loaded from another file`);
                    skippedPlugins.push(`${file} (duplicate plugin name: ${pluginName})`);
                    continue;
                }

                const fileContent = fs.readFileSync(pluginPath, 'utf8');
                const verification = await this.signatureVerifier.verifyPlugin(fileContent, pluginName);

                if (verification.signature && !verification.verified) {
                    console.error(`❌ Plugin ${pluginName} has invalid signature - refusing to load`);
                    skippedPlugins.push(`${tempMetadata.displayName || pluginName} (invalid signature)`);
                    continue;
                }

                const pluginMetadata = {
                    ...tempMetadata,
                    name: pluginName,
                    displayName: tempMetadata.displayName || pluginName.charAt(0).toUpperCase() + pluginName.slice(1),
                    official: verification.isOfficial,
                    signature: {
                        verified: verification.verified,
                        isOfficial: verification.isOfficial,
                        hash: verification.hash,
                        reason: verification.reason
                    }
                };

                const versionCheck = this._validatePluginVersion(pluginMetadata);
                if (!versionCheck.compatible) {
                    skippedPlugins.push(`${pluginMetadata.displayName} (${versionCheck.reason})`);
                    continue;
                }

                pluginMetadataMap.set(pluginName, pluginMetadata);
                pluginModules.set(pluginName, plugin);
                this.dependencyResolver.addPlugin(pluginMetadata);

            } catch (error) {
                const displayName = pluginName ? pluginName.charAt(0).toUpperCase() + pluginName.slice(1) : file;
                skippedPlugins.push(`${displayName} (parse error: ${error.message})`);
            }
        }

        this.dependencyResolver.buildDependencyGraph();

        const dependencyErrors = this.dependencyResolver.validateDependencies();
        const problematicPlugins = new Set();

        if (dependencyErrors.length > 0) {
            dependencyErrors.forEach(error => {
                const match = error.match(/plugin "([^"]+)"/i);
                if (match) {
                    const pluginName = match[1];
                    const pluginMeta = pluginMetadataMap.get(pluginName);
                    const displayName = pluginMeta ? pluginMeta.displayName : pluginName.charAt(0).toUpperCase() + pluginName.slice(1);

                    problematicPlugins.add(pluginName);
                    if (error.includes('cannot depend on unofficial plugin')) {
                        skippedPlugins.push(`${displayName} (security: official cannot depend on unofficial)`);
                    } else if (error.includes('missing dependency')) {
                        const depMatch = error.match(/requires missing dependency "([^"]+)"/);
                        const depName = depMatch ? depMatch[1] : 'unknown';
                        skippedPlugins.push(`${displayName} (missing dependency: ${depName})`);
                    } else if (error.includes('version incompatible')) {
                        skippedPlugins.push(`${displayName} (dependency version conflict)`);
                    } else {
                        skippedPlugins.push(`${displayName} (dependency error)`);
                    }
                }
            });

            for (const pluginName of problematicPlugins) {
                this.dependencyResolver.plugins.delete(pluginName);
                this.dependencyResolver.dependencyGraph.delete(pluginName);
                pluginMetadataMap.delete(pluginName);
                pluginModules.delete(pluginName);
            }

            this.dependencyResolver.buildDependencyGraph();
        }

        const circularDeps = this.dependencyResolver.detectCircularDependencies();
        if (circularDeps.length > 0) {
            circularDeps.forEach(cycle => {
                cycle.forEach(pluginName => {
                    const pluginMeta = pluginMetadataMap.get(pluginName);
                    const displayName = pluginMeta ? pluginMeta.displayName : pluginName.charAt(0).toUpperCase() + pluginName.slice(1);
                    if (!problematicPlugins.has(pluginName)) {
                        skippedPlugins.push(`${displayName} (circular dependency)`);
                        problematicPlugins.add(pluginName);
                    }
                });
            });

            for (const pluginName of problematicPlugins) {
                this.dependencyResolver.plugins.delete(pluginName);
                this.dependencyResolver.dependencyGraph.delete(pluginName);
                pluginMetadataMap.delete(pluginName);
                pluginModules.delete(pluginName);
            }

            this.dependencyResolver.buildDependencyGraph();
        }

        const loadOrder = this.dependencyResolver.getLoadOrder();

        for (const pluginName of loadOrder) {
            try {
                const pluginMetadata = pluginMetadataMap.get(pluginName);
                const plugin = pluginModules.get(pluginName);

                if (!pluginMetadata || !plugin) {
                    continue;
                }


                const pluginEnabled = this._getPluginEnabledState(pluginName);

                this.pluginStates.set(pluginName, {
                    enabled: pluginEnabled,
                    modifications: {
                        displayNames: new Set(),
                        interceptors: new Set(),
                        eventHandlers: new Set()
                    }
                });

                const pluginAPI = this.createPluginWrapper(pluginMetadata);
                let pluginInstance = null;
                try {
                    if (typeof plugin.init === 'function') {
                        pluginInstance = plugin.init(pluginAPI);
                    } else if (typeof plugin === 'function') {
                        pluginInstance = plugin(pluginAPI);
                    }

                    if (pluginInstance) {
                        this.pluginInstances.set(pluginName, pluginInstance);
                    }
                } catch (initError) {
                    console.error(`Plugin ${pluginName} initialization failed: ${initError.message}`);
                    skippedPlugins.push(`${pluginMetadata.displayName} (init error: ${initError.message})`);
                    continue;
                }

                this.loadedPlugins.push({
                    name: pluginName,
                    displayName: pluginMetadata.displayName,
                    path: pluginMetadata.path,
                    enabled: pluginEnabled,
                    metadata: pluginMetadata,
                    version: pluginMetadata.version,
                    compatible: true,
                    dependencies: pluginMetadata.dependencies || [],
                    optionalDependencies: pluginMetadata.optionalDependencies || [],
                    signature: pluginMetadata.signature,
                    isOfficial: pluginMetadata.official === true && pluginMetadata.signature.verified
                });

                loadedPlugins.push(`${pluginMetadata.displayName} (${pluginName}-v${pluginMetadata.version})`);

            } catch (error) {
                const pluginMeta = pluginMetadataMap.get(pluginName);
                const displayName = pluginMeta ? pluginMeta.displayName : pluginName.charAt(0).toUpperCase() + pluginName.slice(1);
                skippedPlugins.push(`${displayName} (initialization error)`);
            }
        }

        if (skippedPlugins.length > 0) {
            console.log(`Skipped plugins: ${skippedPlugins.join(', ')}`);
        }
        if (loadedPlugins.length > 0) {
            console.log(`Loaded plugins: ${loadedPlugins.join(', ')}`);
        } else {
            console.log('No plugins loaded');
        }
    }

    createMetadataOnlyWrapper(pluginMetadata) {
        return {
            metadata: (meta) => {
                Object.assign(pluginMetadata, meta);

                if (meta.version && !VersionUtils.isVersionValid(meta.version)) {
                    throw new Error(`Invalid plugin version: ${meta.version}`);
                }
                if (meta.minVersion && !VersionUtils.isVersionValid(meta.minVersion)) {
                    throw new Error(`Invalid minVersion: ${meta.minVersion}`);
                }
                if (meta.maxVersion && !VersionUtils.isVersionValid(meta.maxVersion)) {
                    throw new Error(`Invalid maxVersion: ${meta.maxVersion}`);
                }

                if (meta.dependencies && !Array.isArray(meta.dependencies)) {
                    throw new Error('dependencies must be an array');
                }
                if (meta.optionalDependencies && !Array.isArray(meta.optionalDependencies)) {
                    throw new Error('optionalDependencies must be an array');
                }

                const validateDependency = (dep, type) => {
                    if (typeof dep === 'string') {
                        return;
                    }
                    if (typeof dep !== 'object' || !dep.name) {
                        throw new Error(`${type} must have a name property`);
                    }
                    if (dep.version && !VersionUtils.isVersionValid(dep.version)) {
                        throw new Error(`Invalid ${type} version: ${dep.version}`);
                    }
                    if (dep.minVersion && !VersionUtils.isVersionValid(dep.minVersion)) {
                        throw new Error(`Invalid ${type} minVersion: ${dep.minVersion}`);
                    }
                    if (dep.maxVersion && !VersionUtils.isVersionValid(dep.maxVersion)) {
                        throw new Error(`Invalid ${type} maxVersion: ${dep.maxVersion}`);
                    }
                };

                if (meta.dependencies) {
                    meta.dependencies.forEach(dep => validateDependency(dep, 'dependency'));
                }
                if (meta.optionalDependencies) {
                    meta.optionalDependencies.forEach(dep => validateDependency(dep, 'optional dependency'));
                }
            },

            configSchema: () => {
            },
            log: () => {
            },
            debugLog: () => {
            },
            on: () => () => {
            },
            emit: () => {
            },
            intercept: () => () => {
            },
            everyTick: () => () => {
            },
            onWorldChange: () => () => {
            },
            commands: () => {
            },
            chat: () => {
            },
            sound: () => {
            },
            getPrefix: () => '',
            isEnabled: () => false,
            config: {get: () => undefined},
            players: []
        };
    }

    createPluginWrapper(pluginMetadata) {
        const pluginCore = new Core(this.proxy, pluginMetadata);
        const mainAPI = this;
        const pluginName = pluginMetadata.name;
        const pluginState = this.pluginStates.get(pluginName);

        const registeredInterceptors = [];

        const withEnabledCheck = (fn, methodName) => {
            return (...args) => {
                if (!mainAPI._checkPluginEnabled(pluginName, methodName)) {
                    return;
                }
                return fn(...args);
            };
        };

        const safeMethod = (fn, methodName) => {
            return (...args) => {
                if (!pluginState) {
                    return;
                }
                return withEnabledCheck(fn, methodName)(...args);
            };
        };

        const isOfficial = pluginMetadata.official === true && pluginMetadata.signature?.verified === true;

        const protectedMethod = (fn, methodName) => {
            return (...args) => {
                if (!isOfficial) {
                    throw new Error(`Protected method '${methodName}' requires official plugin signature`);
                }
                return withEnabledCheck(fn, methodName)(...args);
            };
        };

        const officialOnlyMethod = (fn, methodName, callerPlugin) => {
            return (...args) => {
                if (!callerPlugin) {
                    return withEnabledCheck(fn, methodName)(...args);
                }

                const callerMetadata = this.loadedPlugins.find(p => p.name === callerPlugin);
                if (!callerMetadata || !callerMetadata.isOfficial) {
                    throw new Error(`Official method '${methodName}' can only be called by other official plugins`);
                }

                return withEnabledCheck(fn, methodName)(...args);
            };
        };

        return {
            metadata: () => {
            },

            configSchema: (schema) => {
                pluginMetadata.configSchema = schema;
                this._ensureConfigCommandRegistered(pluginName);
            },

            config: pluginCore.config,
            log: withEnabledCheck(pluginCore.log.bind(pluginCore), 'log'),
            debugLog: withEnabledCheck(pluginCore.debugLog.bind(pluginCore), 'debugLog'),
            get debug() {
                return pluginCore.config.get('debug');
            },

            initializeConfig: pluginCore.initializeConfig.bind(pluginCore),
            getConfig: () => pluginCore.config,
            saveCurrentConfig: pluginCore.saveCurrentConfig.bind(pluginCore),
            getPrefix: () => `§8[§r${this.proxy.PROXY_PREFIX}§8-§r${pluginMetadata.prefix}§8]§r`,

            isEnabled: () => pluginState?.enabled && pluginCore.enabled,

            on: (event, handler) => {
                if (!pluginState) return () => {
                };
                const wrappedHandler = withEnabledCheck(handler, 'eventHandler');
                pluginState.modifications.eventHandlers.add({event, handler: wrappedHandler});
                return mainAPI.on(event, wrappedHandler);
            },
            emit: safeMethod(mainAPI.emit, 'emit'),

            intercept: (event, handler) => {
                if (!mainAPI._checkPluginEnabled(pluginName, 'intercept')) {
                    return () => {
                    };
                }

                const wrappedHandler = withEnabledCheck(handler, 'packetInterceptor');

                const unsubscribe = mainAPI.intercept(event, wrappedHandler);

                const interceptorInfo = {event, handler: wrappedHandler, unsubscribe};
                pluginState.modifications.interceptors.add(interceptorInfo);
                registeredInterceptors.push(interceptorInfo);

                return () => {
                    unsubscribe();
                    pluginState.modifications.interceptors.delete(interceptorInfo);
                    const index = registeredInterceptors.indexOf(interceptorInfo);
                    if (index !== -1) {
                        registeredInterceptors.splice(index, 1);
                    }
                };
            },

            interceptPackets: (options, handler) => {
                if (!mainAPI._checkPluginEnabled(pluginName, 'interceptPackets')) {
                    return () => {
                    };
                }

                if (!options || !options.direction || !options.packets || !Array.isArray(options.packets)) {
                    throw new Error('interceptPackets requires options with direction and packets array');
                }

                if (!['server', 'client'].includes(options.direction)) {
                    throw new Error('direction must be either "server" or "client"');
                }

                if (typeof handler !== 'function') {
                    throw new Error('handler must be a function');
                }

                const wrappedHandler = withEnabledCheck(handler, 'packetInterceptor');

                mainAPI.events.registerPacketInterceptor(options.direction, options.packets, wrappedHandler);

                const interceptorInfo = {
                    direction: options.direction,
                    packets: options.packets,
                    handler: wrappedHandler
                };
                pluginState.modifications.interceptors.add(interceptorInfo);
                registeredInterceptors.push(interceptorInfo);

                return () => {
                    mainAPI.events.unregisterPacketInterceptor(options.direction, options.packets, wrappedHandler);
                    pluginState.modifications.interceptors.delete(interceptorInfo);
                    const index = registeredInterceptors.indexOf(interceptorInfo);
                    if (index !== -1) {
                        registeredInterceptors.splice(index, 1);
                    }
                };
            },

            chat: withEnabledCheck(mainAPI.chat, 'chat'),
            sound: withEnabledCheck(mainAPI.sound, 'sound'),

            everyTick: (callback) => {
                if (!pluginState) return () => {
                };
                const wrappedCallback = withEnabledCheck(callback, 'tickHandler');
                return mainAPI.on('tick', wrappedCallback);
            },

            onWorldChange: (callback) => {
                if (!pluginState) return () => {
                };
                const wrappedCallback = withEnabledCheck(callback, 'worldChangeHandler');
                return mainAPI.on('world_change', wrappedCallback);
            },

            get players() {
                return mainAPI._checkPluginEnabled(pluginName, 'players') ? mainAPI.playersModule.getPlayers() : [];
            },
            getPlayer: withEnabledCheck(mainAPI.getPlayer, 'getPlayer'),
            getPlayerByName: withEnabledCheck(mainAPI.getPlayerByName, 'getPlayerByName'),
            getCurrentPlayer: withEnabledCheck(mainAPI.getCurrentPlayer, 'getCurrentPlayer'),
            getPlayerInfo: withEnabledCheck(mainAPI.getPlayerInfo, 'getPlayerInfo'),
            calculateDistance: withEnabledCheck(mainAPI.calculateDistance, 'calculateDistance'),
            getPlayersWithinDistance: withEnabledCheck(mainAPI.getPlayersWithinDistance, 'getPlayersWithinDistance'),
            getPlayersInTeam: withEnabledCheck(mainAPI.getPlayersInTeam, 'getPlayersInTeam'),

            // world methods
            getTeams: withEnabledCheck(mainAPI.getTeams, 'getTeams'),
            getPlayerTeam: withEnabledCheck(mainAPI.getPlayerTeam, 'getPlayerTeam'),

            // communication methods
            sendTitle: withEnabledCheck(mainAPI.sendTitle, 'sendTitle'),
            sendActionBar: withEnabledCheck(mainAPI.sendActionBar, 'sendActionBar'),
            sendParticle: withEnabledCheck(mainAPI.sendParticle, 'sendParticle'),
            sendChatToServer: withEnabledCheck(mainAPI.sendChatToServer, 'sendChatToServer'),

            // server administration methods
            kick: withEnabledCheck(mainAPI.kick, 'kick'),
            sendKeepAlive: withEnabledCheck(mainAPI.sendKeepAlive, 'sendKeepAlive'),
            sendTabComplete: withEnabledCheck(mainAPI.sendTabComplete, 'sendTabComplete'),
            sendCustomPayload: withEnabledCheck(mainAPI.sendCustomPayload, 'sendCustomPayload'),
            sendLogin: withEnabledCheck(mainAPI.sendLogin, 'sendLogin'),

            // hypixel methods
            getPartyInfo: withEnabledCheck(mainAPI.getPartyInfo, 'getPartyInfo'),
            getPartyInfoAsync: withEnabledCheck(mainAPI.getPartyInfoAsync, 'getPartyInfoAsync'),
            isInParty: withEnabledCheck(mainAPI.isInParty, 'isInParty'),
            getPlayerRole: withEnabledCheck(mainAPI.getPlayerRole, 'getPlayerRole'),
            getPing: withEnabledCheck(mainAPI.getPing, 'getPing'),
            getPingAsync: withEnabledCheck(mainAPI.getPingAsync, 'getPingAsync'),

            // inventory/GUI methods
            openWindow: withEnabledCheck(mainAPI.openWindow, 'openWindow'),
            closeWindow: withEnabledCheck(mainAPI.closeWindow, 'closeWindow'),
            setSlot: withEnabledCheck(mainAPI.setSlot, 'setSlot'),
            setWindowItems: withEnabledCheck(mainAPI.setWindowItems, 'setWindowItems'),
            sendTransaction: withEnabledCheck(mainAPI.sendTransaction, 'sendTransaction'),
            sendCraftProgress: withEnabledCheck(mainAPI.sendCraftProgress, 'sendCraftProgress'),
            setHeldItemSlot: withEnabledCheck(mainAPI.setHeldItemSlot, 'setHeldItemSlot'),
            creativeInventoryAction: withEnabledCheck(mainAPI.creativeInventoryAction, 'creativeInventoryAction'),
            enchantItem: withEnabledCheck(mainAPI.enchantItem, 'enchantItem'),
            createChest: withEnabledCheck(mainAPI.createChest, 'createChest'),
            createHopper: withEnabledCheck(mainAPI.createHopper, 'createHopper'),
            createDispenser: withEnabledCheck(mainAPI.createDispenser, 'createDispenser'),
            fillWindow: withEnabledCheck(mainAPI.fillWindow, 'fillWindow'),
            clearWindow: withEnabledCheck(mainAPI.clearWindow, 'clearWindow'),

            // player state methods
            sendHealth: withEnabledCheck(mainAPI.sendHealth, 'sendHealth'),
            sendExperience: withEnabledCheck(mainAPI.sendExperience, 'sendExperience'),
            sendPosition: withEnabledCheck(mainAPI.sendPosition, 'sendPosition'),
            sendAbilities: withEnabledCheck(mainAPI.sendAbilities, 'sendAbilities'),
            sendPlayerInfo: withEnabledCheck(mainAPI.sendPlayerInfo, 'sendPlayerInfo'),

            // entity methods
            spawnPlayer: withEnabledCheck(mainAPI.spawnPlayer, 'spawnPlayer'),
            spawnLiving: withEnabledCheck(mainAPI.spawnLiving, 'spawnLiving'),
            spawnObject: withEnabledCheck(mainAPI.spawnObject, 'spawnObject'),
            spawnExperienceOrb: withEnabledCheck(mainAPI.spawnExperienceOrb, 'spawnExperienceOrb'),
            setEntityVelocity: withEnabledCheck(mainAPI.setEntityVelocity, 'setEntityVelocity'),
            teleportEntity: withEnabledCheck(mainAPI.teleportEntity, 'teleportEntity'),
            moveEntity: withEnabledCheck(mainAPI.moveEntity, 'moveEntity'),
            setEntityLook: withEnabledCheck(mainAPI.setEntityLook, 'setEntityLook'),
            setEntityLookAndMove: withEnabledCheck(mainAPI.setEntityLookAndMove, 'setEntityLookAndMove'),
            setEntityHeadRotation: withEnabledCheck(mainAPI.setEntityHeadRotation, 'setEntityHeadRotation'),
            setEntityEquipment: withEnabledCheck(mainAPI.setEntityEquipment, 'setEntityEquipment'),
            addEntityEffect: withEnabledCheck(mainAPI.addEntityEffect, 'addEntityEffect'),
            removeEntityEffect: withEnabledCheck(mainAPI.removeEntityEffect, 'removeEntityEffect'),
            setEntityStatus: withEnabledCheck(mainAPI.setEntityStatus, 'setEntityStatus'),
            setEntityMetadata: withEnabledCheck(mainAPI.setEntityMetadata, 'setEntityMetadata'),
            animateEntity: withEnabledCheck(mainAPI.animateEntity, 'animateEntity'),
            collectEntity: withEnabledCheck(mainAPI.collectEntity, 'collectEntity'),
            attachEntity: withEnabledCheck(mainAPI.attachEntity, 'attachEntity'),

            // world methods
            sendExplosion: withEnabledCheck(mainAPI.sendExplosion, 'sendExplosion'),
            sendBlockChange: withEnabledCheck(mainAPI.sendBlockChange, 'sendBlockChange'),
            sendMultiBlockChange: withEnabledCheck(mainAPI.sendMultiBlockChange, 'sendMultiBlockChange'),
            sendWorldEvent: withEnabledCheck(mainAPI.sendWorldEvent, 'sendWorldEvent'),
            sendTimeUpdate: withEnabledCheck(mainAPI.sendTimeUpdate, 'sendTimeUpdate'),
            sendSpawnPosition: withEnabledCheck(mainAPI.sendSpawnPosition, 'sendSpawnPosition'),
            sendGameStateChange: withEnabledCheck(mainAPI.sendGameStateChange, 'sendGameStateChange'),
            sendScoreboardObjective: withEnabledCheck(mainAPI.sendScoreboardObjective, 'sendScoreboardObjective'),
            sendScoreboardScore: withEnabledCheck(mainAPI.sendScoreboardScore, 'sendScoreboardScore'),
            sendScoreboardDisplay: withEnabledCheck(mainAPI.sendScoreboardDisplay, 'sendScoreboardDisplay'),
            sendScoreboardTeam: withEnabledCheck(mainAPI.sendScoreboardTeam, 'sendScoreboardTeam'),

            setDisplayNamePrefix: (uuid, prefix) => {
                if (!mainAPI._checkPluginEnabled(pluginName, 'setDisplayNamePrefix')) return;
                mainAPI.displayNames.setPrefix(pluginName, uuid, prefix);
            },
            appendDisplayNamePrefix: (uuid, prefix) => {
                if (!mainAPI._checkPluginEnabled(pluginName, 'appendDisplayNamePrefix')) return;
                mainAPI.displayNames.appendPrefix(pluginName, uuid, prefix);
            },
            prependDisplayNamePrefix: (uuid, prefix) => {
                if (!mainAPI._checkPluginEnabled(pluginName, 'prependDisplayNamePrefix')) return;
                mainAPI.displayNames.prependPrefix(pluginName, uuid, prefix);
            },
            setDisplayNameSuffix: (uuid, suffix) => {
                if (!mainAPI._checkPluginEnabled(pluginName, 'setDisplayNameSuffix')) return;
                mainAPI.displayNames.setSuffix(pluginName, uuid, suffix);
            },
            appendDisplayNameSuffix: (uuid, suffix) => {
                if (!mainAPI._checkPluginEnabled(pluginName, 'appendDisplayNameSuffix')) return;
                mainAPI.displayNames.appendSuffix(pluginName, uuid, suffix);
            },
            prependDisplayNameSuffix: (uuid, suffix) => {
                if (!mainAPI._checkPluginEnabled(pluginName, 'prependDisplayNameSuffix')) return;
                mainAPI.displayNames.prependSuffix(pluginName, uuid, suffix);
            },
            clearDisplayNamePrefix: (uuid) => {
                if (!mainAPI._checkPluginEnabled(pluginName, 'clearDisplayNamePrefix')) return;
                mainAPI.displayNames.clearPrefix(pluginName, uuid);
            },
            clearDisplayNameSuffix: (uuid) => {
                if (!mainAPI._checkPluginEnabled(pluginName, 'clearDisplayNameSuffix')) return;
                mainAPI.displayNames.clearSuffix(pluginName, uuid);
            },
            clearAllDisplayNames: () => {
                if (!mainAPI._checkPluginEnabled(pluginName, 'clearAllDisplayNames')) return;
                mainAPI.displayNames.clearAll(pluginName);
            },
            getDisplayNamePrefix: withEnabledCheck((uuid) => mainAPI.displayNames.getPrefix(uuid), 'getDisplayNamePrefix'),
            getDisplayNameSuffix: withEnabledCheck((uuid) => mainAPI.displayNames.getSuffix(uuid), 'getDisplayNameSuffix'),

            getHelpers: () => this.helpersModule,

            commands: (commands) => {
                return mainAPI.commandsModule.register(pluginMetadata.name, commands);
            },

            official: {
                rawIntercept: protectedMethod((direction, packets, handler) => {
                    console.log(`[SECURITY] Official plugin ${pluginName} using raw packet interception`);
                    return mainAPI.events.registerPacketInterceptor(direction, packets, handler);
                }, 'rawIntercept')
            },

            getPluginInstance: (targetPluginName) => {
                const dependencies = pluginMetadata.dependencies || [];
                const hasDependency = dependencies.some(dep => {
                    const depName = typeof dep === 'string' ? dep : dep.name;
                    return depName === targetPluginName;
                });

                if (!hasDependency) {
                    throw new Error(`Plugin '${pluginName}' cannot access '${targetPluginName}' - not declared as dependency`);
                }

                const targetState = mainAPI.pluginStates.get(targetPluginName);
                if (!targetState || !targetState.enabled) {
                    return null;
                }

                return mainAPI.pluginInstances.get(targetPluginName) || null;
            },

            isOfficial: () => isOfficial,

            _cleanup: () => {
                for (const interceptorInfo of registeredInterceptors) {
                    if (interceptorInfo.unsubscribe) {
                        interceptorInfo.unsubscribe();
                    } else if (interceptorInfo.direction && interceptorInfo.packets && interceptorInfo.handler) {
                        mainAPI.events.unregisterPacketInterceptor(interceptorInfo.direction, interceptorInfo.packets, interceptorInfo.handler);
                    }
                }
                registeredInterceptors.length = 0;
            }
        };
    }

    getLoadedPlugins() {
        return this.loadedPlugins;
    }

    _validatePluginVersion(pluginMetadata) {
        try {
            if (!pluginMetadata.minVersion && !pluginMetadata.maxVersion) {
                return {compatible: true};
            }

            if (pluginMetadata.minVersion) {
                if (!VersionUtils.isCompatible(this.proxyVersion, pluginMetadata.minVersion, 'min')) {
                    return {
                        compatible: false,
                        reason: `Requires proxy version >= ${pluginMetadata.minVersion}, current: ${this.proxyVersion}`
                    };
                }
            }

            if (pluginMetadata.maxVersion) {
                if (!VersionUtils.isCompatible(this.proxyVersion, pluginMetadata.maxVersion, 'max')) {
                    return {
                        compatible: false,
                        reason: `Requires proxy version <= ${pluginMetadata.maxVersion}, current: ${this.proxyVersion}`
                    };
                }
            }

            return {compatible: true};
        } catch (error) {
            return {
                compatible: false,
                reason: `Version validation error: ${error.message}`
            };
        }
    }

    _handleWorldChange(reason) {
        this.emit('world_change', {reason});

        this.displayNames._handleWorldChange(reason);
    }
}

module.exports = PluginAPI;
