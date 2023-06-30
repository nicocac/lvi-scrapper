const core = require('./core');
const utils = require('./utils');
const dataUtils = require('./data-utils');

(async () => {
     console.time("Scrapper");
     // await core.locationScrap('cordoba')
     await core.realScrapApi('https://clasificados.lavoz.com.ar/inmuebles/terrenos-y-lotes/venta', 'la-voz', true, false)
     // await core.fsWriteTry('la-voz-try', 1, [{id: 1, message: 'Prueba nico'}])
     // await core.neighborhoodScrap('#input-ubicacion','cordoba')
     // console.table(await utils.findWordsByProximity('terreno de 360 m2 en frente norte', 'f norte', 5))
     // console.log(await utils.findWordsByProximityNGrams('terreno de 360 m2 en frente norte', 'frente norte', 5))
     //const mapped = await dataUtils.destructureFeatures('./scrapping-src/la-voz-try-8062023')
     //await dataUtils.persist('./scrapping-src/la-voz-try-8062023', null)
     // await dataUtils.processDuplicated()
     // console.log(await dataUtils.saveNewScraping('la-voz-1'))
     console.timeEnd("Scrapper");
})();