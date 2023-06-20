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
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_api = require("./lib/api");
class IcoCloud extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: "ico-cloud"
    });
    this.pollInterval = 0;
    this.devices = [];
    this.pollTimeout = null;
    this.unloaded = false;
    this.on("ready", this.onReady.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(() => {
        !this.unloaded && resolve();
      }, ms);
    });
  }
  async onReady() {
    const instanceObject = await this.getForeignObjectAsync("system.adapter." + this.namespace);
    if (instanceObject) {
      let updateConfig = false;
      if (instanceObject.common.mode !== "schedule") {
        instanceObject.common.mode = "schedule";
        updateConfig = true;
      }
      if (instanceObject.common.schedule === void 0 || instanceObject.common.schedule === "59 * * * *") {
        this.log.info("Default schedule found and adjusted to spread calls better over the full hour.");
        instanceObject.common.schedule = Math.floor(Math.random() * 60) + " * * * *";
        updateConfig = true;
      }
      if (updateConfig) {
        this.log.debug("Updating configuration, new schedule: " + instanceObject.common.schedule);
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
        log: this.log
      });
      this.log.debug("updating devices.");
      try {
        await this.updateDevices();
      } catch (e) {
        this.log.info("Could not update devices -> will try to update measurements with known devices anyway.");
      }
      this.log.debug("updating values.");
      await this.poll();
    } else {
      this.log.info("Not authorized, yet. Please see configuration.");
    }
    this.log.debug("All done. Exit.");
    this.terminate();
  }
  async updateDevices() {
    const devices = await this.getDevicesAsync();
    let poolArray;
    let deleteAllowed = true;
    try {
      poolArray = await this.api.getPools();
    } catch (e) {
      this.log.warn("Could not update pool list: " + e + ". Trying to update know pools instead. If this happens a lot, try to login again.");
      poolArray = [];
      for (const device of devices) {
        if (device.native.id) {
          poolArray.push({ id: device.native.id });
        } else {
          this.log.warn("Pool " + device.common.name + " is missing device id. Will not be able to update.");
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
            const id = this.namespace + "." + icoDevice.uuid;
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
          this.log.error(`Could not update pool ${pool.id}: ` + e + ". If network error, retry later. Otherwise, please try to login again.");
          deleteAllowed = false;
        }
      }
    }
    if (deleteAllowed) {
      for (const device of devices) {
        this.log.debug("Deleting device " + device._id);
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
        await this.setObjectNotExistsAsync(device.uuid + ".lowBat", {
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
        await this.setObjectNotExistsAsync(device.uuid + ".offline", {
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
    const id = device.uuid + "." + type;
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
          const currState = await this.getStateAsync(device.uuid + "." + measure.data_type);
          if (!currState || currState.ts < measure.value_time.getTime()) {
            this.log.debug(`Got new Measurement for ${measure.data_type}: ${measure.value}`);
            await this.setStateAsync(device.uuid + "." + measure.data_type, {
              val: measure.value,
              ack: true,
              ts: measure.value_time.getTime()
            });
            if (measure.data_type === "battery") {
              await this.setStateChangedAsync(device.uuid + ".lowBat", {
                val: measure.value < 20,
                ack: true,
                ts: measure.value_time.getTime()
              });
            }
            if (measure.data_type === "rssi") {
              await this.setStateChangedAsync(device.uuid + ".offline", {
                val: measure.value < 5,
                ack: true,
                ts: measure.value_time.getTime()
              });
            }
          } else {
            this.log.debug(`Measurement for ${measure.data_type} was already recorded in state db.`);
          }
        } else {
          this.log.debug(`Did not read ${measure.data_type} for ${device.poolId} because ${JSON.stringify(measure.exclusion_reason)}`);
        }
      }
      await Promise.all(promises);
    } catch (e) {
      this.log.warn("Could not get measurements: " + e);
    }
  }
  async poll() {
    this.log.debug("Polling");
    const promises = [];
    for (const device of this.devices) {
      promises.push(this.updateMeasurementsOfDevice(device));
    }
    await Promise.all(promises);
    this.log.debug(`Update done.`);
  }
  onUnload(callback) {
    try {
      this.unloaded = true;
      callback();
    } catch (e) {
      callback();
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new IcoCloud(options);
} else {
  (() => new IcoCloud())();
}
//# sourceMappingURL=main.js.map
