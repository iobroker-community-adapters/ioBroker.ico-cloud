import axios, { type AxiosError, type Method } from 'axios';
import { URLSearchParams } from 'node:url';

// Headers:
// Accept: application/json
// Accept-Charset: utf-8
// Accept-Encoding : gzip-deflate
// Content-type: application/json

//how to limit this?
//maximum 5 requests per second
//maximum 30 requests per hour
//api says that measurements are taken every hour (?)

//Api Documentation: https://interop.ondilo.com/docs/api/customer/v1/
const baseURL = 'https://interop.ondilo.com/';
const tokenURL = `${baseURL}oauth2/token`;
const client_id = 'customer_api';
const apiPrefix = `${baseURL}api/customer/v1/`;
const authorizeBaseUrl = `${baseURL}oauth2/authorize`;

/**
 * Pool Configuration
 */
export interface Configuration {
    /**
     * Temperature low
     */
    temperature_low: number;
    /**
     * Temperature high
     */
    temperature_high: number;
    /**
     * pH low
     */
    ph_low: number;
    /**
     * pH high
     */
    ph_high: number;
    /**
     * ORP low
     */
    orp_low: number;
    /**
     * ORP high
     */
    orp_high: number;
    /**
     * Salt low
     */
    salt_low: number;
    /**
     * Salt high
     */
    salt_high: number;
    /**
     * TDS low
     */
    tds_low: number;
    /**
     * TDS high
     */
    tds_high: number;
    /**
     * pool guy number
     */
    pool_guy_number: string;
    /**
     * what day maintenance is done
     */
    maintenance_day: number;
}

export type PossibleTypes = 'temperature' | 'ph' | 'orp' | 'salt' | 'tds' | 'battery' | 'rssi';

// always the following units:
// Temperature: Celsius degrees (°C)
// ORP: millivolts (mV)
// Salt: milligrams per liter (mg/L)
// TDS: parts per million (ppm)
// Battery and RSSI: percent (%)
/**
 * Measurement
 */
export interface Measure {
    /**
     * data type of measurement
     */
    data_type: PossibleTypes;
    /**
     * value of measurement
     */
    value: number;
    /**
     * time of measurement
     */
    value_time: Date;
    /**
     * was measurement valid?
     */
    is_valid: boolean;
    /**
     * why did we not measure this
     */
    exclusion_reason: string | null;
}

/**
 * Recommendation
 */
export interface Recommendation {
    /**
     * id of recommendation
     */
    id: number;
    /**
     * Title of recommendation
     */
    title: string;
    /**
     * Description of recommendation
     */
    message: string;
    /**
     * Creation date of recommendation
     */
    created_at: Date;
    /**
     * Update date of recommendation
     */
    updated_at: Date;
    /**
     * Status of recommendation
     */
    status: 'waiting' | 'ok'; //not sure what else..?
    /**
     * Deadline of recommendation
     */
    deadline: Date;
}

/**
 * Class to communicate with Ondilo API
 */
export class Api {
    private accessToken: string;
    private refreshToken: string;
    private log: ioBroker.Logger;
    private readonly storeNewTokens: (accessToken: string, refreshToken: string) => Promise<any>;

    /**
     * Constructor
     *
     * @param options - options for the API
     * @param options.refreshToken - refresh token
     * @param options.accessToken - access token
     * @param options.log - logger
     * @param options.storeNewTokens - function to store new tokens
     */
    public constructor(options: {
        refreshToken: string;
        accessToken: string;
        log: ioBroker.Logger;
        storeNewTokens: (accessToken: string, refreshToken: string) => Promise<any>;
    }) {
        this.accessToken = options.accessToken;
        this.refreshToken = options.refreshToken;
        this.log = options.log;
        this.storeNewTokens = options.storeNewTokens;
    }

