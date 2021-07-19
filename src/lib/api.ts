import axios, {AxiosError, Method} from 'axios';
import url from 'url';

// Headers:
// Accept: application/json
// Accept-Charset: utf-8
// Accept-Encoding : gzip-deflate
// Content-type: application/json

//how to limit this?
//maximum 5 requests per second
//maximum 30 requests per hour
//api says that measurements are taken every hour (?)

const baseURL = 'https://interop.ondilo.com/';
const refreshURL = baseURL + 'oauth2/token';
const client_id = 'customer_api';
const apiPrefix = baseURL + 'api/customer/v1/';

export interface Configuration {
    temperature_low: number,
    temperature_high: number,
    ph_low: number,
    ph_high: number,
    orp_low: number,
    orp_high: number,
    salt_low: number,
    salt_high: number,
    tds_low: number,
    tds_high: number,
    pool_guy_number: string,
    maintenance_day: number
}

export type PossibleTypes = 'temperature' | 'ph' | 'orp' | 'salt' | 'tds' | 'battery' | 'rssi';

// always the following units:
// Temperature: Celsius degrees (°C)
// ORP: millivolts (mV)
// Salt: milligrams per liter (mg/L)
// TDS: parts per million (ppm)
// Battery and RSSI: percent (%)
export interface Measure {
    data_type: PossibleTypes,
    value: number,
    value_time: Date,
    is_valid: boolean,
    exclusion_reason: string | null
}

export interface Recommendation {
    id: number,
    title: string,
    message: string,
    created_at: Date,
    updated_at: Date,
    status: string | 'waiting',
    deadline: Date
}

export class Api {
    private accessToken: string;
    private refreshToken: string;
    private log: ioBroker.Logger;

    public constructor(options: { refreshToken: string, accessToken: string, log: ioBroker.Logger}) {
        this.accessToken = options.accessToken;
        this.refreshToken = options.refreshToken;
        this.log = options.log;
    }

