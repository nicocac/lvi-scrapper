const mysql = require('mysql');
const utils = require('./utils')

const persist = async (retArray) => {

    const con = mysql.createConnection({
        host: "127.0.0.1",
        user: "root",
        password: "root",
        database: "inmoscrap"
    });

    const files = await utils.getFiles('./22032023')
    await con.connect(async function (err) {
        if (err) throw err;
        for (let array of files) {
            for (let scrappedItem of array) {
                let itemId
                const sqlQueryExists = `select id
                                        from item
                                        where link = '${scrappedItem.link}'`;
                await con.query(sqlQueryExists, async function (err, result) {
                    if (err) throw err;
                    itemId = result?.[0]?.id
                    !itemId && await utils.saveNewItem(scrappedItem, con);
                    itemId && await utils.updateItem(scrappedItem, itemId, con)
                });

            }
        }
    })
};
persist()