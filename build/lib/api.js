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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target, mod));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var api_exports = {};
__export(api_exports, {
  Api: () => Api
});
module.exports = __toCommonJS(api_exports);
var import_axios = __toESM(require("axios"));
var import_url = __toESM(require("url"));
const baseURL = "https://interop.ondilo.com/";
const refreshURL = baseURL + "oauth2/token";
const client_id = "customer_api";
const apiPrefix = baseURL + "api/customer/v1/";
class Api {
  constructor(options) {
    this.accessToken = options.accessToken;
    this.refreshToken = options.refreshToken;
    this.log = options.log;
  }
  async doRefreshToken() {
    try {
      const response = await import_axios.default.post(refreshURL, new import_url.default.URLSearchParams({
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
        client_id
      }).toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });
      if (response.status === 200) {
        if (response.data && response.data.access_token) {
          this.accessToken = response.data.access_token;
          return true;
        } else {
          throw new Error("No toke in response. " + JSON.stringify(response.data));
        }
      } else {
        throw new Error(response.status + " - " + JSON.stringify(response.data));
      }
    } catch (e) {
      if (import_axios.default.isAxiosError(e)) {
        const response = e.response || { status: 0, data: "Unknown failure", headers: "" };
        throw new Error("Could not update token: " + response.status + " - " + JSON.stringify(response.data));
      } else {
        this.log.error("Unexpected error during refresh: " + e);
        throw new Error("Could not update token: " + e);
      }
    }
  }
  async requestInfo(urlPart, method = "get", triedRefresh = false) {
    try {
      const response = await import_axios.default.request({
        url: apiPrefix + urlPart,
        method,
        responseType: method === "get" ? "json" : "text",
        headers: {
          Authorization: "Bearer " + this.accessToken,
          Accept: "application/json",
          "Accept-Charset": "utf-8",
          "Accept-Encoding": "gzip, deflate"
        }
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
          throw new Error("Could not update token: " + response.status + " - " + JSON.stringify(response.data));
        } else {
          throw new Error(`API Error ${response.status} while getting ${urlPart}: ${JSON.stringify(response.data)} - headers: ${JSON.stringify(response.headers)}`);
        }
      } else {
        throw new Error("Unexpected error getting " + urlPart + ": " + e.stack);
      }
    }
  }
  async getUser() {
    const data = await this.requestInfo("user/info");
    if (typeof data === "string") {
      return JSON.parse(data);
    }
    return data;
  }
  async getUnits() {
    const data = await this.requestInfo("user/units");
    return data;
  }
  async getPools() {
    const data = await this.requestInfo("pools");
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
  async getLastMeasures(id) {
    const data = await this.requestInfo(`pools/${id}/lastmeasures?
            types[]=temperature&
            types[]=ph&
            types[]=orp&
            types[]=salt&
            types[]=tds&
            types[]=battery&
            types[]=rssi`);
    for (const measure of data) {
      measure.value_time = new Date(measure.value_time);
    }
    return data;
  }
  async getMeasures(id, type, period) {
    const data = await this.requestInfo(`pools/${id}/measure?
            type=${type}&
            period=${period}`);
    for (const measure of data) {
      measure.value_time = new Date(measure.value_time);
    }
    return data;
  }
  async getRecommendations(id) {
    const data = await this.requestInfo(`pools/${id}/recommendations`);
    for (const recommendation of data) {
      recommendation.created_at = new Date(recommendation.created_at);
      recommendation.updated_at = new Date(recommendation.updated_at);
      recommendation.deadline = new Date(recommendation.deadline);
    }
    return data;
  }
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
