// Advanced Anticheat System
// Adapted from Pug's Custom Anticheat Raven script (github.com/PugrillaDev)

const PLUGIN_INFO = {
    name: 'anticheat',
    displayName: 'Anticheat',
    version: '0.0.3',
    description: 'Advanced cheater detector system (Inspired by github.com/PugrillaDev)',
    suffix: '§cAC' // [Starfish-AC]
};

module.exports = (proxyAPI) => {
    const anticheat = new AnticheatSystem(proxyAPI);

    proxyAPI.registerPlugin(PLUGIN_INFO, anticheat);

    const buildConfigSchema = () => {
        return generateSchema();
    };
    
    proxyAPI.registerCommands('anticheat', (registry) => {
        registry.registerConfig({
            displayName: PLUGIN_INFO.displayName,
            configObject: anticheat.config,
            schemaBuilder: buildConfigSchema,
            saveHandler: () => anticheat.saveConfig()
        });
    });

    return PLUGIN_INFO;
};

const getCheckDefinitions = () => {
    const definitions = {};
    for (const [checkName, checkData] of Object.entries(CHECKS)) {
        definitions[checkName] = checkData.config;
    }
    return definitions;
};

const generateSchema = () => {
    const schema = [];
    const checkDefinitions = getCheckDefinitions();
    
    for (const checkName in checkDefinitions) {
        const defaultCheckConfig = checkDefinitions[checkName];
            
            schema.push({
                label: checkName,
                defaults: defaultCheckConfig,
                settings: [
                    {
                        type: 'toggle',
                        key: `checks.${checkName}.enabled`,
                        text: ['OFF', 'ON'],
                    description: defaultCheckConfig.description || `Enables or disables the ${checkName} check.`
                    },
                    {
                        type: 'soundToggle',
                        key: `checks.${checkName}.sound`,
                        condition: (cfg) => cfg.checks[checkName].enabled,
                        description: 'Toggles sound alerts for this check.'
                    },
                    {
                        type: 'cycle',
                        key: `checks.${checkName}.vl`,
                        values: [
                            { text: '5', value: 5 },
                            { text: '10', value: 10 },
                            { text: '15', value: 15 },
                            { text: '20', value: 20 },
                            { text: '30', value: 30 }
                        ],
                        condition: (cfg) => cfg.checks[checkName].enabled,
                        description: 'Sets the violation level to trigger an alert.',
                        displayLabel: 'VL'
                    },
                    {
                        type: 'cycle',
                        key: `checks.${checkName}.cooldown`,
                        values: [
                            { text: '0s', value: 0 },
                            { text: '1s', value: 1000 },
                            { text: '2s', value: 2000 },
                            { text: '3s', value: 3000 }
                        ],
                        condition: (cfg) => cfg.checks[checkName].enabled,
                        description: 'Sets the cooldown between alerts for this check.',
                        displayLabel: 'CD'
                    }
                ]
            });
        }
    
        return schema;
    };

