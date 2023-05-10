const core = require('./core');
const utils = require('./utils');

(async () => {
     // await core.locationScrap('cordoba')
     await core.realScrap('https://clasificados.lavoz.com.ar/inmuebles/terrenos-y-lotes/venta', 'la-voz-try', 1)
     // await core.neighborhoodScrap('#input-ubicacion','cordoba')
     // console.table(await utils.findWordsByProximity('terreno de 360 m2 en frente norte', 'f norte', 5))
     // console.log(await utils.findWordsByProximityNGrams('terreno de 360 m2 en frente norte', 'frente norte', 5))
})();