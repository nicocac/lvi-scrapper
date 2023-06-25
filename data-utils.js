const mysql = require('mysql');
const utils = require('./utils');
const fs = require("fs");
const KEY_MAPPERS = require('./generic-data/key-mappers.json')
const path = require("path");
const {TYPE_MAPPER} = require("./constants");
const connection = null
module.exports = {
    getConnection: async function () {
        return connection ?? mysql.createConnection({
            host: "127.0.0.1",
            user: "root",
            password: "root",
            database: "real_scrap"
        });
    },
    recapPageNum: async function (scrapingId) {
        return new Promise(async resolve => {
            const folder = await this.getFolderName(scrapingId)
            const connection = await this.getConnection()
            await connection.connect(async function (err) {
                if (err) throw err;
                const sql = `select current_page
                             from scraping
                             where name = ?
                               and end is null`;
                await connection.query(sql, folder, async function (err, result) {
                    if (err) {
                        throw err;
                    }
                    resolve(result.length ? result[0]?.current_page + 1 : 1)
                });
            })
        })
    },
    getLastId: async function (name) {
        return new Promise(async resolve => {
            const connection = await this.getConnection()
            await connection.connect(async function (err) {
                if (err) throw err;
                const sql = `select name
                             from scraping
                             where name like ?
                               and end is not null`;
                await connection.query(sql, [name + '%'], async function (err, result) {
                    if (err) {
                        throw err;
                    }
                    resolve(result.length || 1)
                });
            })
        })
    },
    getFolderName: async function (id) {
        const lastFolder = await this.getLastId(id)
        const folderName = `${id}-${lastFolder}`
        return folderName
    },
    saveNewScraping: async function (id) {
        return new Promise(async resolve => {
            const connection = await this.getConnection()
            await connection.connect(async function (err) {
                if (err) throw err;
                const sql = `insert into scraping (name, init, current_page)
                             select '${id}',
                                    now(),
                                    1 
                               from dual 
                              where not exists (select 1 
                                                  from scraping 
                                                 where name = '${id}')`;
                await connection.query(sql, async function (err, result) {
                    if (err) {
                        resolve(false)
                    }
                    resolve(true)
                });
            })
        })
    },
    getFiles: async function (dir) {
        return new Promise(async (resolve) => {
            fs.readdir(dir, (err, files) => {
                if (err) {
                    console.error(`Error reading directory ${dir}: ${err}`);
                    return;
                }

                resolve(files.map(file => {
                    const filePath = path.join(dir, file);
                    return require('./' + filePath)
                }))
            });
        })
    },
    getFeatureTypes: async function (files) {
        return [...new Set(files
            .flatMap(f => f.map(file => file.features))
            .flatMap(f => f.split(','))
            .filter(Boolean)
            .flatMap(f => f.split(' '))
            .filter(s => s.toUpperCase().indexOf('FICHA') !== -1))]
    },
    getFeatureValues: function (featureTypes, item) {
        const mappedFeatureTypes = featureTypes.flatMap(type =>
            item.features.split(',')
                .filter(Boolean)
                .filter(f => f.indexOf(type) !== -1)
                .map(f => f.split(' ').filter(Boolean))
                .map(f => {
                    const [t, ...value] = f
                    return {
                        [t]: value.join(' ')
                    }
                })
        )
        const mappedCity = mappedFeatureTypes.filter(f => Object.keys(f).find(k => k.indexOf('ciudad') !== -1))
        const mappedWithoutCity = mappedFeatureTypes.filter(f => Object.keys(f).find(k => k.indexOf('ciudad') === -1))
        const processed = [...mappedCity.map((f, i) => {
                const key = Object.keys(f)[0]
                return i > 0
                    ? {ficha_barrio: f[key]}
                    : f
            }
        ), ...mappedWithoutCity]
        return processed.reduce((previous, current) => {
            return {
                ...previous,
                ...current
            }
        }, {})
    },
    destructureFeatures: function (featureValues) {
        return Object.keys(featureValues).map(key => {
            const mappedKey = TYPE_MAPPER.find(translation => key.indexOf(translation.match) !== -1)
            return {
                [mappedKey.label]: featureValues[key]
            }
        }).reduce((previous, current) => {
            return {
                ...previous,
                ...current
            }
        }, {})
    },
    completeData: async function (dir) {
        const files = await this.getFiles(dir)
        // get types of features by key ficha_xxx
        const features = await this.getFeatureTypes(files)
        return files.flatMap(file => {
            return file
                .map(i => {
                    // get the feature types splitting each one from features attribute based on the keywords ficha_xxx
                    const featureValues = this.getFeatureValues(features, i)
                    return {
                        ...i,
                        // maps each feature property e.g.(ficha_cuidad) using the TYPE_MAPPER constant to translate it e.g.(city)
                        ...this.destructureFeatures(featureValues)
                    }
                })
                .filter(item => item?.price?.type && item?.price?.amount)
                .map((item) => {
                    return {
                        ...item,
                        // calculates the accuracy of the data based on the neighborhood
                        accuracy: utils.getAccuracy(item, item.neighborhood || item.city)
                    }
                })
        })
    },
    persist: async function (dir) {
        const connection = await this.getConnection()
        const items = await this.completeData(dir)
        console.log(`inserting ${items.length} items`)
        await connection.connect(async function (err) {
            if (err) throw err;
            for (let item of items) {
                let itemId
                const sqlQueryExists = `select id
                                        from item
                                        where link = '${item.link}'`;
                await connection.query(sqlQueryExists, async function (err, result) {
                    if (err) throw err;
                    itemId = result?.[0]?.id
                    !itemId && await utils.saveNewItem(item, connection);
                    itemId && await utils.updateItem(item, itemId, connection)
                });
            }
        })
    },
    analyzeData: async function (description) {
        const frenteNorte = KEY_MAPPERS['frente']['norte'].some(key => description.indexOf(key) !== -1)
        const frenteSur = KEY_MAPPERS['frente']['sur'].some(key => description.indexOf(key) !== -1)
        const fondoNorte = KEY_MAPPERS['fondo']['norte'].some(key => description.indexOf(key) !== -1)
        const fondoSur = KEY_MAPPERS['fondo']['sur'].some(key => description.indexOf(key) !== -1)
        const espacioVerde = KEY_MAPPERS['plaza'].some(key => description.indexOf(key) !== -1)
        const duplex = KEY_MAPPERS['duplex'].some(key => description.indexOf(key) !== -1)
        const possession = KEY_MAPPERS['posesion'].some(key => description.indexOf(key) !== -1)
        const escritura = KEY_MAPPERS['escritura'].some(key => description.indexOf(key) !== -1)
        const central = KEY_MAPPERS['central'].some(key => description.indexOf(key) !== -1)
        const periferico = KEY_MAPPERS['perimetral'].some(key => description.indexOf(key) !== -1)
        const financia = KEY_MAPPERS['financia'].some(key => description.indexOf(key) !== -1)
        const propietario = KEY_MAPPERS['propietario'].some(key => description.indexOf(key) !== -1)
        return {
            frente: frenteNorte ? 'norte' : (frenteSur ? 'sur' : ''),
            fondo: fondoNorte ? 'norte' : (fondoSur ? 'sur' : ''),
            espacioVerde,
            duplex,
            possession,
            escritura,
            central,
            periferico,
            financia,
            propietario
        }
    },
    getScrappingMainFolder: async function (scrappingId) {
        if (!fs.existsSync(`./scrapping-src/${scrappingId}`)) {
            fs.mkdirSync(`./scrapping-src/${scrappingId}`);
        }
        return `./scrapping-src/${scrappingId}`
    },
    createRealScrapFile: async function (scrappingId, currentPage, dataArray) {
        const mainFolder = await this.getScrappingMainFolder(scrappingId)
        const data = JSON.stringify(dataArray)
        console.log(`Saving array with ${dataArray.length} items`)
        return fs.writeFile(`${mainFolder}/page-${currentPage}.json`, data, function (err) {
            if (err) {
                console.log(`Error creating file ${mainFolder}/page-${currentPage}.json: ${JSON.stringify(err)}`);
            }
            console.log('File was created successfully.');
        })
    },
    createGenericFile: async function (fileName, data, type = 'json') {
        const mainFolder = './generic-data'
        const fileData = type === 'json' ? JSON.stringify(data) : data
        const extension = type === 'json' ? '.json' : ''
        await fs.writeFile(`${mainFolder}/${fileName}${extension}`, fileData, function (err) {
            if (err) throw err;
            console.log('File was created successfully.');
        })
    },
    getGenericData: async function (filename) {
        return fs.readFileSync(filename).toString()
    },
    getPrice: async function (text) {
        const types = [
            {
                symbol: 'U$S',
                name: 'dollar'
            },
            {
                symbol: '$',
                name: 'peso'
            }
        ]
        const coin = types.find(e => text.indexOf(e.symbol) !== -1)
        if (!coin) return null
        return {
            type: coin.name,
            amount: text.replaceAll('.', '').split(coin.symbol)?.[1]?.trim()
        }
    }
};