"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Api = void 0;
const axios_1 = __importDefault(require("axios"));
// Headers:
// Accept: application/json
// Accept-Charset: utf-8
// Accept-Encoding : gzip-deflate
// Content-type: application/json
const baseURL = 'https://interop.ondilo.com/';
const refreshURL = baseURL + 'oauth2/token';
const client_id = 'customer_api';
class Api {
    constructor(options) {
        this._accessToken = options.accessToken;
        this._refreshToken = options.refreshToken;
    }
    async refreshToken() {
        const response = await axios_1.default.post(refreshURL, {
            refresh_token: this._refreshToken,
            grant_type: 'refresh_token',
            client_id
        }, { headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            } });
    }
}
exports.Api = Api;
//# sourceMappingURL=api.js.map