    private async doRefreshToken() : Promise<boolean> {
        try {
            const response = await axios.post(refreshURL, new url.URLSearchParams({
                refresh_token: this.refreshToken,
                grant_type: 'refresh_token',
                client_id
            }).toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            if (response.status === 200) {
                if (response.data && response.data.access_token) {
                    this.accessToken = response.data.access_token;
                    return true;
                } else {
                    this.log.warn('Refresh failed: no token in response!!: ' + JSON.stringify(response.data));
                }
            } else {
                this.log.warn('Refresh failed: ' + response.status + ' - ' + response.statusText);
            }
        } catch (e) {
            if (axios.isAxiosError(e)) {
                this.log.warn('Had network error during refresh ' + e);
            } else {
                this.log.error('Unexpected error during refresh: ' + e);
            }
        }
        return false;
    }

    private async requestInfo(urlPart: string, method: Method = 'get', triedRefresh = false) : Promise<Record<string, any> | null | string> {
        try {
            const response = await axios.request({
                url: apiPrefix + urlPart,
                method,
                responseType: method === 'get' ? 'json' : 'text',
                /*transitional: {
                    silentJSONParsing: true
                },*/
                headers: {
                    Authorization: 'Bearer ' + this.accessToken,
                    Accept: 'application/json',
                    'Accept-Charset': 'utf-8',
                    'Accept-Encoding': 'gzip, deflate'
                }
            });
            if (typeof response.data === 'string') {
                return JSON.parse(response.data);
            }
            return response.data;
        } catch (e: any | AxiosError) {
            if (axios.isAxiosError(e)) {
                const response = (e as AxiosError).response || {status: 0, data: 'Unknown failure', headers: ''};
                if (response.status === 401 && !triedRefresh) {
                    const refreshWorked = await this.doRefreshToken();
                    if (refreshWorked) {
                        return this.requestInfo(urlPart, method, true);
                    }
                } else {
                    this.log.warn(`API Error ${response.status} while getting ${urlPart}: ${response.data} - headers: ${response.headers}`);
                }
            } else {
                this.log.warn('Unexpected error getting ' + urlPart + ': ' + e.stack);
            }
        }
        return null;
    }




    //===========================================================================================================
    // ========== User stuff:
    //===========================================================================================================
    async getUser() : Promise<{lastname: string, firstname: string, email: string}> {
        const data = await this.requestInfo('user/info');
        if (typeof data === 'string') {
            return JSON.parse(data);
        }
        return <{lastname: string, firstname: string, email: string}> data;
    }

    // will return:
    //     "conductivity": "MICRO_SIEMENS_PER_CENTI_METER",
    //     "hardness": "FRENCH_DEGREE",
    //     "orp": "MILLI_VOLT",
    //     "pressure": "HECTO_PASCAL",
    //     "salt": "GRAM_PER_LITER",
    //     "speed": "METER_PER_SECOND",
    //     "temperature": "CELSIUS",
    //     "volume": "CUBIC_METER"
    async getUnits() : Promise<{conductivity: string, hardness: string, orp: string, pressure: string, salt: string, speed: string, temperature: string, volume: string}> {
        const data = await this.requestInfo('user/units');
        return <{conductivity: string, hardness: string, orp: string, pressure: string, salt: string, speed: string, temperature: string, volume: string}> data;
    }

    // Result:
    // [
    //     {
    //         "id": 234,
    //         "name": "John's Pool",
    //         "type": "outdoor_inground_pool",
    //         "volume": 15,
    //         "disinfection": {
    //             "primary": "chlorine",
    //             "secondary": {
    //                 "uv_sanitizer": true,
    //                 "ozonator": false
    //             }
    //         },
    //         "address": {
    //             "street": "162 Avenue Robert Schuman",
    //             "zipcode": "13760",
    //             "city": "Saint-Cannat",
    //             "country": "France",
    //             "latitude": 43.612282,
    //             "longitude": 5.3179397
    //         },
    //         "updated_at": "2019-11-27T23:00:21+0000"
    //     },
    //     {
    //         ...
    //     }
    // ]
    async getPools() : Promise<Array<any> > {
        const data = await this.requestInfo('pools');
        return <Array<any> > data;
    }

    async getDevice(id : string) : Promise<{uuid: string, serial_number: string, sw_version: string}> {
        const data = await this.requestInfo(`pools/${id}/device`);
        return <{uuid: string, serial_number: string, sw_version: string}> data;
    }

    async getConfiguration(id: number): Promise<Configuration> {
        const data = await this.requestInfo(`pools/${id}/configuration`);
        return <Configuration> data;
    }

    //getShares...?


    //===========================================================================================================
    // ========== Measurements:
    //===========================================================================================================

    async getLastMeasures(id: number) : Promise<Array<Measure> > {
        const data = await this.requestInfo(`pools/${id}/lastmeasures?
            types[]=temperature&
            types[]=ph&
            types[]=orp&
            types[]=salt&
            types[]=tds&
            types[]=battery&
            types[]=rssi`);
        return <Array<Measure> > data;
    }

    /**
     * Get all measures of type for the last day / week / month
     * @param id
     * @param type
     * @param period
     */
    async getMeasures(id: number, type: 'temperature' | 'ph' | 'orp' | 'salt' | 'tds' | 'battery' | 'rssi', period: 'day' | 'week' | 'month') : Promise<Array<Measure> > {
        const data = await this.requestInfo(`pools/${id}/measure?
            type=${type}&
            period=${period}`);
        return <Array<Measure> > data;
    }

    //===========================================================================================================
    // ========== Recommendations:
    //===========================================================================================================
    async getRecommendations(id: number): Promise<Array<Recommendation> > {
        const data = await this.requestInfo(`pools/${id}/recommendations`);
        return <Array<Recommendation> > data;
    }

    async validateRecommendation(poolId: number, recommendationId: number): Promise<boolean> {
        const response = await this.requestInfo(`pools/${poolId}/recommendations/${recommendationId}`, 'put');
        return ['Done', 'done', 'DONE'].includes(<string> response);
    }
}
