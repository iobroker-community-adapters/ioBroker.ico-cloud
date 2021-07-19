/*
 * Created with @iobroker/create-adapter v1.34.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';

import {Api, PossibleTypes} from './lib/api';

// Load your modules here, e.g.:
// import * as fs from "fs";

interface myDevice extends ioBroker.DeviceObject {
    native: {
        poolId: number,
        swVersion: string,
        hasObjects: Record<string, boolean>
    }
}

class Ico extends utils.Adapter {
    private api?: Api;
    private pollInterval = 0;
    private devices: Array<myDevice> = [];

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'ico',
        });
        this.on('ready', this.onReady.bind(this));
        // this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        // Initialize your adapter here

        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        this.log.info('Configured pollinterval: ' + this.config.pollinterval);
        this.log.info('refreshToken: ' + this.config.refreshToken);

        if (this.config.refreshToken) {
            this.api = new Api({
                accessToken: this.config.accessToken,
                refreshToken: this.config.refreshToken,
                log: this.log
            });

            await this.updateDevices();

            if (this.config.pollinterval) {
                this.pollInterval = Math.max(1, this.config.pollinterval) * 60 * 1000; //convert from minutes to milliseconds.
                setTimeout(this.poll, this.pollInterval);
            }
        } else {
            this.log.info('Not authorized, yet. Please see configuration.');
        }
    }

    private async updateDevices(){
        const devices = await this.getDevicesAsync();

        const poolArray = await this.api!.getPools();
        for (const pool of poolArray) {
            if (pool.id) {
                const icoDevice = await this.api!.getDevice(pool.id);

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

                        this.devices.push(<myDevice> device);
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
                    const deviceObj = <myDevice> {
                        type: 'device',
                        common: {
                            name: <string> pool.name
                        },
                        native: {
                            poolId: <number> pool.id,
                            swVersion: icoDevice.sw_version,
                            hasObjects: {}
                        }
                    }
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

    private async createObjectForMeasurement(device: myDevice, type: PossibleTypes){
        let role = 'state';
        let unit: string | undefined = undefined;
        switch (type) {
            case 'temperature': {
                role = 'value.temperature';
                unit = '°C';
                break;
            }
            case 'ph': {
                role = 'value.ph'
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
        }
        device.native.hasObjects[type] = true;
        await this.setObjectNotExistsAsync(id, stateObj as ioBroker.StateObject);
    }

    private async updateMeasurementsOfDevice(device: myDevice){
        const measures = await this.api!.getLastMeasures(device.native.poolId);
        const promises: Array<Promise<any> > = [];
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
                            val: measure.value < 20, //TODO: evaluate or make configurable...
                            ack: true,
                            ts: measure.value_time.getTime()
                        });
                    }
                    if (measure.data_type === 'rssi') {
                        await this.setStateChangedAsync(device._id + '.offline', {
                            val: measure.value < 5, //TODO: evaluate or make configurable...
                            ack: true,
                            ts: measure.value_time.getTime()
                        });
                    }
                } else {
                    this.log.debug(`Measurement for ${measure.data_type} was already recorded in state db.`);
                }
            } else {
                this.log.debug(`Did not read ${measure.data_type} for ${device.native.poolId} because ${measure.exclusion_reason}`);
            }
        }
        await Promise.all(promises);
    }

    private async poll() {
        const promises: Array<Promise<any> > = [];
        for (const device of this.devices) {
            promises.push(this.updateMeasurementsOfDevice(device));
        }
        await Promise.all(promises);
        setTimeout(() => this.poll, this.pollInterval);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload(callback: () => void): void {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);

            callback();
        } catch (e) {
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

    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  */
    // private onMessage(obj: ioBroker.Message): void {
    //     if (typeof obj === 'object' && obj.message) {
    //         if (obj.command === 'send') {
    //             // e.g. send email or pushover or whatever
    //             this.log.info('send command');

    //             // Send response in callback if required
    //             if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
    //         }
    //     }
    // }

}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Ico(options);
} else {
    // otherwise start the instance directly
    (() => new Ico())();
}
