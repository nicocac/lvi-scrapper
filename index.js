const core = require('./core');

(async () => {
    // await core.locationScrap('cordoba')
    // await core.realScrap('https://clasificados.lavoz.com.ar/inmuebles/terrenos-y-lotes/venta', 'la-voz-try', 1)
    await core.neighborhoodScrap('#input-ubicacion','cordoba')
})();