/*
 * Created with @iobroker/create-adapter v2.1.1
 */

//Api Documentation: https://interop.ondilo.com/docs/api/customer/v1/

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core';

import {Api, PossibleTypes} from './lib/api';

// Load your modules here, e.g.:
// import * as fs from "fs";

interface myDevice {
    poolId: number,
    swVersion: string,
    hasObjects: Record<string, boolean>
    uuid: string
}

class IcoCloud extends utils.Adapter {
    private api?: Api;
    private pollInterval = 0;
    private devices: Array<myDevice> = [];
    private pollTimeout : NodeJS.Timeout | null = null;
    private unloaded = false;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'ico-cloud',
        });
        this.on('ready', this.onReady.bind(this));
        // this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(() => { !this.unloaded && resolve() }, ms);
        });
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        // Initialize your adapter here

        //update from daemon to schedule and maybe set random schedule.
        const instanceObject = await this.getForeignObjectAsync('system.adapter.' + this.namespace);
        if (instanceObject) {
            let updateConfig = false;
            if (instanceObject.common.mode !== 'schedule') {
                instanceObject.common.mode = 'schedule';
                updateConfig = true;
            }
            if (instanceObject.common.schedule === undefined || instanceObject.common.schedule === '59 * * * *') {
                this.log.info('Default schedule found and adjusted to spread calls better over the full hour.');
                instanceObject.common.schedule = `${Math.floor(Math.random() * 60)} ${Math.floor(Math.random() * 60)} * * * *`;
                updateConfig = true;
            }
            if (updateConfig) {
                this.log.debug('Updating configuration, new schedule: ' + instanceObject.common.schedule);
                await this.setForeignObjectAsync(instanceObject._id, instanceObject);
            }
        }

        const delay = Math.floor(Math.random() * 30000);
        this.log.debug(`Delay execution by ${delay}ms to better spread API calls`);
        //await this.sleep(delay);

        if (this.config.refreshToken) {
            this.api = new Api({
                accessToken: this.config.accessToken,
                refreshToken: this.config.refreshToken,
                log: this.log
            });

            this.log.debug('updating devices.');
            try {
                await this.updateDevices();
            } catch (e) {
                this.log.info('Could not update devices -> will try to update measurements with known devices anyway.');
            }
            this.log.debug('updating values.');
            await this.poll();
        } else {
            this.log.info('Not authorized, yet. Please see configuration.');
        }

        this.log.debug('All done. Exit.');
        this.terminate();
    }

    private async updateDevices() : Promise<void> {
        const devices = await this.getDevicesAsync();

        let poolArray : any[];
        let deleteAllowed = true;
        try {
            poolArray = await this.api!.getPools();
        } catch (e) {
            this.log.warn('Could not update pool list: ' + e + '. Trying to update know pools instead. If this happens a lot, try to login again.');
            poolArray = [];
            for (const device of devices) {
                if (device.native.id) {
                    poolArray.push({id: device.native.id});
                } else {
                    this.log.warn('Pool ' + device.common.name + ' is missing device id. Will not be able to update.');
                    deleteAllowed = false;
                }
            }
        }

        //now get information about each pool.
        for (const pool of poolArray) {
            if (pool.id) {
                try {
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

                            this.devices.push({
                                poolId: pool.id as number,
                                swVersion: icoDevice.sw_version,
                                uuid: icoDevice.uuid,
                                hasObjects: {}
                            });
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
                            type: 'device' as const,
                            common: {
                                name: <string>pool.name
                            },
                            native: {
                                poolId: pool.id as number,
                                swVersion: icoDevice.sw_version
                            }
                        }
                        this.devices.push({
                            poolId: deviceObj.native.poolId,
                            swVersion: deviceObj.native.swVersion,
                            hasObjects: {},
                            uuid: icoDevice.uuid
                        });
                        await this.setObjectAsync(id, deviceObj);
                    }
                } catch (e) {
                    this.log.error(`Could not update pool ${pool.id}: ` + e + '. If network error, retry later. Otherwise, please try to login again.');
                    deleteAllowed = false;
                }
            }
        }

        //if we still have devices, those are not in the cloud anymore -> remove.
        if (deleteAllowed) {
            for (const device of devices) {
                this.log.debug('Deleting device ' + device._id);
                await this.delObjectAsync(device._id.split('.').pop() as string, {recursive: true});
            }
        } else {
            //fill this.devices from remaining objects:
            for (const deviceObj of devices) {
                this.devices.push({
                    poolId: deviceObj.native.poolId,
                    swVersion: deviceObj.native.swVersion,
                    hasObjects: {},
                    uuid: deviceObj._id.split('.').pop() || ''
                });
            }
        }
    }

    private async createObjectForMeasurement(device: myDevice, type: PossibleTypes) : Promise<void> {
        let role  = 'state';
        let unit: string | undefined = undefined;
        switch (type) {
            case 'temperature': {
                role = 'value.temperature';
                unit = '°C';
                break;
            }
            case 'ph': {
                role = 'value'
                break;
            }
            case 'orp': {
                role = 'value';
                unit = 'mV';
                break;
            }
            case 'salt': {
                role = 'value';
                unit = 'mg/L';
                break;
            }
            case 'tds': {
                role = 'value';
                unit = 'ppm';
                break;
            }
            case 'battery': {
                role = 'value.battery';
                unit = '%';
                await this.setObjectNotExistsAsync(device.uuid + '.lowBat', {
                    type: 'state',
                    common: {
                        name: 'Low battery warning',
                        role: 'indicator.lowbat',
                        type: 'boolean',
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
                await this.setObjectNotExistsAsync(device.uuid + '.offline', {
                    type: 'state',
                    common: {
                        name: 'Low wifi signal',
                        role: 'indicator.maintenance.unreach',
                        type: 'boolean',
                        read: true,
                        write: false
                    },
                    native: {}
                });
                break;
            }
        }
        const id  = device.uuid + '.' + type;
        const stateObj : ioBroker.SettableObject = {
            type: 'state',
            common: {
                name: type,
                type: 'number',
                role: role,
                read: true,
                write: false,
                unit: unit
            },
            native: {},
        }
        device.hasObjects[type] = true;
        await this.setObjectNotExistsAsync(id, stateObj);
    }

    private async updateMeasurementsOfDevice(device: myDevice) : Promise<void> {
        try {
            const measures = await this.api!.getLastMeasures(device.poolId);
            const promises: Array<Promise<any>> = [];
            for (const measure of measures) {
                if (measure.is_valid) {
                    if (!device.hasObjects[measure.data_type]) {
                        await this.createObjectForMeasurement(device, measure.data_type);
                    }
                    const currState = await this.getStateAsync(device.uuid + '.' + measure.data_type);
                    if (!currState || currState.ts < measure.value_time.getTime()) {
                        this.log.debug(`Got new Measurement for ${measure.data_type}: ${measure.value}`);
                        await this.setStateAsync(device.uuid + '.' + measure.data_type, {
                            val: measure.value,
                            ack: true,
                            ts: measure.value_time.getTime()
                        });
                        if (measure.data_type === 'battery') {
                            await this.setStateChangedAsync(device.uuid + '.lowBat', {
                                val: measure.value < 20, //TODO: evaluate or make configurable...
                                ack: true,
                                ts: measure.value_time.getTime()
                            });
                        }
                        if (measure.data_type === 'rssi') {
                            await this.setStateChangedAsync(device.uuid + '.offline', {
                                val: measure.value < 5, //TODO: evaluate or make configurable...
                                ack: true,
                                ts: measure.value_time.getTime()
                            });
                        }
                    } else {
                        this.log.debug(`Measurement for ${measure.data_type} was already recorded in state db.`);
                    }
                } else {
                    //can be {"slug":"ICO_OUT_OF_WATER"} -> maybe record to some error state?
                    this.log.debug(`Did not read ${measure.data_type} for ${device.poolId} because ${JSON.stringify(measure.exclusion_reason)}`);
                }
            }
            await Promise.all(promises);
        } catch (e) {
            this.log.warn('Could not get measurements: ' + e);
        }
    }

    private async poll() : Promise<void> {
        this.log.debug('Polling');
        const promises: Array<Promise<any> > = [];
        for (const device of this.devices) {
            promises.push(this.updateMeasurementsOfDevice(device));
        }
        await Promise.all(promises);
        this.log.debug(`Update done.`);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload(callback: () => void): void {
        try {
            this.unloaded = true;
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
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new IcoCloud(options);
} else {
    // otherwise start the instance directly
    (() => new IcoCloud())();
}
