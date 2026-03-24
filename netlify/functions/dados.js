const https = require('https');

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSxKpf2m_KjSnPfq2sAwNmFo7VpWubm6SEgEPxhSyTsKHDSsCcmzTYX0oVRvgHjeXZHmlZOC4B4mIhp/pub?gid=807710512&single=true&output=csv';

function httpsGet(url, maxRedirects) {
    if (maxRedirects === undefined) maxRedirects = 5;
    return new Promise(function (resolve, reject) {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
        https.get(url, function (resp) {
            if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
                resp.resume();
                httpsGet(resp.headers.location, maxRedirects - 1).then(resolve).catch(reject);
                return;
            }
            var chunks = [];
            resp.on('data', function (c) { chunks.push(c); });
            resp.on('end', function () { resolve(Buffer.concat(chunks)); });
        }).on('error', reject);
    });
}

exports.handler = async function () {
    try {
        var buf = await httpsGet(SHEET_URL);
        var csv = buf.toString('utf8');
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
            body: csv,
        };
    } catch (err) {
        return {
            statusCode: 500,
            body: 'Erro ao buscar dados: ' + err.message,
        };
    }
};
