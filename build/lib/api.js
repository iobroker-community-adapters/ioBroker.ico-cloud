"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var api_exports = {};
__export(api_exports, {
  Api: () => Api
});
module.exports = __toCommonJS(api_exports);
var import_axios = __toESM(require("axios"));
var import_node_url = require("node:url");
const baseURL = "https://interop.ondilo.com/";
const tokenURL = `${baseURL}oauth2/token`;
const client_id = "customer_api";
const apiPrefix = `${baseURL}api/customer/v1/`;
const authorizeBaseUrl = `${baseURL}oauth2/authorize`;
class Api {
  accessToken;
  refreshToken;
  log;
  storeNewTokens;
  /**
   * Constructor
   *
   * @param options - options for the API
   * @param options.refreshToken - refresh token
   * @param options.accessToken - access token
   * @param options.log - logger
   * @param options.storeNewTokens - function to store new tokens
   */
  constructor(options) {
    this.accessToken = options.accessToken;
    this.refreshToken = options.refreshToken;
    this.log = options.log;
    this.storeNewTokens = options.storeNewTokens;
  }
  async doRefreshToken() {
    try {
      this.log.debug("Refreshing token");
      const response = await import_axios.default.post(
        tokenURL,
        new import_node_url.URLSearchParams({
          refresh_token: this.refreshToken,
          grant_type: "refresh_token",
          client_id
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
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
    } catch (e) {
      if (import_axios.default.isAxiosError(e)) {
        const response = e.response || { status: 0, data: "Unknown failure", headers: "" };
        throw new Error(`Could not update token: ${response.status} - ${JSON.stringify(response.data)}`);
      } else {
        this.log.error(`Unexpected error during refresh: ${e}`);
        throw new Error(`Could not update token: ${e}`);
      }
    }
    return false;
  }
  async requestInfo(urlPart, method = "get", triedRefresh = false) {
    try {
      const headers = {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
        "Accept-Charset": "utf-8",
        "Accept-Encoding": "gzip, deflate"
      };
      if (urlPart.includes("?")) {
        headers["Content-type"] = "application/x-www-form-urlencoded";
      }
      const response = await import_axios.default.request({
        url: apiPrefix + urlPart,
        method,
        responseType: method === "get" ? "json" : "text",
        headers
      });
      if (typeof response.data === "string") {
        return JSON.parse(response.data);
      }
      return response.data;
    } catch (e) {
      if (import_axios.default.isAxiosError(e)) {
        const response = e.response || { status: 0, data: "Unknown failure", headers: "" };
        if (response.status === 401 && !triedRefresh) {
          const refreshWorked = await this.doRefreshToken();
          if (refreshWorked) {
            return this.requestInfo(urlPart, method, true);
          }
          throw new Error(`Could not update token: ${response.status} - ${JSON.stringify(response.data)}`);
        } else {
          throw new Error(
            `API Error ${response.status} while getting ${urlPart}: ${JSON.stringify(response.data)} - headers: ${JSON.stringify(response.headers)}`
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
  static getLoginUrl(redirectUrl, state) {
    return `${authorizeBaseUrl}?client_id=${client_id}&scope=api&response_type=code&redirect_uri=${redirectUrl}&state=${state}`;
  }
  /**
   * Get token using code from login.
   *
   * @param code - code from login
   * @param redirectUrl - redirect url used during login
   * @param log - logger
   */
  static async getToken(code, redirectUrl, log) {
    log.debug("Sending post to get token");
    const urlPart = tokenURL;
    try {
      const result = await import_axios.default.post(
        urlPart,
        `code=${code}&grant_type=authorization_code&client_id=customer_api&redirect_uri=${redirectUrl}`,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          responseType: "json"
        }
      );
      if (result.status === 200) {
        if (result.data && result.data.access_token) {
          return { accessToken: result.data.access_token, refreshToken: result.data.refresh_token };
        }
        log.error(`No token in response. ${JSON.stringify(result.data)}`);
      } else {
        log.error(`${result.status} - ${JSON.stringify(result.data)}`);
      }
    } catch (e) {
      if (import_axios.default.isAxiosError(e)) {
        const response = e.response || { status: 0, data: "Unknown failure", headers: "" };
        log.error(
          `API Error ${response.status} while getting ${urlPart}: ${JSON.stringify(response.data)} - headers: ${JSON.stringify(response.headers)}`
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
  async getUser() {
    const data = await this.requestInfo("user/info");
    if (typeof data === "string") {
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
  /**
   * Get units
   */
  async getUnits() {
    const data = await this.requestInfo("user/units");
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
  /**
   * Get all pools
   */
  async getPools() {
    const data = await this.requestInfo("pools");
    console.log(data);
    return data;
  }
  /**
   * Get pool by id
   *
   * @param id of the pool
   */
  async getDevice(id) {
    const data = await this.requestInfo(`pools/${id}/device`);
    console.log(data);
    return data;
  }
  /**
   * Get pool configuration by id
   *
   * @param id of the pool
   */
  async getConfiguration(id) {
    const data = await this.requestInfo(`pools/${id}/configuration`);
    return data;
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
  async getLastMeasures(id) {
    const data = await this.requestInfo(
      `pools/${id}/lastmeasures?types[]=temperature&types[]=ph&types[]=orp&types[]=salt&types[]=tds&types[]=battery&types[]=rssi`
    );
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
  async getMeasures(id, type, period) {
    const data = await this.requestInfo(`pools/${id}/measure?
            type=${type}&
            period=${period}`);
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
  async getRecommendations(id) {
    const data = await this.requestInfo(`pools/${id}/recommendations`);
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
  async validateRecommendation(poolId, recommendationId) {
    const response = await this.requestInfo(`pools/${poolId}/recommendations/${recommendationId}`, "put");
    return ["Done", "done", "DONE"].includes(response);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Api
});
//# sourceMappingURL=api.js.map
