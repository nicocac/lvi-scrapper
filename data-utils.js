const mysql = require('mysql');
const utils = require('./utils')
const fs = require("fs");
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
    persist: async function (scrapperId, connection) {
        const files = await utils.getFiles(this.getScrappingMainFolder(scrapperId))
        await connection.connect(async function (err) {
            if (err) throw err;
            for (let array of files) {
                for (let scrappedItem of array) {
                    let itemId
                    const sqlQueryExists = `select id
                                            from item
                                            where link = '${scrappedItem.link}'`;
                    await connection.query(sqlQueryExists, async function (err, result) {
                        if (err) throw err;
                        itemId = result?.[0]?.id
                        !itemId && await utils.saveNewItem(scrappedItem, connection);
                        itemId && await utils.updateItem(scrappedItem, itemId, connection)
                    });

                }
            }
        })
    },
    persistDataArray: async function (dataArray) {
        await this.persist(dataArray, this.getConnection())
    },
    getScrappingMainFolder: async function (scrappingId) {
        const scrappingFolder = `./${scrappingId}-${utils.getDateString()}`
        if (!fs.existsSync(`./scrapping-src/${scrappingFolder}`)) {
            fs.mkdirSync(`./scrapping-src/${scrappingFolder}`);
        }
        return `./scrapping-src/${scrappingFolder}`
    },
    createFile: async function(scrappingId, currentPage, dataArray) {
        const mainFolder = await this.getScrappingMainFolder(scrappingId)
        await fs.writeFile(`${mainFolder}/page-${currentPage}.json`, JSON.stringify(dataArray), function (err) {
            if (err) throw err;
            console.log('File was created successfully.');
        })
    },
    createGenericFile: async function(fileName, dataArray) {
        const mainFolder = './generic-data'
        await fs.writeFile(`${mainFolder}/${fileName}.json`, JSON.stringify(dataArray), function (err) {
            if (err) throw err;
            console.log('File was created successfully.');
        })
    }
};