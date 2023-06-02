// proxy_server.js
const ProxyChain = require('proxy-chain');

const server = new ProxyChain.Server({
    // Port where the server will listen. By default 8000.
    port: 8000,
    // Enables verbose logging
    verbose: true,
    prepareRequestFunction: ({ request, username, password, hostname, port, isHttp, connectionId }) => {
        let upstream_proxy = 'nico' //request.headers['x-no-forward-upstream-proxy'];
        if (!upstream_proxy) {
            throw Error('please set header `x-no-forward-upstream-proxy`');
        }
        return {
            //upstreamProxyUrl: upstream_proxy
            upstreamProxyUrl: 'socks://200.32.105.86:4153',
        };
    },
});

server.listen(() => {
    console.log(`Proxy server is listening on port ${server.port}`);
});

// Emitted when HTTP connection is closed
server.on('connectionClosed', ({ connectionId, stats }) => {
    console.log(`Connection ${connectionId} closed`);
    console.dir(stats);
});

// Emitted when HTTP request fails
server.on('requestFailed', ({ request, error }) => {
    console.log(`Request ${request.url} failed`);
    console.error(error);
});
