const fs = require("fs");
const path = require("path");

const updateDetails = async (inputItem, id, con) => {
    const sql = `UPDATE detail
                 SET meters         = ${inputItem.details.mts},
                     price          = ${inputItem.details.price},
                     announcer_type = '${inputItem.details.announcerType}',
                     updated_at     = '${inputItem.details.updated_at}',
                     features       = '${inputItem.details.features}',
                     finished       = ${inputItem.details?.finished ? 1 : 0},
                     duplex         = ${inputItem.details.duplex},
                     possession     = ${inputItem.details.possession},
                     description    = '${inputItem.details.description}',
                     owner          = ${inputItem.details.owner},
                     north          = ${inputItem.details.north},
                     location       = '${inputItem.details.neighborhood}',
                     telephone      = '${inputItem.details.telephone}',
                     mail           = '${inputItem.details.mail}'
                 WHERE item_id = ${id}`;
    await con.query(sql, async function (err, result) {
        if (err) {
            console.log(`Error in the sentence: ${sql} - Error: ${err.message}`)
        }
        if (id === 0) {
            console.log(`Updating detailId 0 for link: ${inputItem.link}`)
            return true
        }
    });
}

module.exports = {
    getAccuracy: function (item) {
        const neighborhoodKeys = item.neighborhood.split('-').filter(k => k !== 'de')
        const mainTitleOccurrences = neighborhoodKeys.map(key =>
            item.title?.toUpperCase()
                ?.indexOf(key.toUpperCase()) !== -1)
            .filter(Boolean)
            .length
        const detailOccurrences = neighborhoodKeys.map(key =>
            `${item.details?.description?.toUpperCase()} ${item.details?.features?.toUpperCase()}`
                ?.indexOf(key.toUpperCase()) !== -1)
            .filter(Boolean)
            .length
        // the title has a 60% of incidence within the accuracy
        const mainTitleAccuracy = (((mainTitleOccurrences * 100) / neighborhoodKeys.length) * 60) / 100
        const detailAccuracy = (((detailOccurrences * 100) / neighborhoodKeys.length) * 40) / 100
        return {
            ...item,
            accuracy: mainTitleAccuracy + detailAccuracy
        }
    },
    getDateString: function () {
        return [new Date()].map(date => `${date.getDate()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getFullYear()}`)[0]
    },
    getFileName: function (folder, neighborhood) {
        return `./scrapping-src/${folder}/result-${neighborhood}.json`
    },
    getFiles: async function (dir) {
        return new Promise(async (resolve) => {
            const dirPath = `./scrapping-src/${dir}`
            await fs.readdir(dirPath, (err, files) => {
                if (err) {
                    console.error(`Error reading directory ${dirPath}: ${err}`);
                    return;
                }

                resolve(files.map(file => {
                    const filePath = path.join(dirPath, file);
                    return require('./' + filePath)
                }))
            });
        })
    },
    saveNewItem: async function (inputItem, con) {
        const sql = `INSERT INTO item (site, link, title, accuracy)
                     SELECT 'la voz',
                            '${inputItem.link}',
                            '${inputItem.title}',
                            '${inputItem.accuracy}'
                     FROM dual
                     WHERE NOT EXISTS(SELECT 1
                                      FROM item
                                      WHERE link = '${inputItem.link}')`;
        await con.query(sql, async function (err, result) {
            if (err) throw err;
            const itemId = result.insertId;
            if (itemId === 0) {
                console.log(`Inserting itemId 0 for link: ${scrappedItem.link}`)
                return true
            }
            const sql = `INSERT INTO detail (meters,
                                             price,
                                             announcer_type,
                                             updated_at, features,
                                             duplex,
                                             possession,
                                             description,
                                             owner,
                                             north,
                                             location,
                                             telephone,
                                             mail,
                                             item_id,
                                             finished)
                         VALUES (${inputItem.details.mts},
                                 ${inputItem.details.price},
                                 '${inputItem.details.announcerType}',
                                 '${inputItem.details.updated_at}',
                                 '${inputItem.details.features}',
                                 ${inputItem.details.duplex},
                                 ${inputItem.details.possession},
                                 ${inputItem.details.description},
                                 ${inputItem.details.owner},
                                 ${inputItem.details.north},
                                 '${inputItem.details.location}',
                                 '${inputItem.details.telephone}',
                                 '${inputItem.details.mail}',
                                 ${itemId},
                                 ${inputItem.details?.finished ? 1 : 0});`;
            await con.query(sql, function (err, result) {
                if (err) {
                    console.log(`Error inserting itemId: ${itemId}: ${err.message}`)
                }
                console.log(`Item: ${itemId} inserted`);
            });
        });
    },
    updateItem: async function (inputItem, id, con) {
        const sql = `UPDATE item
                     SET title        = '${inputItem.title}',
                         accuracy     = '${inputItem.accuracy}',
                         neighborhood = '${inputItem.neighborhood}'
                     WHERE id = ${id}`
        await con.query(sql, async function (err, result) {
            if (err) throw err;
            if (id === 0) {
                console.log(`Updating itemId 0 for link: ${inputItem.link}`)
                return true
            }
            await updateDetails(inputItem, id, con)
        });
    },
    getProvince: async function () {
        return getLocationData('_provincia')?.[0]
    },
    getCityAndNeighborhood: async function () {
        const [city1, city2] = getLocationData('_ciudad')
        return {
            city: city2 ? city1 : undefined,
            neighborhood: city2 ?? city1
        }
    },
    getLocationData: async function (location) {
        return Array.from(
            document.querySelectorAll('.container.main-wrapper .bg-light-gray > div'))
            ?.filter(e => e?.children[0]?.children[0]?.children[0]?.textContent?.indexOf(location) !== -1)
            ?.map(e => e?.children[0]?.children[1]?.textContent?.trim()
            )
    }
}

