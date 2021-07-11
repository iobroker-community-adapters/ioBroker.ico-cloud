import axios from 'axios';

// Headers:
// Accept: application/json
// Accept-Charset: utf-8
// Accept-Encoding : gzip-deflate
// Content-type: application/json

const baseURL = 'https://interop.ondilo.com/';
const authURL = baseURL + 'oauth2/token';

export async function getToken(code: string) {
    const response = await axios.post(authURL, {
        code,
        grant_type: 'authorization_code',
        client_id: 'customer_api'
    });
}