// anticheat check definitions with their default configurations
const CHECKS = {
    NoSlowA: {
        config: { 
            enabled: true, alerts: true, sound: true, vl: 15, cooldown: 2000, 
            description: "Detects sprinting while using items that should slow you down (eating food, drawing bow, blocking sword)." 
        },
        
        check: function(player, config) {
            // detect sprinting while using an item that should cause slowdown
            if (player.isSprinting && player.isUsingItem && (player.isHoldingConsumable() || player.isHoldingBow() || player.isHoldingSword())) {
                this.addViolation(player, 'NoSlowA');
                
                if (this.shouldAlert(player, 'NoSlowA', config)) {
                    this.flag(player, 'NoSlowA', player.violations.NoSlowA);
                    this.markAlert(player, 'NoSlowA');
                }
            } else {
                this.reduceViolation(player, 'NoSlowA');
            }
        }
    },
    
    AutoBlockA: {
        config: { 
            enabled: true, alerts: true, sound: true, vl: 15, cooldown: 2000, 
            description: "Detects attacking while blocking with a sword." 
        },
        
        check: function(player, config) {
            // detect swinging while using sword
            if (player.isUsingItem && player.swingProgress > 0 && player.isHoldingSword()) {
                this.addViolation(player, 'AutoBlockA');
                
                if (this.shouldAlert(player, 'AutoBlockA', config)) {
                    this.flag(player, 'AutoBlockA', player.violations.AutoBlockA);
                    this.markAlert(player, 'AutoBlockA');
                }
            } else {
                this.reduceViolation(player, 'AutoBlockA');
            }
        }
    },
    
    ScaffoldA: {
        config: { 
            enabled: true, alerts: true, sound: true, vl: 10, cooldown: 2000, 
            description: "Detects diagonal double-shifting legit scaffold patterns." 
        },

        check: function(player, config) {
            // detect double-shifting during diagonal bridging (legit scaffold)
            const moveDistance = player.getMovementDistance();
            
            if (moveDistance < 0.03 || player.shiftEvents.length < 6) {
                this.reduceViolation(player, 'ScaffoldA');
                return;
            }
            
            const lookingDown = player.isLookingDown();
            const isDiagonal = player.isDiagonalMovement();
            const hasRecentSwing = player.hasRecentSwing(20);
            const swungBlock = player.lastSwingWasBlock();

            let flagged = false;
            if (lookingDown && isDiagonal && player.onGround && swungBlock && hasRecentSwing) {
                
                const veryRecentShifts = player.hasRecentShiftEvents(15);
                
                if (veryRecentShifts.length >= 3) {
                    let totalDistance = 0;
                    for (let i = 1; i < veryRecentShifts.length; i++) {
                        const prev = veryRecentShifts[i-1].position;
                        const curr = veryRecentShifts[i].position;
                        const dist = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.z - prev.z, 2));
                        totalDistance += dist;
                    }
                    
                    const shiftsPerBlock = veryRecentShifts.length / Math.max(totalDistance, 0.5);
                    const isActivelyDoubleShifting = shiftsPerBlock > 1.25;
                    
                    const mostRecentShift = Math.max(...veryRecentShifts.map(s => s.tick));
                    const wasRecentShift = (player.ticksExisted - mostRecentShift) <= 5;
                    
                    if (isActivelyDoubleShifting && wasRecentShift) {
                        this.addViolation(player, 'ScaffoldA', 2);
                        
                        if (this.shouldAlert(player, 'ScaffoldA', config)) {
                            this.flag(player, 'ScaffoldA', player.violations.ScaffoldA);
                            this.markAlert(player, 'ScaffoldA');
                        }
                        flagged = true;
                    }
                }
            }

            if (!flagged) {
                this.reduceViolation(player, 'ScaffoldA');
            }
        }
    },
    
    ScaffoldB: {
        config: { 
            enabled: true, alerts: true, sound: true, vl: 10, cooldown: 2000, 
            description: "Detects blatant scaffold (fast movement & snappy rotations)" 
        },

        check: function(player, config) {
            // detect scaffold auto-aim behavior
            const hasRecentSwing = player.hasRecentSwing(10);
            const lookingDown = player.isLookingDown();
            const swungBlock = player.lastSwingWasBlock();
            const notShifting = !player.isCrouching;
            const notRecentlyShifted = player.ticksExisted - player.lastStopCrouchTick > 100;
            
            if (!hasRecentSwing || !lookingDown || !swungBlock || !notShifting || !notRecentlyShifted) {
                this.reduceViolation(player, 'ScaffoldB');
                return;
            }
            
            const airRatio = player.getAirTimeRatio(10);
            const isGrounded = airRatio <= 0.3;
            
            if (!isGrounded) {
                this.reduceViolation(player, 'ScaffoldB');
                return;
            }
            
            const { microRotations, totalRotations } = player.getRotationAnalysis(10);
            
            if (microRotations >= 2) {
                this.addViolation(player, 'ScaffoldB', 2);
                
                if (this.shouldAlert(player, 'ScaffoldB', config)) {
                    this.flag(player, 'ScaffoldB', player.violations.ScaffoldB);
                    this.markAlert(player, 'ScaffoldB');
                }
            } else if (totalRotations == 0) {
                this.reduceViolation(player, 'ScaffoldB');
            }
        }
    },
    
    ScaffoldC: {        //FALSES OFTEN, needs rework
        config: { 
            enabled: true, alerts: true, sound: true, vl: 5, cooldown: 2000, 
            description: "Detects high-speed backward bridging with air time (typical of keep-y)" 
        },

        check: function(player, config) {
            // detect scaffold keep-y behavior
            const lookingDown = player.isLookingDown();
            const hasRecentSwing = player.hasRecentSwing(10);
            const crouchCondition = player.lastStopCrouchTick >= player.lastCrouchTick;
            const longSinceUncrouch = player.ticksExisted - player.lastStopCrouchTick > 30;
            const backwardMovement = player.isBackwardMovement();
            const hasPositionHistory = player.previousPositions.length >= 20;
            const swungBlock = player.lastSwingWasBlock();
            
            if (lookingDown && hasRecentSwing && swungBlock && crouchCondition && longSinceUncrouch && backwardMovement && hasPositionHistory) {
                if (player.hasSignificantVerticalMovement(1)) {
                    this.reduceViolation(player, 'ScaffoldC');
                    return;
                }
                
                const airRatio = player.getAirTimeRatio(15);
                const isBridging = airRatio > 0.2;
                
                if (!isBridging) {
                    this.reduceViolation(player, 'ScaffoldC', 2);
                    return;
                }

                const avgSpeedPerSecond = player.getAverageSpeed(15);
                const highSpeedCheck = avgSpeedPerSecond > 5;
                
                if (!highSpeedCheck) {
                    this.reduceViolation(player, 'ScaffoldC');
                    return;
                }
                
                const firstPos = player.previousPositions[player.previousPositions.length - 1];
                const lastPos = player.previousPositions[0];
                const dx = lastPos.x - firstPos.x;
                const dz = lastPos.z - firstPos.z;
                const totalDistance = Math.sqrt(dx * dx + dz * dz);
                
                const distanceCheck = totalDistance > 3.4;

                if (distanceCheck) {
                    this.addViolation(player, 'ScaffoldC');
                    
                    if (this.shouldAlert(player, 'ScaffoldC', config)) {
                        this.flag(player, 'ScaffoldC', player.violations.ScaffoldC);
                        this.markAlert(player, 'ScaffoldC');
                    }
                } else {
                    this.reduceViolation(player, 'ScaffoldC');
                }
            } else {
                this.reduceViolation(player, 'ScaffoldC');
            }
        }
    },
    
    TowerA: {       // fireball jumping and spamming blocks beneath falses this
        config: { 
            enabled: true, alerts: true, sound: true, vl: 10, cooldown: 2000, 
            description: "Detects ascending (towering) faster than normal while placing blocks below." 
        },
        
        check: function(player, config) {
            // detect towering up too fast
            if (player.hasJumpBoost) {
                return;
            }
            
            if (!player.isLookingDown()) {
                this.reduceViolation(player, 'TowerA');
                return;
            }

            if (player.previousPositions.length < 6) {
                return;
            }

            const hasRecentSwing = player.hasRecentSwing(5);
            const swungBlock = player.lastSwingWasBlock();

            if (!hasRecentSwing || !swungBlock) {
                return;
            }

            const verticalSpeed = player.getVerticalSpeed(6);
            const isToweringSpeed = verticalSpeed > 0.5;

            if (isToweringSpeed) {
                this.addViolation(player, 'TowerA', 2);
                
                if (this.shouldAlert(player, 'TowerA', config)) {
                    this.flag(player, 'TowerA', player.violations.TowerA);
                    this.markAlert(player, 'TowerA');
                }
            } else {
                this.reduceViolation(player, 'TowerA');
            }
        }
    }
};