    private async doRefreshToken(): Promise<boolean> {
        try {
            this.log.debug('Refreshing token');
            const response = await axios.post(
                tokenURL,
                new URLSearchParams({
                    refresh_token: this.refreshToken,
                    grant_type: 'refresh_token',
                    client_id,
                }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                },
            );

            if (response.status === 200) {
                if (response.data && response.data.access_token) {
                    this.accessToken = response.data.access_token;
                    await this.storeNewTokens(response.data.access_token, response.data.refresh_token);
                    return true;
                }
                this.log.error(`No token in response. ${JSON.stringify(response.data)}`);
            } else {
                this.log.error(`Wrong status code: ${response.status} - ${JSON.stringify(response.data)}`);
            }
        } catch (e: any) {
            if (axios.isAxiosError(e)) {
                const response = (e as AxiosError).response || { status: 0, data: 'Unknown failure', headers: '' };
                throw new Error(`Could not update token: ${response.status} - ${JSON.stringify(response.data)}`);
            } else {
                this.log.error(`Unexpected error during refresh: ${e}`);
                throw new Error(`Could not update token: ${e}`);
            }
        }
        return false;
    }

    private async requestInfo(
        urlPart: string,
        method: Method = 'get',
        triedRefresh = false,
    ): Promise<Record<string, any> | null | string> {
        try {
            const headers: Record<string, string> = {
                Authorization: `Bearer ${this.accessToken}`,
                Accept: 'application/json',
                'Accept-Charset': 'utf-8',
                'Accept-Encoding': 'gzip, deflate',
            };
            if (urlPart.includes('?')) {
                headers['Content-type'] = 'application/x-www-form-urlencoded';
            }

            const response = await axios.request({
                url: apiPrefix + urlPart,
                method,
                responseType: method === 'get' ? 'json' : 'text',
                headers,
            });

            if (typeof response.data === 'string') {
                return JSON.parse(response.data);
            }
            return response.data;
        } catch (e: any) {
            if (axios.isAxiosError(e)) {
                const response = (e as AxiosError).response || { status: 0, data: 'Unknown failure', headers: '' };
                if (response.status === 401 && !triedRefresh) {
                    const refreshWorked = await this.doRefreshToken();
                    if (refreshWorked) {
                        return this.requestInfo(urlPart, method, true);
                    }
                    throw new Error(`Could not update token: ${response.status} - ${JSON.stringify(response.data)}`);
                } else {
                    throw new Error(
                        `API Error ${response.status} while getting ${urlPart}: ${JSON.stringify(response.data)} - headers: ${JSON.stringify(response.headers)}`,
                    );
                }
            } else {
                throw new Error(`Unexpected error getting ${urlPart}: ${e.stack}`);
            }
        }
    }

    /**
     * Create login url from redirect url and state variable. Used for oauth.
     *
     * @param redirectUrl - redirect url
     * @param state - state variable
     * @returns login url
     */
    static getLoginUrl(redirectUrl: string, state: string): string {
        //interop.ondilo.com/oauth2/authorize?client_id=customer_api&scope=api&redirect_uri=http://localhost:8081/oauth2_callbacks/ico-cloud.0/&response_type=code&state=ioBroker.ico-cloud1483502118005.6616
        return `${authorizeBaseUrl}?client_id=${client_id}&scope=api&response_type=code&redirect_uri=${redirectUrl}&state=${state}`;
    }

