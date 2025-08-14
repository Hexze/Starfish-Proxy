const mc = require("minecraft-protocol");

class Hypixel {
  constructor(proxy, core) {
    this.proxy = proxy;
    this.core = core;
    this.pendingPartyInfoCallbacks = new Map();
    this.pendingPingCallbacks = new Map();
    this.pingTimestamps = new Map();
    this.callbackIdCounter = 0;
    this.handlerSetup = false;
  }

  _setupHandlers() {
    if (!this.proxy.currentPlayer?.targetClient || this.handlerSetup) return;

    this.proxy.currentPlayer.targetClient.on("custom_payload", (packet) => {
      if (packet.channel === "hypixel:party_info") {
        this._handlePartyInfoResponse(packet);
      } else if (packet.channel === "hypixel:ping") {
        this._handlePingResponse(packet);
      }
    });

    this.handlerSetup = true;
  }

  _handlePartyInfoResponse(packet) {
    try {
      const buffer = Buffer.isBuffer(packet.data)
        ? packet.data
        : Buffer.from(packet.data);
      let offset = 0;

      const readVarInt = () => {
        let value = 0;
        let position = 0;

        while (true) {
          if (offset >= buffer.length)
            throw new Error("Unexpected end of buffer");

          const byte = buffer[offset++];
          value |= (byte & 0x7f) << position;

          if ((byte & 0x80) === 0) break;

          position += 7;
          if (position >= 32) throw new Error("VarInt too big");
        }

        return value;
      };

      const readBoolean = () => {
        if (offset >= buffer.length)
          throw new Error("Unexpected end of buffer");
        return buffer[offset++] !== 0;
      };

      const readUUID = () => {
        if (offset + 16 > buffer.length)
          throw new Error("Unexpected end of buffer");

        const uuid = buffer.slice(offset, offset + 16);
        offset += 16;

        const hex = uuid.toString("hex");
        return [
          hex.substring(0, 8),
          hex.substring(8, 12),
          hex.substring(12, 16),
          hex.substring(16, 20),
          hex.substring(20, 32),
        ].join("-");
      };

      const success = readBoolean();
      if (!success) {
        const errorCode = readVarInt();
        const errorResult = {
          success: false,
          error: errorCode,
          errorMessage: this._getErrorMessage(errorCode),
        };

        for (const [id, callback] of this.pendingPartyInfoCallbacks) {
          callback(errorResult);
        }
        this.pendingPartyInfoCallbacks.clear();
        return;
      }

      const version = readVarInt();
      const inParty = readBoolean();

      const result = {
        success: true,
        version,
        inParty,
        members: [],
      };

      if (inParty) {
        const memberCount = readVarInt();

        for (let i = 0; i < memberCount; i++) {
          const uuid = readUUID();
          const roleId = readVarInt();
          const role = ["LEADER", "MOD", "MEMBER"][roleId] || "UNKNOWN";

          result.members.push({
            uuid,
            role,
          });
        }
      }

      for (const [id, callback] of this.pendingPartyInfoCallbacks) {
        callback(result);
      }
      this.pendingPartyInfoCallbacks.clear();
    } catch (error) {
      this.core.log(`Failed to parse party info response: ${error.message}`);
      const errorResult = {
        success: false,
        error: -1,
        errorMessage: "Failed to parse response",
      };

      for (const [id, callback] of this.pendingPartyInfoCallbacks) {
        callback(errorResult);
      }
      this.pendingPartyInfoCallbacks.clear();
    }
  }

  _handlePingResponse(packet) {
    try {
      const buffer = Buffer.isBuffer(packet.data)
        ? packet.data
        : Buffer.from(packet.data);
      let offset = 0;

      const readVarInt = () => {
        let value = 0;
        let position = 0;

        while (true) {
          if (offset >= buffer.length)
            throw new Error("Unexpected end of buffer");

          const byte = buffer[offset++];
          value |= (byte & 0x7f) << position;

          if ((byte & 0x80) === 0) break;

          position += 7;
          if (position >= 32) throw new Error("VarInt too big");
        }

        return value;
      };

      const readBoolean = () => {
        if (offset >= buffer.length)
          throw new Error("Unexpected end of buffer");
        return buffer[offset++] !== 0;
      };

      const readString = () => {
        const length = readVarInt();
        if (offset + length > buffer.length)
          throw new Error("Unexpected end of buffer");

        const str = buffer.toString("utf8", offset, offset + length);
        offset += length;
        return str;
      };

      const success = readBoolean();
      if (!success) {
        const errorCode = readVarInt();
        const errorResult = {
          success: false,
          error: errorCode,
          errorMessage: this._getErrorMessage(errorCode),
        };

        for (const [id, callback] of this.pendingPingCallbacks) {
          callback(errorResult);
          this.pingTimestamps.delete(id);
        }
        this.pendingPingCallbacks.clear();
        return;
      }

      const version = readVarInt();
      const response = readString();

      const endTime = Date.now();
      const results = new Map();

      for (const [id, callback] of this.pendingPingCallbacks) {
        const startTime = this.pingTimestamps.get(id) || endTime;
        const latency = endTime - startTime;

        results.set(id, {
          success: true,
          version,
          message: response,
          latency: latency,
          timestamp: endTime,
        });
      }

      for (const [id, callback] of this.pendingPingCallbacks) {
        callback(results.get(id));
      }
      this.pendingPingCallbacks.clear();

      for (const [id] of results) {
        this.pingTimestamps.delete(id);
      }
    } catch (error) {
      const errorResult = {
        success: false,
        error: -1,
        errorMessage: "Failed to parse response",
      };

      for (const [id, callback] of this.pendingPingCallbacks) {
        callback(errorResult);
        this.pingTimestamps.delete(id);
      }
      this.pendingPingCallbacks.clear();
    }
  }