class PlayerData {
    constructor(username, uuid, entityId) {
        this.username = username;
        this.uuid = uuid;
        this.entityId = entityId;
        this.displayName = username;
        
        this.position = { x: 0, y: 0, z: 0 };
        this.lastPosition = { x: 0, y: 0, z: 0 };
        this.previousPositions = [];
        this.onGround = true;
        this.lastOnGround = true;
        
        this.yaw = 0;
        this.pitch = 0;
        
        this.isCrouching = false;
        this.lastCrouching = false;
        this.isSprinting = false;
        this.isUsingItem = false;
        this.swingProgress = 0;
        
        this.ticksExisted = 0;
        this.lastSwingTick = 0;
        this.lastCrouchTick = 0;
        this.lastStopCrouchTick = 0;
        
        this.violations = {};
        this.lastAlerts = {};
        
        for (const checkName of Object.keys(CHECKS)) {
            this.violations[checkName] = 0;
            this.lastAlerts[checkName] = 0;
        }
        
        this.lastSwingItem = null;
        this.hasJumpBoost = false;
        
        this.shiftEvents = [];
        this.currentShiftStart = null;
        
        this.heldItem = null;
        
        this.lastSprinting = false;
        this.lastUsing = false;
    }
    
    updatePosition(x, y, z, onGround, yaw = null, pitch = null) {
        this.lastPosition = { ...this.position };
        this.position = { x, y, z };
        this.onGround = onGround;
        
        if (yaw !== null) this.yaw = yaw;
        if (pitch !== null) this.pitch = pitch;
        
        const posData = { x, y, z, tick: this.ticksExisted, onGround };
        posData.yaw = this.yaw;
        posData.pitch = this.pitch;
        
        this.previousPositions.push(posData);
        if (this.previousPositions.length > 20) {
            this.previousPositions.shift();
        }
        
        this.lastOnGround = onGround;
    }
    
