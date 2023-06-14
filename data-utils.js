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
            database: "inmoscrap"
        });
    },
    recapPageNum: async function (scrapperId, groupingPages) {
        const files = await this.getFiles(await this.getScrappingMainFolder(scrapperId))
        return (files.length * groupingPages) + 1 || 1
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
        return featureTypes.flatMap(type =>
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
        ).reduce((previous, current) => {
            return {
                ...previous,
                ...current
            }
        }, {})
    },
    featuresKeyMapper: function (featuresByType) {
        return featuresByType.map(f =>
            Object.keys(f).map(key => {
                const mappedKey = TYPE_MAPPER
                    .find(translation => key.indexOf(translation.match) !== -1)
                return {
                    [mappedKey.label]: f[key]
                }
            }).reduce((previous, current) => {
                return {
                    ...previous,
                    ...current
                }
            }, {}))
    },
    destructureFeatures: function (file, features) {
        const values = file.map(i => this.getFeatureValues(features, i))
        return this.featuresKeyMapper(values)
    },
    completeData: async function (dir) {
        const files = await this.getFiles(dir)
        const features = await this.getFeatureTypes(files)
        return files.flatMap(file => {
            const f = this.destructureFeatures(file, features)
            return file.map((item, index) => {
                return {
                    ...item,
                    ...f[index],
                    accuracy: utils.getAccuracy(item)
                }
            })
        })
    },
    persist: async function (dir) {
        const connection = this.getConnection()
        const items = this.completeData(dir)
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
        const scrappingFolder = `${scrappingId}-${utils.getDateString()}`
        if (!fs.existsSync(`./scrapping-src/${scrappingFolder}`)) {
            fs.mkdirSync(`./scrapping-src/${scrappingFolder}`);
        }
        return `./scrapping-src/${scrappingFolder}`
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