  _getErrorMessage(errorCode) {
    const errorMessages = {
      1: "Not in a party",
      2: "API unavailable",
      3: "Rate limited",
      4: "Invalid request",
    };

    return errorMessages[errorCode] || `Unknown error (${errorCode})`;
  }

  getPartyInfo(callback, timeout = 5000) {
    if (!this.proxy.currentPlayer?.targetClient) {
      callback({
        success: false,
        error: -1,
        errorMessage: "Not connected to server",
      });
      return false;
    }

    if (!callback || typeof callback !== "function") {
      this.core.log("getPartyInfo requires a callback function");
      return false;
    }

    try {
      this._setupHandlers();

      const callbackId = this.callbackIdCounter++;
      this.pendingPartyInfoCallbacks.set(callbackId, callback);

      setTimeout(() => {
        if (this.pendingPartyInfoCallbacks.has(callbackId)) {
          this.pendingPartyInfoCallbacks.delete(callbackId);
          callback({
            success: false,
            error: -1,
            errorMessage: "Request timeout",
          });
        }
      }, timeout);

      const buffer = Buffer.alloc(5);
      let offset = 0;

      const version = 2;
      let value = version;
      while (value >= 0x80) {
        buffer[offset++] = (value & 0xff) | 0x80;
        value >>>= 7;
      }
      buffer[offset++] = value & 0xff;

      const data = buffer.slice(0, offset);

      this.proxy.currentPlayer.targetClient.write("custom_payload", {
        channel: "hypixel:party_info",
        data: data,
      });

      return true;
    } catch (error) {
      callback({
        success: false,
        error: -1,
        errorMessage: "Failed to send request",
      });
      return false;
    }
  }

  getPartyInfoAsync(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const success = this.getPartyInfo((result) => {
        if (result.success) {
          resolve(result);
        } else {
          reject(new Error(result.errorMessage || "Unknown error"));
        }
      }, timeout);

      if (!success) {
        reject(new Error("Failed to send request"));
      }
    });
  }

  isInParty(callback, timeout = 5000) {
    this.getPartyInfo((result) => {
      if (result.success) {
        callback(result.inParty);
      } else {
        callback(false);
      }
    }, timeout);
  }

  getPlayerRole(callback, timeout = 5000) {
    if (
      !this.proxy.currentPlayer?.targetClient ||
      !this.proxy.currentPlayer?.uuid
    ) {
      callback(null);
      return;
    }

    const playerUuid = this.proxy.currentPlayer.uuid;

    this.getPartyInfo((result) => {
      if (result.success && result.inParty) {
        const member = result.members.find((m) => m.uuid === playerUuid);
        callback(member ? member.role : null);
      } else {
        callback(null);
      }
    }, timeout);
  }

  getPing(callback, timeout = 5000) {
    if (!this.proxy.currentPlayer?.targetClient) {
      callback({
        success: false,
        error: -1,
        errorMessage: "Not connected to server",
      });
      return false;
    }

    if (!callback || typeof callback !== "function") {
      this.core.log("getPing requires a callback function");
      return false;
    }

    try {
      this._setupHandlers();

      const callbackId = this.callbackIdCounter++;
      const startTime = Date.now();

      this.pendingPingCallbacks.set(callbackId, callback);
      this.pingTimestamps.set(callbackId, startTime);

      setTimeout(() => {
        if (this.pendingPingCallbacks.has(callbackId)) {
          this.pendingPingCallbacks.delete(callbackId);
          this.pingTimestamps.delete(callbackId);
          callback({
            success: false,
            error: -1,
            errorMessage: "Request timeout",
          });
        }
      }, timeout);

      const data = Buffer.from([1]);

      this.proxy.currentPlayer.targetClient.write("custom_payload", {
        channel: "hypixel:ping",
        data: data,
      });

      return true;
    } catch (error) {
      callback({
        success: false,
        error: -1,
        errorMessage: "Failed to send request",
      });
      return false;
    }
  }

  getPingAsync(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const success = this.getPing((result) => {
        if (result.success) {
          resolve(result);
        } else {
          reject(new Error(result.errorMessage || "Unknown error"));
        }
      }, timeout);

      if (!success) {
        reject(new Error("Failed to send request"));
      }
    });
  }
}

module.exports = Hypixel;