    getMoveYaw() {
        const dx = this.position.x - this.lastPosition.x;
        const dz = this.position.z - this.lastPosition.z;

        if (Math.sqrt(dx * dx + dz * dz) < 0.03) { 
            return null;
        }

        const moveAngle = -Math.atan2(dx, dz) * (180 / Math.PI);

        let diff = this.yaw - moveAngle;

        diff = ((diff % 360) + 540) % 360 - 180;
        
        return diff;
    }
    
    isHoldingSword() {
        if (!this.heldItem || !this.heldItem.blockId) return false;
        const swordIds = [267, 268, 272, 276, 283]; // wood, stone, iron, diamond, gold swords in 1.8.9
        return swordIds.includes(this.heldItem.blockId);
    }
    
    isHoldingBow() {
        if (!this.heldItem || !this.heldItem.blockId) return false;
        return this.heldItem.blockId === 261;
    }
    
    isHoldingConsumable() {
        if (!this.heldItem || !this.heldItem.blockId) return false;
        const consumableIds = [
            260, // apple
            297, // bread
            319, // porkchop
            320, // cooked_porkchop
            322, // golden_apple
            335, // milk_bucket
            349, // fish
            350, // cooked_fish
            354, // cake (item)
            357, // cookie
            360, // melon_slice
            363, // beef
            364, // cooked_beef
            365, // chicken
            366, // cooked_chicken
            367, // rotten_flesh
            373, // potion
            391, // carrot
            392, // potato
            393, // baked_potato
            394, // poisonous_potato
            396, // golden_carrot
            400, // pumpkin_pie
            411, // rabbit
            412, // cooked_rabbit
            413, // rabbit_stew
            423, // mutton
            424  // cooked_mutton
        ];
        return consumableIds.includes(this.heldItem.blockId);
    }
    
    isHoldingBlock() {
        if (!this.heldItem || !this.heldItem.blockId) return false;
        return this.heldItem.blockId < 256 && this.heldItem.blockId > 0;
    }
    
    lastSwingWasBlock() {
        if (!this.lastSwingItem || !this.lastSwingItem.blockId) return false;
        return this.lastSwingItem.blockId < 256 && this.lastSwingItem.blockId > 0;
    }

    isLookingDown() {
        return this.pitch >= 70;
    }
    
