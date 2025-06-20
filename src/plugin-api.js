const EventEmitter = require('events');

const PROXY_NAME = '§6S§eta§fr§bfi§3sh §5Proxy§r';
const PROXY_PREFIX = '§6S§eta§fr§bfi§3sh';

class PluginAPI extends EventEmitter {
    constructor(proxyManager) {
        super();
        this.proxyManager = proxyManager;
    }

    get currentPlayer() {
        return this.proxyManager.currentPlayer;
    }

    get proxyName() {
        return PROXY_NAME;
    }

    get proxyPrefix() {
        return PROXY_PREFIX;
    }

    sendToClient(metaName, data) {
        if (!this.currentPlayer?.client) return false;
        this.currentPlayer.client.write(metaName, data);
        return true;
    }

    sendToServer(metaName, data) {
        if (!this.currentPlayer?.targetClient) return false;
        this.currentPlayer.targetClient.write(metaName, data);
        return true;
    }

    sendChatMessage(client, message) {
        return this.proxyManager.sendChatMessage(client, message);
    }

    registerPlugin(pluginInfo) {
        return this.proxyManager.pluginManager.registerPlugin(pluginInfo);
    }

    setPluginEnabled(pluginName, enabled) {
        return this.proxyManager.pluginManager.setPluginEnabled(pluginName, enabled);
    }

    isPluginEnabled(pluginName) {
        return this.proxyManager.pluginManager.isPluginEnabled(pluginName);
    }

    setPluginDebug(pluginName, debug) {
        return this.proxyManager.pluginManager.setPluginDebug(pluginName, debug);
    }

    isPluginDebugEnabled(pluginName) {
        return this.proxyManager.pluginManager.isPluginDebugEnabled(pluginName);
    }

    getAllPluginStates() {
        return this.proxyManager.pluginManager.getAllPluginStates();
    }

    getLoadedPlugins() {
        return this.proxyManager.pluginManager.getLoadedPlugins();
    }

    getJoinState() {
        return this.proxyManager.getJoinState();
    }

    getPlayerInfo(uuid) {
        return this.proxyManager.gameState.getPlayerInfo(uuid);
    }

    getTeamData(teamName) {
        return this.proxyManager.gameState.getTeamData(teamName);
    }

    getPlayerTeam(playerName) {
        return this.proxyManager.gameState.getPlayerTeam(playerName);
    }

    getEntityData(entityId) {
        return this.proxyManager.gameState.getEntityData(entityId);
    }

    getDisplayName(uuid) {
        return this.proxyManager.gameState.getDisplayName(uuid);
    }

    emit(eventName, ...args) {
        const listeners = this.listeners(eventName);
        const enabledListeners = this.proxyManager.pluginManager.filterEnabledListeners(listeners);
        enabledListeners.forEach(listener => {
            try {
                listener(...args);
            } catch (error) {
                console.error('Error in event listener:', error);
            }
        });
        return this.listenerCount(eventName) > 0;
    }

    registerCommands(moduleName, commands) {
        this.proxyManager.commandHandler.register(moduleName, commands);
    }

    kickPlayer(reason) {
        this.proxyManager.kickPlayer(reason);
    }
}

module.exports = { PluginAPI, PROXY_NAME, PROXY_PREFIX };
