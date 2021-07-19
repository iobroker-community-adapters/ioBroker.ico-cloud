"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Api = void 0;
const axios_1 = __importDefault(require("axios"));
const url_1 = __importDefault(require("url"));
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
class Api {
    constructor(options) {
        this.accessToken = options.accessToken;
        this.refreshToken = options.refreshToken;
        this.log = options.log;
    }
    async doRefreshToken() {
        try {
            const response = await axios_1.default.post(refreshURL, new url_1.default.URLSearchParams({
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
                }
                else {
                    this.log.warn('Refresh failed: no token in response!!: ' + JSON.stringify(response.data));
                }
            }
            else {
                this.log.warn('Refresh failed: ' + response.status + ' - ' + response.statusText);
            }
        }
        catch (e) {
            if (axios_1.default.isAxiosError(e)) {
                this.log.warn('Had network error during refresh ' + e);
            }
            else {
                this.log.error('Unexpected error during refresh: ' + e);
            }
        }
        return false;
    }
    async requestInfo(urlPart, method = 'get', triedRefresh = false) {
        try {
            this.log.debug('Using token: ' + this.accessToken);
            const response = await axios_1.default.request({
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
        }
        catch (e) {
            if (axios_1.default.isAxiosError(e)) {
                const response = e.response || { status: 0, data: 'Unknown failure', headers: '' };
                if (response.status === 401 && !triedRefresh) {
                    this.log.debug('Old token: ' + this.accessToken);
                    const refreshWorked = await this.doRefreshToken();
                    if (refreshWorked) {
                        this.log.debug('New token: ' + this.accessToken);
                        return this.requestInfo(urlPart, method, true);
                    }
                }
                else {
                    this.log.warn(`API Error ${response.status} while getting ${urlPart}: ${response.data} - headers: ${response.headers}`);
                }
            }
            else {
                this.log.warn('Unexpected error getting ' + urlPart + ': ' + e.stack);
            }
        }
        return null;
    }
    //===========================================================================================================
    // ========== User stuff:
    //===========================================================================================================
    async getUser() {
        const data = await this.requestInfo('user/info');
        if (typeof data === 'string') {
            return JSON.parse(data);
        }
        return data;
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
    async getUnits() {
        const data = await this.requestInfo('user/units');
        return data;
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
    async getPools() {
        const data = await this.requestInfo('pools');
        return data;
    }
    async getDevice(id) {
        const data = await this.requestInfo(`pools/${id}/device`);
        return data;
    }
    async getConfiguration(id) {
        const data = await this.requestInfo(`pools/${id}/configuration`);
        return data;
    }
    //getShares...?
    //===========================================================================================================
    // ========== Measurements:
    //===========================================================================================================
    async getLastMeasures(id) {
        const data = await this.requestInfo(`pools/${id}/lastmeasures?
            types[]=temperature&
            types[]=ph&
            types[]=orp&
            types[]=salt&
            types[]=tds&
            types[]=battery&
            types[]=rssi`);
        return data;
    }
    /**
     * Get all measures of type for the last day / week / month
     * @param id
     * @param type
     * @param period
     */
    async getMeasures(id, type, period) {
        const data = await this.requestInfo(`pools/${id}/measure?
            type=${type}&
            period=${period}`);
        return data;
    }
    //===========================================================================================================
    // ========== Recommendations:
    //===========================================================================================================
    async getRecommendations(id) {
        const data = await this.requestInfo(`pools/${id}/recommendations`);
        return data;
    }
    async validateRecommendation(poolId, recommendationId) {
        const response = await this.requestInfo(`pools/${poolId}/recommendations/${recommendationId}`, 'put');
        return ['Done', 'done', 'DONE'].includes(response);
    }
}
exports.Api = Api;
//# sourceMappingURL=api.js.map