    hasRecentSwing(maxTicks = 10) {
        return this.ticksExisted - this.lastSwingTick <= maxTicks;
    }
    
    hasRecentShiftEvents(maxTicks = 15) {
        return this.shiftEvents.filter(e => 
            e.type === 'start' && (this.ticksExisted - e.tick) <= maxTicks
        );
    }
    
    getMovementDistance() {
        const dx = this.position.x - this.lastPosition.x;
        const dz = this.position.z - this.lastPosition.z;
        return Math.sqrt(dx * dx + dz * dz);
    }
    
    isDiagonalMovement() {
        const dx = this.position.x - this.lastPosition.x;
        const dz = this.position.z - this.lastPosition.z;
        const absX = Math.abs(dx);
        const absZ = Math.abs(dz);
        return absX > 0.015 && absZ > 0.015 && Math.abs(absX - absZ) < Math.min(absX, absZ) * 0.3;
    }
    
    getAirTimeRatio(sampleSize = 10) {
        const recentPositions = this.previousPositions.slice(-sampleSize);
        let airTime = 0;
        let groundTime = 0;
        
        for (const pos of recentPositions) {
            if (pos.onGround !== undefined) {
                if (pos.onGround) {
                    groundTime++;
                } else {
                    airTime++;
                }
            }
        }
        
        const totalTime = airTime + groundTime;
        return totalTime > 0 ? airTime / totalTime : 0;
    }
    
    getRotationAnalysis(sampleSize = 10) {
        const recentPositions = this.previousPositions.slice(-sampleSize);
        let microRotations = 0;
        let totalRotations = 0;
        
        for (let i = 1; i < recentPositions.length; i++) {
            const prev = recentPositions[i-1];
            const curr = recentPositions[i];
            
            if (prev.yaw !== undefined && curr.yaw !== undefined) {
                let yawDiff = Math.abs(curr.yaw - prev.yaw);
                if (yawDiff > 180) yawDiff = 360 - yawDiff;
                
                if (yawDiff > 0.1) {
                    totalRotations++;
                }
                
                if (yawDiff >= 0.5 && yawDiff <= 25) {
                    microRotations++;
                }
            }
        }
        
        return { microRotations, totalRotations };
    }
    
    getAverageSpeed(sampleSize = 15) {
        const recentPositions = this.previousPositions.slice(-sampleSize);
        let totalSpeed = 0;
        let speedSamples = 0;
        
        for (let i = 1; i < recentPositions.length; i++) {
            const current = recentPositions[i];
            const previous = recentPositions[i - 1];
            if (current.x !== undefined && previous.x !== undefined && 
                current.z !== undefined && previous.z !== undefined) {
                const dx = current.x - previous.x;
                const dz = current.z - previous.z;
                const speed2D = Math.sqrt(dx * dx + dz * dz);
                totalSpeed += speed2D;
                speedSamples++;
            }
        }
        
        const avgSpeedPerTick = speedSamples > 0 ? totalSpeed / speedSamples : 0;
        return avgSpeedPerTick * 20;
    }
    
    getVerticalSpeed(ticksBack = 6) {
        if (this.previousPositions.length < ticksBack) {
            return 0;
        }
        
        const currentPos = this.position;
        const pastPos = this.previousPositions[this.previousPositions.length - ticksBack];
        const ticksElapsed = this.ticksExisted - pastPos.tick;
        
        if (ticksElapsed <= 0) return 0;
        
        const deltaY = currentPos.y - pastPos.y;
        return deltaY / ticksElapsed;
    }
    
    isBackwardMovement() {
        const moveYaw = this.getMoveYaw();
        return moveYaw !== null && Math.abs(moveYaw) >= 90;
    }
    
    hasSignificantVerticalMovement(threshold = 1) {
        if (this.previousPositions.length < 2) return false;
        const firstPos = this.previousPositions[this.previousPositions.length - 1];
        const lastPos = this.previousPositions[0];
        return Math.abs(lastPos.y - firstPos.y) > threshold;
    }
    
    tick() {
        this.ticksExisted++;
        if (this.swingProgress > 0) {
            this.swingProgress--;
        }
    }
}

