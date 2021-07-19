"use strict";
/*
 * Created with @iobroker/create-adapter v1.34.1
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = __importStar(require("@iobroker/adapter-core"));
const api_1 = require("./lib/api");
class Ico extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: 'ico',
        });
        this.pollInterval = 0;
        this.devices = [];
        this.on('ready', this.onReady.bind(this));
        // this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here
        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        this.log.info('Configured pollinterval: ' + this.config.pollinterval);
        this.log.info('refreshToken: ' + this.config.refreshToken);
        if (this.config.refreshToken) {
            this.api = new api_1.Api({
                accessToken: this.config.accessToken,
                refreshToken: this.config.refreshToken,
                log: this.log
            });
            await this.updateDevices();
            if (this.config.pollinterval) {
                this.pollInterval = Math.max(1, this.config.pollinterval) * 60 * 1000; //convert from minutes to milliseconds.
                setTimeout(this.poll, this.pollInterval);
            }
        }
        else {
            this.log.info('Not authorized, yet. Please see configuration.');
        }
    }
    async updateDevices() {
        const devices = await this.getDevicesAsync();
        const poolArray = await this.api.getPools();
        for (const pool of poolArray) {
            if (pool.id) {
                const icoDevice = await this.api.getDevice(pool.id);
                let found = false;
                for (const device of devices) {
                    const uuid = device._id.split('.').pop();
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
                        this.devices.push(device);
                        //remove device from devices array:
                        const index = devices.indexOf(device);
                        if (index >= 0) {
                            devices.splice(index, 1);
                        }
                        break;
                    }
                }
                //create device from pool / device if necessary
                if (!found) {
                    const id = this.namespace + '.' + icoDevice.uuid;
                    const deviceObj = {
                        type: 'device',
                        common: {
                            name: pool.name
                        },
                        native: {
                            poolId: pool.id,
                            swVersion: icoDevice.sw_version,
                            hasObjects: {}
                        }
                    };
                    this.devices.push(deviceObj);
                    await this.setObjectAsync(id, deviceObj);
                }
            }
        }
        //if we still have devices, those are not in the cloud anymore -> remove.
        for (const device of devices) {
            await this.deleteDeviceAsync(device._id); //does this work as intended??
            /*const objectsToDelete = await this.getObjectListAsync({startkey: device._id + '.', endkey: device._id + '.\u9999'});
            const promises = [];
            for (const obj of objectsToDelete) {
                promises.push(this.delObjectAsync(obj._id));
            }*/
        }
    }
    async createObjectForMeasurement(device, type) {
        let role = 'state';
        let unit = undefined;
        switch (type) {
            case 'temperature': {
                role = 'value.temperature';
                unit = '°C';
                break;
            }
            case 'ph': {
                role = 'value.ph';
                break;
            }
            case 'orp': {
                role = 'value.orp';
                unit = 'mV';
                break;
            }
            case 'salt': {
                role = 'value.salt';
                unit = 'mg/L';
                break;
            }
            case 'tds': {
                role = 'value.tds';
                unit = 'ppm';
                break;
            }
            case 'battery': {
                role = 'value.battery';
                unit = '%';
                await this.setObjectNotExistsAsync(device._id + '.lowBat', {
                    type: 'state',
                    common: {
                        name: 'Low battery warning',
                        role: 'indicator.lowbat',
                        read: true,
                        write: false
                    },
                    native: {}
                });
                break;
            }
            case 'rssi': {
                role = 'value.rssi';
                unit = '%';
                await this.setObjectNotExistsAsync(device._id + '.offline', {
                    type: 'state',
                    common: {
                        name: 'Low wifi signal',
                        role: 'indicator.maintenance.unreach',
                        read: true,
                        write: false
                    },
                    native: {}
                });
                break;
            }
        }
        const id = device._id + '.' + type;
        const stateObj = {
            type: 'state',
            common: {
                name: type,
                role: role,
                read: true,
                write: false,
                unit: unit
            },
            native: {},
        };
        device.native.hasObjects[type] = true;
        await this.setObjectNotExistsAsync(id, stateObj);
    }
    async updateMeasurementsOfDevice(device) {
        const measures = await this.api.getLastMeasures(device.native.poolId);
        const promises = [];
        for (const measure of measures) {
            if (measure.is_valid) {
                if (!device.native.hasObjects[measure.data_type]) {
                    await this.createObjectForMeasurement(device, measure.data_type);
                }
                const currState = await this.getStateAsync(device._id + '.' + measure.data_type);
                if (!currState || currState.ts < measure.value_time.getTime()) {
                    await this.setStateAsync(device._id + '.' + measure.data_type, {
                        val: measure.value,
                        ack: true,
                        ts: measure.value_time.getTime()
                    });
                    if (measure.data_type === 'battery') {
                        await this.setStateChangedAsync(device._id + '.lowBat', {
                            val: measure.value < 20,
                            ack: true,
                            ts: measure.value_time.getTime()
                        });
                    }
                    if (measure.data_type === 'rssi') {
                        await this.setStateChangedAsync(device._id + '.offline', {
                            val: measure.value < 5,
                            ack: true,
                            ts: measure.value_time.getTime()
                        });
                    }
                }
                else {
                    this.log.debug(`Measurement for ${measure.data_type} was already recorded in state db.`);
                }
            }
            else {
                this.log.debug(`Did not read ${measure.data_type} for ${device.native.poolId} because ${measure.exclusion_reason}`);
            }
        }
        await Promise.all(promises);
    }
    async poll() {
        const promises = [];
        for (const device of this.devices) {
            promises.push(this.updateMeasurementsOfDevice(device));
        }
        await Promise.all(promises);
        setTimeout(() => this.poll, this.pollInterval);
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);
            callback();
        }
        catch (e) {
            callback();
        }
    }
}
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new Ico(options);
}
else {
    // otherwise start the instance directly
    (() => new Ico())();
}
//# sourceMappingURL=main.js.map