    /**
     * Get token using code from login.
     *
     * @param code - code from login
     * @param redirectUrl - redirect url used during login
     * @param log - logger
     */
    static async getToken(
        code: string,
        redirectUrl: string,
        log: any,
    ): Promise<false | { accessToken?: string; refreshToken?: string }> {
        log.debug('Sending post to get token');
        const urlPart = tokenURL;
        try {
            const result = await axios.post(
                urlPart,
                `code=${code}&grant_type=authorization_code&client_id=customer_api&redirect_uri=${redirectUrl}`,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    responseType: 'json',
                },
            );
            //log.debug(JSON.stringify(result.data));
            if (result.status === 200) {
                if (result.data && result.data.access_token) {
                    return { accessToken: result.data.access_token, refreshToken: result.data.refresh_token };
                }
                log.error(`No token in response. ${JSON.stringify(result.data)}`);
            } else {
                log.error(`${result.status} - ${JSON.stringify(result.data)}`);
            }
        } catch (e: any) {
            if (axios.isAxiosError(e)) {
                const response = (e as AxiosError).response || { status: 0, data: 'Unknown failure', headers: '' };
                log.error(
                    `API Error ${response.status} while getting ${urlPart}: ${JSON.stringify(response.data)} - headers: ${JSON.stringify(response.headers)}`,
                );
            } else {
                log.error(`Unexpected error getting ${urlPart}: ${e.stack}`);
            }
        }
        return false;
    }

    //===========================================================================================================
    // ========== User stuff:
    //===========================================================================================================
    /**
     * Get user info
     */
    async getUser(): Promise<{
        lastname: string;
        firstname: string;
        email: string;
    }> {
        const data = await this.requestInfo('user/info');
        if (typeof data === 'string') {
            return JSON.parse(data);
        }
        return <{ lastname: string; firstname: string; email: string }>data;
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
    /**
     * Get units
     */
    async getUnits(): Promise<{
        conductivity: string;
        hardness: string;
        orp: string;
        pressure: string;
        salt: string;
        speed: string;
        temperature: string;
        volume: string;
    }> {
        const data = await this.requestInfo('user/units');
        return <
            {
                conductivity: string;
                hardness: string;
                orp: string;
                pressure: string;
                salt: string;
                speed: string;
                temperature: string;
                volume: string;
            }
        >data;
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
    /**
     * Get all pools
     */
    async getPools(): Promise<Array<any>> {
        const data = await this.requestInfo('pools');
        console.log(data);
        return <Array<any>>data;
    }

    /**
     * Get pool by id
     *
     * @param id of the pool
     */
    async getDevice(id: string): Promise<{
        uuid: string;
        serial_number: string;
        sw_version: string;
    }> {
        const data = await this.requestInfo(`pools/${id}/device`);
        console.log(data);
        return <{ uuid: string; serial_number: string; sw_version: string }>data;
    }

    /**
     * Get pool configuration by id
     *
     * @param id of the pool
     */
    async getConfiguration(id: number): Promise<Configuration> {
        const data = await this.requestInfo(`pools/${id}/configuration`);
        return <Configuration>data;
    }

    //getShares...?

    //===========================================================================================================
    // ========== Measurements:
    //===========================================================================================================
    /**
     * Get last measures of all types
     *
     * @param id of the pool
     */
    async getLastMeasures(id: number): Promise<Array<Measure>> {
        const data = (await this.requestInfo(
            `pools/${id}/lastmeasures?` +
                'types[]=temperature&' +
                'types[]=ph&' +
                'types[]=orp&' +
                'types[]=salt&' +
                'types[]=tds&' +
                'types[]=battery&' +
                'types[]=rssi',
        )) as Array<Measure>;
        for (const measure of data) {
            measure.value_time = new Date(measure.value_time);
        }
        return data;
    }

    /**
     * Get all measures of type for the last day / week / month
     *
     * @param id of the pool
     * @param type type of measurement
     * @param period period of time
     */
    async getMeasures(
        id: number,
        type: 'temperature' | 'ph' | 'orp' | 'salt' | 'tds' | 'battery' | 'rssi',
        period: 'day' | 'week' | 'month',
    ): Promise<Array<Measure>> {
        const data = (await this.requestInfo(`pools/${id}/measure?
            type=${type}&
            period=${period}`)) as Array<Measure>;
        for (const measure of data) {
            measure.value_time = new Date(measure.value_time);
        }
        return data;
    }

    //===========================================================================================================
    // ========== Recommendations:
    //===========================================================================================================
    /**
     * Get all recommendations for a pool
     *
     * @param id of the pool
     */
    async getRecommendations(id: number): Promise<Array<Recommendation>> {
        const data = (await this.requestInfo(`pools/${id}/recommendations`)) as Array<Recommendation>;
        for (const recommendation of data) {
            recommendation.created_at = new Date(recommendation.created_at);
            recommendation.updated_at = new Date(recommendation.updated_at);
            recommendation.deadline = new Date(recommendation.deadline);
        }
        return data;
    }

    /**
     * mark a recommendation as done
     *
     * @param poolId id of the pool
     * @param recommendationId id of the recommendation
     */
    async validateRecommendation(poolId: number, recommendationId: number): Promise<boolean> {
        const response = await this.requestInfo(`pools/${poolId}/recommendations/${recommendationId}`, 'put');
        return ['Done', 'done', 'DONE'].includes(<string>response);
    }
}