class AnticheatSystem {
    constructor(proxyAPI) {
        this.proxyAPI = proxyAPI;
        this.players = new Map();
        this.entityToPlayer = new Map();
        this.uuidToName = new Map();
        this.uuidToDisplayName = new Map();
        this.userPosition = null;
        
        this.config = {
            checks: JSON.parse(JSON.stringify(getCheckDefinitions())),
        };
        
        this.registerHandlers();
    }
    
    saveConfig() {
        // placeholder for now
        this.proxyAPI.log('Config updated.');
    }

    onDisable() {
        this.reset();
    }

    onEnable(joinState) {
        this.reset();
        if (joinState && Array.isArray(joinState.playerInfo)) {
            for (const [uuid, info] of joinState.playerInfo) {
                this.uuidToName.set(uuid, info.name || uuid);
                this.uuidToDisplayName.set(uuid, info.displayName || info.name || uuid);
            }
        }
        if (joinState && Array.isArray(joinState.entityData)) {
            for (const [id, ent] of joinState.entityData) {
                const player = new PlayerData(this.uuidToName.get(ent.uuid) || '', ent.uuid, id);
                if (ent.position) {
                    player.updatePosition(ent.position.x, ent.position.y, ent.position.z, ent.onGround, ent.yaw, ent.pitch);
                }
                this.players.set(ent.uuid, player);
                this.entityToPlayer.set(id, player);
            }
        }
    }

    reset() {
        this.players.clear();
        this.entityToPlayer.clear();
        this.uuidToName.clear();
        this.uuidToDisplayName.clear();
        this.proxyAPI.debugLog('Cleared all tracked player data.');
    }
    
    registerHandlers() {
        this.proxyAPI.on('serverPacketMonitor', ({ username, player, data, meta }) => {
            if (!player || !this.proxyAPI.isPluginEnabled('anticheat')) return;
            
            switch (meta.name) {
                case 'respawn':
                    this.proxyAPI.debugLog('Respawn detected, clearing data.');
                    this.reset();
                    break;
                case 'player_info':
                    this.handlePlayerInfo(data);
                    break;
                case 'named_entity_spawn':
                    this.handleEntitySpawn(data);
                    break;
                case 'entity_destroy':
                    this.handleEntityDestroy(data);
                    break;
                case 'entity_metadata':
                    this.handleEntityMetadata(data);
                    break;
                case 'animation':
                    this.handleAnimation(data);
                    break;
                case 'rel_entity_move':
                case 'entity_move_look':
                case 'entity_look':
                    this.handleEntityMove(data, meta.name);
                    break;
                case 'entity_teleport':
                    this.handleEntityTeleport(data);
                    break;
                case 'entity_equipment':
                    this.handleEntityEquipment(data);
                    break;
                case 'entity_effect':
                    this.handleEntityEffect(data);
                    break;
                case 'remove_entity_effect':
                    this.handleRemoveEntityEffect(data);
                    break;
            }
        });
        
        this.proxyAPI.on('clientPacketMonitor', ({ username, player, data, meta }) => {
            if (!player) return;
            
            if (meta.name === 'position' || meta.name === 'position_look') {
                this.userPosition = { x: data.x, y: data.y, z: data.z };
            }
        });
        
        this.proxyAPI.on('playerLeave', ({ username, player }) => {
            this.reset();
        });
    }
    
    extractTextFromJSON(jsonText) {
        if (typeof jsonText === 'string') {
            return jsonText;
        }
        
        let result = '';
        
        if (jsonText.text) {
            result += jsonText.text;
        }
        
        if (jsonText.extra && Array.isArray(jsonText.extra)) {
            for (const extra of jsonText.extra) {
                if (typeof extra === 'string') {
                    result += extra;
                } else if (extra.text) {
                    result += extra.text;
                }
            }
        }
        
        return result || 'Unknown';
    }
    
    addViolation(player, checkName, amount = 1) {
        if (player.violations[checkName] !== undefined) {
            player.violations[checkName] += amount;
        }
    }
    
