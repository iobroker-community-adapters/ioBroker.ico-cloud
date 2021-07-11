"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getToken = void 0;
const axios_1 = __importDefault(require("axios"));
// Headers:
// Accept: application/json
// Accept-Charset: utf-8
// Accept-Encoding : gzip-deflate
// Content-type: application/json
const baseURL = 'https://interop.ondilo.com/';
const authURL = baseURL + 'oauth2/token';
async function getToken(code) {
    const response = await axios_1.default.post(authURL, {
        code,
        grant_type: 'authorization_code',
        client_id: 'customer_api'
    });
}
exports.getToken = getToken;
//# sourceMappingURL=api.js.map