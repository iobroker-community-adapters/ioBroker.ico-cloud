"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_api = require("./lib/api");
function encryptDecrypt(key, value) {
  if (!value || !key) {
    return value;
  }
  let result = "";
  for (let i = 0; i < value.length; ++i) {
    result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
  }
  return result;
}
class IcoCloud extends utils.Adapter {
  api;
  pollInterval = 0;
  devices = [];
  pollTimeout = null;
  unloaded = false;
  redirectURI = "";
  oauthStateCode = "";
  sleeps = [];
  constructor(options = {}) {
    super({
      ...options,
      name: "ico-cloud"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async sleep(ms) {
    return new Promise((resolve) => {
      this.sleeps.push(
        setTimeout(() => {
          !this.unloaded && resolve();
        }, ms)
      );
    });
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    const instanceObject = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
    if (instanceObject) {
      let updateConfig = false;
      if (instanceObject.common.mode !== "schedule") {
        instanceObject.common.mode = "schedule";
        updateConfig = true;
      }
      if (instanceObject.common.schedule === void 0 || instanceObject.common.schedule === "59 * * * *") {
        this.log.info("Default schedule found and adjusted to spread calls better over the full hour.");
        instanceObject.common.schedule = `${Math.floor(Math.random() * 60)} ${Math.floor(Math.random() * 60)} * * * *`;
        updateConfig = true;
      }
      if (updateConfig) {
        this.log.debug(`Updating configuration, new schedule: ${instanceObject.common.schedule}`);
        await this.setForeignObjectAsync(instanceObject._id, instanceObject);
      }
    }
    const delay = Math.floor(Math.random() * 3e4);
    this.log.debug(`Delay execution by ${delay}ms to better spread API calls`);
    await this.sleep(delay);
    if (this.config.refreshToken) {
      this.api = new import_api.Api({
        accessToken: this.config.accessToken,
        refreshToken: this.config.refreshToken,
        log: this.log,
        storeNewTokens: this.storeNewTokens.bind(this)
      });
      this.log.debug("updating devices.");
      try {
        await this.updateDevices();
      } catch (e) {
        this.log.info("Could not update devices -> will try to update measurements with known devices anyway.");
        this.log.debug(`Error: ${e}`);
      }
      this.log.debug("updating values.");
      await this.poll();
      this.log.debug("All done. Exit.");
      this.terminate();
    } else {
      this.log.info(
        "Not authorized, yet. Please see configuration. Letting adapter run to process oauth2 callback."
      );
    }
  }
  async updateDevices() {
    var _a;
    const devices = await this.getDevicesAsync();
    let poolArray;
    let deleteAllowed = true;
    try {
      poolArray = await this.api.getPools();
    } catch (e) {
      this.log.warn(
        `Could not update pool list: ${e}. Trying to update know pools instead. If this happens a lot, try to login again.`
      );
      poolArray = [];
      for (const device of devices) {
        if (device.native.id) {
          poolArray.push({ id: device.native.id });
        } else {
          this.log.warn(
            `Pool ${(_a = device == null ? void 0 : device.common) == null ? void 0 : _a.name} is missing device id. Will not be able to update.`
          );
          deleteAllowed = false;
        }
      }
    }
    for (const pool of poolArray) {
      if (pool.id) {
        try {
          const icoDevice = await this.api.getDevice(pool.id);
          let found = false;
          for (const device of devices) {
            const uuid = device._id.split(".").pop();
            if (uuid === icoDevice.uuid) {
              found = true;
              let needsUpdate = false;
              if (device.native.poolId !== pool.id) {
                needsUpdate = true;
                device.native.poolId = pool.id;
              }
              if (device.native.swVersion !== icoDevice.sw_version) {
                needsUpdate = true;
                device.native.swVersion = icoDevice.sw_version;
              }
              if (needsUpdate) {
                await this.setObjectAsync(device._id, device);
              }
              this.devices.push({
                poolId: pool.id,
                swVersion: icoDevice.sw_version,
                uuid: icoDevice.uuid,
                hasObjects: {}
              });
              const index = devices.indexOf(device);
              if (index >= 0) {
                devices.splice(index, 1);
              }
              break;
            }
          }
          if (!found) {
            const id = `${this.namespace}.${icoDevice.uuid}`;
            const deviceObj = {
              type: "device",
              common: {
                name: pool.name
              },
              native: {
                poolId: pool.id,
                swVersion: icoDevice.sw_version
              }
            };
            this.devices.push({
              poolId: deviceObj.native.poolId,
              swVersion: deviceObj.native.swVersion,
              hasObjects: {},
              uuid: icoDevice.uuid
            });
            await this.setObjectAsync(id, deviceObj);
          }
        } catch (e) {
          this.log.error(
            `Could not update pool ${pool.id}: ${e}. If network error, retry later. Otherwise, please try to login again.`
          );
          deleteAllowed = false;
        }
      }
    }
    if (deleteAllowed) {
      for (const device of devices) {
        this.log.debug(`Deleting device ${device._id}`);
        await this.delObjectAsync(device._id.split(".").pop(), { recursive: true });
      }
    } else {
      for (const deviceObj of devices) {
        this.devices.push({
          poolId: deviceObj.native.poolId,
          swVersion: deviceObj.native.swVersion,
          hasObjects: {},
          uuid: deviceObj._id.split(".").pop() || ""
        });
      }
    }
  }
  async createObjectForMeasurement(device, type) {
    let role = "state";
    let unit = void 0;
    switch (type) {
      case "temperature": {
        role = "value.temperature";
        unit = "\xB0C";
        break;
      }
      case "ph": {
        role = "value";
        break;
      }
      case "orp": {
        role = "value";
        unit = "mV";
        break;
      }
      case "salt": {
        role = "value";
        unit = "mg/L";
        break;
      }
      case "tds": {
        role = "value";
        unit = "ppm";
        break;
      }
      case "battery": {
        role = "value.battery";
        unit = "%";
        await this.setObjectNotExistsAsync(`${device.uuid}.lowBat`, {
          type: "state",
          common: {
            name: "Low battery warning",
            role: "indicator.lowbat",
            type: "boolean",
            read: true,
            write: false
          },
          native: {}
        });
        break;
      }
      case "rssi": {
        role = "value.rssi";
        unit = "%";
        await this.setObjectNotExistsAsync(`${device.uuid}.offline`, {
          type: "state",
          common: {
            name: "Low wifi signal",
            role: "indicator.maintenance.unreach",
            type: "boolean",
            read: true,
            write: false
          },
          native: {}
        });
        break;
      }
    }
    const id = `${device.uuid}.${type}`;
    const stateObj = {
      type: "state",
      common: {
        name: type,
        type: "number",
        role,
        read: true,
        write: false,
        unit
      },
      native: {}
    };
    device.hasObjects[type] = true;
    await this.setObjectNotExistsAsync(id, stateObj);
  }
  async updateMeasurementsOfDevice(device) {
    try {
      const measures = await this.api.getLastMeasures(device.poolId);
      const promises = [];
      for (const measure of measures) {
        if (measure.is_valid) {
          if (!device.hasObjects[measure.data_type]) {
            await this.createObjectForMeasurement(device, measure.data_type);
          }
          const currState = await this.getStateAsync(`${device.uuid}.${measure.data_type}`);
          if (!currState || currState.ts < measure.value_time.getTime()) {
            this.log.debug(`Got new Measurement for ${measure.data_type}: ${measure.value}`);
            await this.setStateAsync(`${device.uuid}.${measure.data_type}`, {
              val: measure.value,
              ack: true,
              ts: measure.value_time.getTime()
            });
            if (measure.data_type === "battery") {
              await this.setStateChangedAsync(`${device.uuid}.lowBat`, {
                val: measure.value < 20,
                //TODO: evaluate or make configurable...
                ack: true,
                ts: measure.value_time.getTime()
              });
            }
            if (measure.data_type === "rssi") {
              await this.setStateChangedAsync(`${device.uuid}.offline`, {
                val: measure.value < 5,
                //TODO: evaluate or make configurable...
                ack: true,
                ts: measure.value_time.getTime()
              });
            }
          } else {
            this.log.debug(`Measurement for ${measure.data_type} was already recorded in state db.`);
          }
        } else {
          this.log.debug(
            `Did not read ${measure.data_type} for ${device.poolId} because ${JSON.stringify(measure.exclusion_reason)}`
          );
        }
      }
      await Promise.all(promises);
    } catch (e) {
      this.log.warn(`Could not get measurements: ${e}`);
    }
  }
  /**
   * Update recommendations for device.
   *
   * @param device - device to update
   */
  async updateRecommendationsOfDevice(device) {
    try {
      const recommendations = await this.api.getRecommendations(device.poolId);
      await this.setObjectNotExistsAsync(`${device.uuid}.recommendations`, {
        type: "channel",
        common: {
          name: "Recommendations"
        },
        native: {}
      });
      let lastRecommendation;
      const recommendationsStored = [];
      for (const recommendation of recommendations) {
        if (Date.now() < recommendation.deadline.getTime() && recommendation.status !== "ok") {
          recommendationsStored.push(recommendation.id);
        } else {
          this.log.debug(
            `Recommendation ignored, because deadline is over or status is ok: ${Date.now() >= recommendation.deadline.getTime()} - ${recommendation.status} - ${JSON.stringify(recommendation)}`
          );
          continue;
        }
        await this.setObjectNotExistsAsync(`${device.uuid}.recommendations.${recommendation.id}`, {
          type: "state",
          common: {
            name: recommendation.id.toString(10),
            type: "string",
            role: "text",
            read: true,
            write: false
          },
          native: {}
        });
        await this.setState(`${device.uuid}.recommendations.${recommendation.id}`, recommendation.title, true);
        if (!lastRecommendation || recommendation.updated_at.getTime() > lastRecommendation.updated_at.getTime()) {
          lastRecommendation = recommendation;
        }
      }
      if (lastRecommendation) {
        await this.setObjectNotExistsAsync(`${device.uuid}.recommendations.lastRecommendation`, {
          type: "state",
          common: {
            name: "Last recommendation",
            type: "string",
            role: "text",
            read: true,
            write: false
          },
          native: {}
        });
        await this.setState(
          `${device.uuid}.recommendations.lastRecommendation`,
          lastRecommendation.title,
          true
        );
      } else {
        const lastRecThere = await this.objectExists(`${device.uuid}.recommendations.lastRecommendation`);
        if (lastRecThere) {
          await this.delStateAsync(`${device.uuid}.recommendations.lastRecommendation`);
        }
      }
      const recommendationObjects = await this.getStatesAsync(`${device.uuid}.recommendations.*`);
      for (const id of Object.keys(recommendationObjects)) {
        let found = false;
        if (!id.includes("lastRecommendation")) {
          const recId = Number(id.split(".").pop());
          for (const recommendation of recommendationsStored) {
            if (recommendation === recId) {
              found = true;
              break;
            }
          }
          if (!found) {
            this.log.debug(`Deleting recommendation ${id}`);
            await this.delObjectAsync(id, { recursive: true });
          }
        }
      }
    } catch (e) {
      this.log.warn(`Could not get recommendations: ${e}`);
    }
  }
  async poll() {
    this.log.debug("Polling");
    const promises = [];
    for (const device of this.devices) {
      promises.push(this.updateMeasurementsOfDevice(device));
      promises.push(this.updateRecommendationsOfDevice(device));
    }
    await Promise.all(promises);
    this.log.debug(`Update done.`);
  }
  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   *
   * @param callback - callback function
   */
  onUnload(callback) {
    try {
      this.unloaded = true;
      for (const sleep of this.sleeps) {
        clearTimeout(sleep);
      }
      callback();
    } catch (e) {
      console.error("Error during unloading:", e);
      callback();
    }
  }
  // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
  // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
  // /**
  //  * Is called if a subscribed object changes
  //  */
  // private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
  //     if (obj) {
  //         // The object was changed
  //         this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
  //     } else {
  //         // The object was deleted
  //         this.log.info(`object ${id} deleted`);
  //     }
  // }
  /**
   * Is called if a subscribed state changes
   */
  // private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
  //     if (state) {
  //         // The state was changed
  //         this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
  //     } else {
  //         // The state was deleted
  //         this.log.info(`state ${id} deleted`);
  //     }
  // }
  /**
   * Store new tokens in adapter config.
   *
   * @param accessToken - access token
   * @param refreshToken - refresh token
   * @param noAdapterRestart - if true, don't restart adapter otherwise writing the config object will trigger a restart.
   */
  async storeNewTokens(accessToken, refreshToken, noAdapterRestart = false) {
    var _a;
    const systemConfig = await this.getForeignObjectAsync("system.config");
    const secrect = ((_a = systemConfig == null ? void 0 : systemConfig.native) == null ? void 0 : _a.secret) || "RJaeBLRPwvPfh5O";
    const instance = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
    instance.native.accessToken = accessToken ? encryptDecrypt(secrect, accessToken) : instance.native.accessToken;
    instance.native.refreshToken = refreshToken ? encryptDecrypt(secrect, refreshToken) : instance.native.refreshToken;
    if (!noAdapterRestart) {
      await this.setForeignObject(`system.adapter.${this.namespace}`, instance);
    }
    return instance;
  }
  // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
  /**
   * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
   * Using this method requires "common.messagebox" property to be set to true in io-package.json
   *
   * @param obj - message object
   */
  async onMessage(obj) {
    if (typeof obj === "object" && obj.message) {
      this.log.debug(`Message: ${JSON.stringify(obj)}`);
      if (obj.command === "getOAuthStartLink") {
        const baseUrl = obj.message.redirectUriBase;
        this.redirectURI = `${baseUrl}oauth2_callbacks/${this.namespace}/`;
        this.oauthStateCode = `ico-cloud-${Math.floor(Math.random() * 1e5)}-${Date.now()}`;
        this.log.debug(`Got redirect URI: ${this.redirectURI}. Storing state ${this.oauthStateCode}`);
        const loginUrl = import_api.Api.getLoginUrl(this.redirectURI, this.oauthStateCode);
        this.log.debug(`Got login URL: ${loginUrl}`);
        if (obj.callback) {
          this.sendTo(obj.from, obj.command, { openUrl: loginUrl }, obj.callback);
        }
      }
      if (obj.command === "oauth2Callback") {
        this.log.debug(`Got oauth2 callback, trying to get access token. Stored state: ${this.oauthStateCode}`);
        if (this.oauthStateCode === obj.message.state) {
          const result = await import_api.Api.getToken(obj.message.code, this.redirectURI, this.log);
          if (obj.callback) {
            if (result) {
              const instance = await this.storeNewTokens(result.accessToken, result.refreshToken, true);
              this.sendTo(
                obj.from,
                obj.command,
                { result: "loginSuccessMessage", native: result, saveConfig: true },
                obj.callback
              );
              await this.setForeignObject(`system.adapter.${this.namespace}`, instance);
            } else {
              this.sendTo(obj.from, obj.command, { error: "loginErrorMessage" }, obj.callback);
            }
          }
        } else {
          if (obj.callback) {
            this.sendTo(obj.from, obj.command, { error: "loginWrongStateMessage" }, obj.callback);
          }
        }
      }
      if (obj.command === "resetTokens") {
        this.log.debug(`Got reset tokens command.`);
        if (obj.callback) {
          this.sendTo(
            obj.from,
            obj.command,
            {
              native: { accessToken: "", refreshToken: "" },
              saveConfig: false
            },
            obj.callback
          );
        }
      }
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new IcoCloud(options);
} else {
  (() => new IcoCloud())();
}
//# sourceMappingURL=main.js.map