    reduceViolation(player, checkName, amount = 1) {
        if (player.violations[checkName] !== undefined) {
            player.violations[checkName] = Math.max(0, player.violations[checkName] - amount);
        }
    }
    
    shouldAlert(player, checkName, config) {
        const hasViolations = player.violations[checkName] >= config.vl;
        const timeSinceLastAlert = Date.now() - player.lastAlerts[checkName];
        const cooldownPassed = timeSinceLastAlert > config.cooldown;
        
        return hasViolations && cooldownPassed;
    }
    
    markAlert(player, checkName) {
        if (player.lastAlerts[checkName] !== undefined) {
            player.lastAlerts[checkName] = Date.now();
        }
    }
    
    handlePlayerInfo(data) {
        if (data.action === 0) {
            data.data.forEach(player => {
                if (player.name && player.UUID) {
                    this.uuidToName.set(player.UUID, player.name);
                    let displayName = player.name;
                    if (player.displayName) {
                        try {
                            const parsed = JSON.parse(player.displayName);
                            displayName = this.extractTextFromJSON(parsed);
                        } catch (e) {
                            displayName = player.displayName;
                        }
                    }
                    this.uuidToDisplayName.set(player.UUID, displayName);
                }
            });
        }
    }
    
    handleEntitySpawn(data) {
        const playerName = this.uuidToName.get(data.playerUUID) || 'Unknown';
        const displayName = this.uuidToDisplayName.get(data.playerUUID) || playerName;
        const player = new PlayerData(playerName, data.playerUUID, data.entityId);
        
        player.displayName = displayName;
        
        player.updatePosition(
            data.x / 32.0,
            data.y / 32.0,
            data.z / 32.0,
            false
        );
        
        player.yaw = (data.yaw / 256.0) * 360.0;
        player.pitch = (data.pitch / 256.0) * 360.0;
        
        this.players.set(playerName, player);
        this.entityToPlayer.set(data.entityId, player);
        
        this.proxyAPI.debugLog(`Player spawned: ${playerName} (${displayName}) - Entity ID: ${data.entityId}`);
    }
    
    handleEntityDestroy(data) {
        data.entityIds.forEach(entityId => {
            const player = this.entityToPlayer.get(entityId);
            if (player) {
                this.players.delete(player.username);
                this.entityToPlayer.delete(entityId);
            }
        });
    }
    
    handleEntityMetadata(data) {
        const player = this.entityToPlayer.get(data.entityId);
        if (!player) return;
        
        data.metadata.forEach(entry => {
            if (entry.key === 0 && entry.type === 0) {
                const flags = entry.value;
                player.isCrouching = !!(flags & 0x02);
                player.isSprinting = !!(flags & 0x08);
                player.isUsingItem = !!(flags & 0x10);
                
                if (player.isCrouching && !player.lastCrouching) {
                    player.lastCrouchTick = player.ticksExisted;
                    
                    player.currentShiftStart = player.ticksExisted;
                    player.shiftEvents.push({
                        type: 'start',
                        tick: player.ticksExisted,
                        position: { ...player.position }
                    });
                    
                    if (player.shiftEvents.length > 50) {
                        player.shiftEvents.shift();
                    }
                    
                    this.runChecks(player);
                }
                if (!player.isCrouching && player.lastCrouching) {
                    player.lastStopCrouchTick = player.ticksExisted;
                    
                    const duration = player.currentShiftStart ? player.ticksExisted - player.currentShiftStart : 0;
                    player.shiftEvents.push({
                        type: 'stop',
                        tick: player.ticksExisted,
                        position: { ...player.position },
                        duration: duration
                    });
                    player.currentShiftStart = null;
                    
                    if (player.shiftEvents.length > 50) {
                        player.shiftEvents.shift();
                    }
                    
                    this.runChecks(player);
                }
                
                player.lastCrouching = player.isCrouching;
                player.lastSprinting = player.isSprinting;
                player.lastUsing = player.isUsingItem;
            }
        });
    }
    
