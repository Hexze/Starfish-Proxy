class GameState {
    constructor() {
        this.reset();
    }

    reset() {
        this.loginPacket = null;
        this.playerInfo = new Map();
        this.teamData = new Map();
        this.playerTeams = new Map();
        this.entityData = new Map();
    }

    setLoginPacket(packet) {
        this.loginPacket = packet;
    }

    /**
     * Updates stored state using server packet data
     * @param {string} metaName - Packet name
     * @param {object} data - Packet data
     */
    updateFromServerPacket(metaName, data) {
        switch (metaName) {
            case 'player_info':
                if (data.data && Array.isArray(data.data)) {
                    for (const entry of data.data) {
                        const existing = this.playerInfo.get(entry.UUID) || {};
                        if (entry.name) existing.name = entry.name;
                        if (entry.displayName) existing.displayName = entry.displayName;
                        this.playerInfo.set(entry.UUID, existing);
                    }
                }
                break;
            case 'scoreboard_team':
                this._handleScoreboardTeam(data);
                break;
            case 'named_entity_spawn':
                this.entityData.set(data.entityId, {
                    uuid: data.playerUUID,
                    position: { x: data.x / 32, y: data.y / 32, z: data.z / 32 },
                    yaw: data.yaw,
                    pitch: data.pitch,
                    onGround: true
                });
                break;
            case 'entity_destroy':
                if (Array.isArray(data.entityIds)) {
                    for (const id of data.entityIds) this.entityData.delete(id);
                }
                break;
            case 'rel_entity_move':
            case 'entity_move_look':
            case 'entity_look':
                this._updateEntityMovement(metaName, data);
                break;
            case 'entity_teleport':
                this._teleportEntity(data);
                break;
        }
    }

    _handleScoreboardTeam(data) {
        const { mode, team: teamName, players, prefix, suffix } = data;
        if (mode === 0 || mode === 2) {
            this.teamData.set(teamName, { prefix: prefix || '', suffix: suffix || '' });
            if (Array.isArray(players)) {
                for (const p of players) {
                    const clean = p.replace(/§./g, '');
                    this.playerTeams.set(clean, teamName);
                }
            }
        }
        if (mode === 3 && Array.isArray(players)) {
            for (const p of players) {
                const clean = p.replace(/§./g, '');
                this.playerTeams.set(clean, teamName);
            }
        }
        if (mode === 4 && Array.isArray(players)) {
            for (const p of players) {
                const clean = p.replace(/§./g, '');
                this.playerTeams.delete(clean);
            }
        }
        if (mode === 1) {
            this.teamData.delete(teamName);
            for (const [playerName, team] of Array.from(this.playerTeams.entries())) {
                if (team === teamName) this.playerTeams.delete(playerName);
            }
        }
    }

    _updateEntityMovement(type, data) {
        const ent = this.entityData.get(data.entityId);
        if (!ent) return;
        if (type === 'rel_entity_move' || type === 'entity_move_look') {
            ent.position.x += data.dX / 32;
            ent.position.y += data.dY / 32;
            ent.position.z += data.dZ / 32;
            ent.onGround = data.onGround;
        }
        if (type === 'entity_move_look' || type === 'entity_look') {
            ent.yaw = (data.yaw / 256) * 360;
            ent.pitch = (data.pitch / 256) * 360;
        }
    }

    _teleportEntity(data) {
        const ent = this.entityData.get(data.entityId);
        if (!ent) return;
        ent.position = { x: data.x / 32, y: data.y / 32, z: data.z / 32 };
        ent.yaw = (data.yaw / 256) * 360;
        ent.pitch = (data.pitch / 256) * 360;
        ent.onGround = data.onGround;
    }

    /** Convenience getter for a player's info by UUID */
    getPlayerInfo(uuid) {
        return this.playerInfo.get(uuid);
    }

    /** Returns team metadata by team name */
    getTeamData(teamName) {
        return this.teamData.get(teamName);
    }

    /** Returns a player's team name */
    getPlayerTeam(playerName) {
        return this.playerTeams.get(playerName);
    }

    /** Returns entity metadata by ID */
    getEntityData(entityId) {
        return this.entityData.get(entityId);
    }

    /** Returns the formatted display name for a player UUID */
    getDisplayName(uuid) {
        const info = this.playerInfo.get(uuid);
        if (!info) return null;

        let name = info.name || uuid;
        if (info.displayName) {
            try {
                const parsed = JSON.parse(info.displayName);
                name = this._extractTextFromJSON(parsed);
            } catch (e) {
                name = info.displayName;
            }
        }

        const clean = name.replace(/§./g, '');
        const teamName = this.playerTeams.get(clean);
        const team = teamName ? this.teamData.get(teamName) : null;

        return team ? `${team.prefix}${name}${team.suffix}` : name;
    }

    _extractTextFromJSON(node) {
        if (typeof node === 'string') return node;
        if (!node) return '';
        let result = node.text || '';
        if (Array.isArray(node.extra)) {
            for (const child of node.extra) {
                result += this._extractTextFromJSON(child);
            }
        }
        return result;
    }

    /**
     * Returns a plain object snapshot of current join state
     */
    getSnapshot() {
        return {
            loginPacket: this.loginPacket,
            playerInfo: Array.from(this.playerInfo.entries()),
            teamData: Array.from(this.teamData.entries()),
            playerTeams: Array.from(this.playerTeams.entries()),
            entityData: Array.from(this.entityData.entries())
        };
    }
}

module.exports = GameState;
