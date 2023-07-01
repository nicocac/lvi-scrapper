const mysql = require('mysql');
const utils = require('./utils');
const { ZenRows } = require("zenrows");
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
            const sql = `select current_page
                         from scraping
                         where name = ?
                           and end is null`;
            const result = await this.makeQuery(sql, scrapingId)
            if (!result) {
                throw new Error('Error getting current page');
            }
            resolve(result.length ? result[0]?.current_page + 1 : 1)
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
            const sql = `insert into scraping (name, init, current_page)
                         select '${id}',
                                now(),
                                1
                         from dual
                         where not exists(select 1
                                          from scraping
                                          where name = '${id}')`;
            const result = await this.makeQuery(sql, null);
            resolve(result)
        })
    },
    updateCurrentPage: function (currentPage, scrapingId) {
        const sql = `update scraping
                     set current_page = ${currentPage}
                     where name = '${scrapingId}'`;
        return this.makeQuery(sql)
    },
    finishScraping: function (scrapingId) {
        const sql = `update scraping
                     set end = now()
                     where name = ?`;
        return this.makeQuery(sql, scrapingId)
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
    completeData: async function (files) {
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
    makeQuery: async function (query, ...params) {
        return new Promise(async resolve => {
            const connection = require('./connection.js');
                connection.query(query, ...params, (error, result) => {
                    if (error) {
                        resolve({error});
                        return;
                    }
                    resolve(result);
                })
        })
    },
    processDuplicated: async function () {
        const sql = `select link, count(1)
                     from item
                     group by link
                     having count(1) > 1`;
        const results = await this.makeQuery(sql);
        for (const result of results) {
            const {link} = result;
            const query = `select id
                           from item
                           where link = '${link}'
                             and id > (select min(id)
                                       from item
                                       where link = '${link}'
                                         and deleted_at is null)
                             and deleted_at is null`;
            const toDelete = await this.makeQuery(query);
            const updateAll = `update item
                               set deleted_at = now()
                               where id in (?)`;
            await this.makeQuery(updateAll, [toDelete.map(d => d.id)])
        }
    },
    persistFile: async function (fileData, scrapingId) {
        let items = []
        for (let item of fileData) {
            const dataToAnalyze = await utils.removeAccents(item.title.concat(item.features).toLowerCase())
            items.push({
                ...item,
                ...await this.analyzeData(dataToAnalyze)
            })
        }
        items = await this.completeData([items])
        for (const item of items) {
            const sqlQueryExists = `select id
                                    from item
                                    where link = ?`;
            const result = await this.makeQuery(sqlQueryExists, item.link)
            const itemId = result?.[0]?.id
            await this.persistItem(item, itemId, scrapingId)
        }

    },
    saveData: async function (scrapingId, pageNumber, flatArray, pageData, persist) {
        try {
            await this.log(scrapingId, `Creating file for page: ${pageNumber}`)
            await this.createRealScrapFile(scrapingId, pageNumber, flatArray)
            if (persist) {
                await this.log(scrapingId, `Persisting page: ${pageNumber}`)
                await this.persistFile(pageData, scrapingId)
            }
            await this.updateCurrentPage(pageNumber, scrapingId)
        } catch (e) {
            throw e
        }
    },
    log: async function (code, message) {
        const sql = `insert into log (code, message)
                     values (?, ?)`
        return this.makeQuery(sql, [code, message])
    },
    getItemValues: function (inputItem, scrapingId, status) {
        const values = []
        values.push('la voz')
        values.push(inputItem.link)
        values.push(inputItem.title)
        values.push(inputItem.meters)
        values.push(inputItem.price.type)
        values.push(inputItem.price.amount)
        values.push(inputItem.announcer)
        values.push(inputItem.features)
        values.push(inputItem.description)
        values.push(inputItem.province)
        values.push(inputItem.city)
        values.push(inputItem.neighborhood)
        values.push(inputItem.frente)
        values.push(inputItem.fondo)
        values.push(inputItem.espacioVerde)
        values.push(inputItem.duplex)
        values.push(inputItem.possession)
        values.push(inputItem.escritura)
        values.push(inputItem.central)
        values.push(inputItem.periferico)
        values.push(inputItem.financia)
        values.push(inputItem.propietario)
        values.push(inputItem.paymentFacilities)
        values.push(!inputItem?.credit || inputItem?.credit?.toUpperCase() === 'NO' ? false : true)
        values.push(inputItem.accuracy)
        values.push(status)
        values.push(new Date())
        values.push(scrapingId)
        return values
    },
    saveNewItem: async function (inputItem, scrapingId) {
        const sql = `INSERT INTO item (site, link, title, meters, priceType, price, announcer, features, description,
                                       province, city, neighborhood, front, back, green_space, duplex, possession, deed,
                                       central, peripheral, financed, owner, payment_facilities, credit, accuracy,
                                       status, last_status_date, last_status_process)
                     values (?)`;
        const result = await this.makeQuery(sql, [this.getItemValues(inputItem, scrapingId, 'new')])
        const itemId = result.insertId;
        if (result && itemId === 0) {
            console.log(`Server status: ${result.serverStatus} - Inserting itemId 0 for link: ${inputItem.link}`)
            return true
        }
    },
    updateItem: async function (inputItem, id, scrapingId) {
        const {site, ...itemValues} = this.getItemValues(inputItem, scrapingId, 'updated')
        const sql = `UPDATE item
                     SET title=?,
                         meters=?,
                         priceType=?,
                         price=?,
                         announcer=?,
                         features=?,
                         description=?,
                         province=?,
                         city=?,
                         neighborhood=?,
                         front=?,
                         back=?,
                         green_space=?,
                         duplex=?,
                         possession=?,
                         deed=?,
                         central=?,
                         peripheral=?,
                         financed=?,
                         owner=?,
                         payment_facilities=?,
                         credit=?,
                         accuracy=?,
                         status=?,
                         last_status_date=?,
                         last_status_process=?
                     WHERE id = ${id}`
        return await this.makeQuery(sql, [itemValues])
    },
    finalizeItem: async function (link, scrapingId) {
        const sql = `UPDATE item
                     SET end = now(),
                         last_status_process = ?
                     WHERE link = ${link}`
        return await this.makeQuery(sql, scrapingId)
    },
    persistItem: async function (item, itemId, scrapingId) {
        !itemId && await this.saveNewItem(item, scrapingId);
        itemId && await this.updateItem(item, itemId, scrapingId);
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
        if (!fs.existsSync(`./scraping-src/${scrappingId}`)) {
            fs.mkdirSync(`./scraping-src/${scrappingId}`);
        }
        return `./scraping-src/${scrappingId}`
    },
    getHtmlText: async function (url, params = {}, useProxy = true) {
        return new Promise(resolve => {
            setTimeout(async () => {
                let html
                const headers =
                    {
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                        "Accept-Encoding": "gzip, deflate, br",
                        "Accept-Language": "en-US,en;q=0.5",
                        "Connection": "keep-alive",
                        "Cookie": "_ga_F3LBW12NCG=GS1.1.1686185697.6.1.1686185714.43.0.0; _ga=GA1.3.137297713.1675950266; __gads=ID=f491492e3a54f546-229977a883df00c1:T=1675950265:RT=1686185698:S=ALNI_Mam87EZd6wxafAVgDKatrmSaNbm8A; __gpi=UID=000009eb5333b886:T=1675950265:RT=1686185698:S=ALNI_MbKKJwSFlmQHK59cNnh6h1meMf9sg; _cb=BOfrBkDqQAvxPgaYj; _chartbeat2=.1675950268379.1686185698054.0000000100000011.D4aN9pBgYimdCe1DIADty3TaDVyYXa.1; _cc_id=fa26da7db2cad193f06b7baa26d1246a; _fbp=fb.2.1675950269096.1278304223; cto_bundle=Ou8SBV9VbEY1UzAxQThPQlZZcGhabHV4TGFsU1lEaWg4NWlESVd2c2pVSSUyQkwxOGJzbDhMTmNENGdmb0k3aHBPVSUyQlIxMSUyRjl4TkFORk42cG9yaUhIczBIaGpkMktHVm1xWERlWVlVY1ZGS0pyU1hrd2tlNEVpY2tyWnloSnpOaktqa1AxeTZjZGV1aktocDRVS1VUUEs3RHY0ajhSQ0slMkJyM0tDZVhvdkduYXFjclpObld5VHNHJTJGTjlGRWRyUnh2SmYxQ2NR; cto_bidid=8UUg6191ZnRHSklNZFoyRlRiQ0hJNWgzVVBJcWl2MCUyQjVMcnRDSDZTQnlXbG96RElFaSUyQm9zYzE5dUxpZVhwYVc4Z2VGY0hSWUxBUTJkSU9JOHBvTk5XSm4lMkYyb2p0WHZWZU9nb01jMkIlMkJiaTBMUVdDdnVVOFB1RG50d2clMkJLRWJCcmg5WWo; g_state={\"i_p\":1689608703848,\"i_l\":4}; _ga_7WQCK7P492=GS1.1.1686185697.5.1.1686185714.0.0.0; _sharedID=edb537f8-cd0e-4752-85ef-f1d88b6b9e13; paywall_meter=1; paywall_meter_last_check=Tue%20Jun%2006%202023%2014:42:16%20GMT-0300%20(Argentina%20Standard%20Time); XSRF-TOKEN=eyJpdiI6IjVGY3BlTWswbnNpeENla3UyZnVWU1E9PSIsInZhbHVlIjoiVHVwMllUM1VwdWdlZWhOR0JBS3FJZEVPLzJqSlFXZkd4Z1o3YkhLZ0dRWitpNWFTVXpzY0tlY1BaSG9URzA4RGY5VUNCd25LcjFTU0hPeE1ubzVLMHFIRnprL1dhLzlnVnh2NzN4emk5UkxUOW0vYUEwVm0wNmxybDAzbUlIY1QiLCJtYWMiOiJjOGNlNjhjNDE5ZDQ3M2M4YmRmMzAyMzE4N2Y3YTM5YjU1MzgxMDNjZTA0ZjA3YTZmODdiMmFlNjlkYzQwMTI3In0%3D; clasificados_la_voz_session=pxAnVkZFuXwHAhNbTm0XLw4tRihKm2BV4Qh1RMSd",
                        "Sec-Fetch-Dest": "document",
                        "Sec-Fetch-Mode": "navigate",
                        "Sec-Fetch-Site": "none",
                        "Sec-Fetch-User": "?1",
                        "TE": "trailers",
                        "Upgrade-Insecure-Requests": "1",
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/114.0"
                    }
                if (useProxy) {
                    const client = new ZenRows("9499a51db82569b9c6f7ff27765b66c2f256ad75");
                    try {
                        html = await client.get(url, {
                            "premium_proxy": "true",
                            "proxy_country": "ar"
                        }, headers);
                    } catch (error) {
                        console.error(error.message);
                        if (error.response) {
                            console.error(error.response.data);
                        }
                    }
                } else {
                    html = await fetch(url, headers).catch(error => {
                        console.log(error)
                        return undefined
                    });
                }
                try {
                    resolve(html.data)
                } catch (e) {
                    this.saveLogFile('Error getting data from api: ' + e.message)
                }
            }, Math.random() * 2000)
        })
    },
    createRealScrapFile: async function (scrappingId, currentPage, dataArray) {
        const mainFolder = await this.getScrappingMainFolder(scrappingId)
        const data = JSON.stringify(dataArray)
        console.log(`Saving array with ${dataArray.length} items`)
        return fs.writeFile(`${mainFolder}/data.json`, data, function (err) {
            if (err) {
                console.log(`Error creating file ${mainFolder}/data.json on page ${currentPage}: ${JSON.stringify(err)}`);
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
    saveLogFile (message) {
        return fs.writeFile('./log.json', Math.random.toString(), function (err) {
            if (err) {
                console.log(`Error creating file log.json: ${JSON.stringify(err)}`);
            }
            console.log('Log file was created successfully.');
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