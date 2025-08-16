const https = require("node:https");

class Helpers {
    constructor(proxy, core) {
        this.proxy = proxy;
        this.core = core;
    }

    createHttpRequest(url, method = 'GET', options = {}) {
        return new Promise((resolve, reject) => {
            const urlOptions = new URL(url);

            const requestOptions = {
                hostname: urlOptions.hostname,
                path: urlOptions.pathname + urlOptions.search,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
            };

            const req = https.request(requestOptions, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    const response = {
                        success: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data,
                    };

                    if (response.success) {
                        resolve(response);
                    } else {
                        reject(response);
                    }
                });
            });

            req.on('error', (error) => {
                reject({success: false, status: null, data: error.message});
            });

            if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) && options.body) {
                req.write(JSON.stringify(options.body));
            }

            req.end();
        });
    }

    removeMinecraftFormattingCodes(text) {
        return text.replaceAll(/§[0-9a-fklmnor]/gi, '')
    }
}

module.exports = Helpers;
