const https = require("node:https");

class Helpers {
    constructor() {}

    // Send a http request with ease (async)
    async createHttpRequest(url, method = 'GET', options = {}) {
        const urlOptions = new URL(url);

        const requestOptions = {
            hostname: urlOptions.hostname,
            path: urlOptions.pathname + urlOptions.search,
            method,
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
                return {
                    success: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    data,
                };
            });
        });

        req.on('error', (error) => {
            return {
                success: false,
                status: null,
                data: error.message
            };
        });

        if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) && options.body) {
            req.write(JSON.stringify(options.body));
        }

        req.end();
    }

    // Experimental fetch based request (async, node 22+)
    async createFetchRequest(url, method = 'GET', options = {}) {
        try {
            const requestOptions = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
            };

            if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) && options.body) {
                requestOptions.body = JSON.stringify(options.body);
            }

            const response = await fetch(url, requestOptions);

            if (!response.ok) {
                const errorData = await response.text();
                return {
                    success: false,
                    status: response.status,
                    data: errorData,
                }
            }

            return {
                success: true,
                status: response.status,
                data: await response.json(),
            };
        } catch (error) {
            return {
                success: false,
                status: null,
                data: error.message,
            };
        }
    }

    // Remove all minecraft colour codes
    removeMinecraftFormattingCodes(text) {
        return text.replaceAll(/§[0-9a-fklmnor]/gi, '')
    }

    // Use the users local number preference
    formatNumber(num, locale = undefined, decimals = 2) {
        if (typeof num !== 'number') {
            return {
                success: false,
                message: 'Invalid input: Expected a number'
            }
        }

        const options = {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        };

        try {
            const formatter = new Intl.NumberFormat(locale, options);
            return {
                success: true,
                data: formatter.format(num)
            };
        } catch (e) {
            return {
                success: false,
                message: 'Failed to format number: ' + e.message
            }
        }
    }

    // Use the users local date preference
    formatDate(date, locale = undefined, options = {dateStyle: 'medium', timeStyle: 'short'}) {
        if (!(date instanceof Date)) {
            return {
                success: false,
                message: 'Invalid input: Expected a Date object'
            }
        }

        try {
            const formatter = new Intl.DateTimeFormat(locale, options);
            return {
                success: true,
                data: formatter.format(date)
            }
        } catch (e) {
           return {
               success: false,
                message: 'Failed to format date: ' + e.message
           }
        }
    }

    // Convert a timestamp in to a relative timestamp
    formatRelativeTime(value, unit, locale = undefined, options = {numeric: 'auto'}) {
        if (typeof value !== 'number' || typeof unit !== 'string') {
           return {
               success: false,
               message: 'Invalid input: Expected a number and a unit'
           }
        }

        try {
            const formatter = new Intl.RelativeTimeFormat(locale, options);
            return  {
                success: true,
                data: formatter.format(value, unit)
            }
        } catch (e) {
           return {
               success: false,
               message: 'Failed to format relative time: ' + e.message
           }
        }
    }

}

module.exports = Helpers;