    handleEntityMove(data, packetType) {
        const player = this.entityToPlayer.get(data.entityId);
        if (!player) return;
        
        let newYaw = null, newPitch = null;
        let positionChanged = false;
        
        if (packetType === 'entity_look' || packetType === 'entity_move_look') {
            newYaw = (data.yaw / 256.0) * 360.0;
            newPitch = (data.pitch / 256.0) * 360.0;
            player.yaw = newYaw;
            player.pitch = newPitch;
        }
        
        if (packetType === 'rel_entity_move' || packetType === 'entity_move_look') {
            const newX = player.position.x + (data.dX / 32.0);
            const newY = player.position.y + (data.dY / 32.0);
            const newZ = player.position.z + (data.dZ / 32.0);
            player.updatePosition(newX, newY, newZ, data.onGround || false, newYaw, newPitch);
            positionChanged = true;
        }

        if (!positionChanged && (newYaw !== null || newPitch !== null)) {
            player.updatePosition(player.position.x, player.position.y, player.position.z, player.onGround, newYaw, newPitch);
        }
        
        this.runChecks(player);
        player.tick();
    }
    
    handleEntityTeleport(data) {
        const player = this.entityToPlayer.get(data.entityId);
        if (!player) return;
        
        const newYaw = (data.yaw / 256.0) * 360.0;
        const newPitch = (data.pitch / 256.0) * 360.0;
        
        player.updatePosition(
            data.x / 32.0,
            data.y / 32.0,
            data.z / 32.0,
            data.onGround || false,
            newYaw,
            newPitch
        );
        
        player.yaw = newYaw;
        player.pitch = newPitch;
    }
    
    handleEntityEquipment(data) {
        const player = this.entityToPlayer.get(data.entityId);
        if (!player) return;
        
        // slot 0 = held item, 1-4 = armor (boots, leggings, chestplate, helmet)
        if (data.slot === 0) {
            player.heldItem = data.item;
        }
    }
    
    handleEntityEffect(data) {
        const player = this.entityToPlayer.get(data.entityId);
        if (!player) return;

        if (data.effectId === 8) { // jump boost
            player.hasJumpBoost = true;
        }
    }

    handleRemoveEntityEffect(data) {
        const player = this.entityToPlayer.get(data.entityId);
        if (!player) return;

        if (data.effectId === 8) { // jump boost
            player.hasJumpBoost = false;
        }
    }

    handleAnimation(data) {
        const player = this.entityToPlayer.get(data.entityId);
        if (!player) return;
        
        if (data.animation === 0) {
            player.swingProgress = 6;
            player.lastSwingTick = player.ticksExisted;
            player.lastSwingItem = player.heldItem;
        }
    }
    
    runChecks(player) {
        if (!this.proxyAPI.isPluginEnabled('anticheat')) return;
        
        Object.entries(this.config.checks).forEach(([checkName, checkConfig]) => {
            if (!checkConfig.enabled) return;
            
            const checkDefinition = CHECKS[checkName];
            if (checkDefinition && checkDefinition.check) {
                checkDefinition.check.call(this, player, checkConfig);
            }
        });
    }
    
    flag(player, checkName, vl) {
        const checkConfig = this.config.checks[checkName];
        if (!checkConfig) return;

        const currentPlayer = this.proxyAPI.currentPlayer;
        if (!currentPlayer) return;

        this.proxyAPI.debugLog(`Flagging ${player.displayName} for ${checkName} (VL: ${vl})`);

        if (checkConfig.alerts) {
            const message = `${this.proxyAPI.getPluginPrefix()} ${player.displayName} §7flagged §c${checkName} §8(§7VL: ${vl}§8)`;
            this.proxyAPI.sendChatMessage(currentPlayer.client, message);
        }
        
        if (checkConfig.sound && this.userPosition) {
            this.proxyAPI.sendToClient('named_sound_effect', {
                soundName: 'note.pling',
                x: this.userPosition.x * 8,
                y: this.userPosition.y * 8,
                z: this.userPosition.z * 8,
                volume: 1.0,
                pitch: 63
            });
        }
    }
}