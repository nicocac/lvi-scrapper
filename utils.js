const fs = require("fs");
const path = require("path");
const axios = require("axios");

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
            `${item?.description?.toUpperCase()} ${item?.features?.toUpperCase()}`
                ?.indexOf(key.toUpperCase()) !== -1)
            .filter(Boolean)
            .length
        // the title has a 60% of incidence within the accuracy
        const mainTitleAccuracy = (((mainTitleOccurrences * 100) / neighborhoodKeys.length) * 60) / 100
        const detailAccuracy = (((detailOccurrences * 100) / neighborhoodKeys.length) * 40) / 100
        return mainTitleAccuracy + detailAccuracy
    },
    getDateString: function () {
        return [new Date()].map(date => `${date.getDate()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getFullYear()}`)[0]
    },
    getFileName: function (folder, neighborhood) {
        return `./scrapping-src/${folder}/result-${neighborhood}.json`
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
    levenshteinDistance: async function (a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;

        const matrix = [];

        // Initialize matrix with 0..m values for each row
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        // Initialize matrix with 0..n values for each column
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        // Fill in matrix with Levenshtein distance values
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,   // insertion
                        matrix[i - 1][j] + 1    // deletion
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    },
    findWordsByProximity: async function (text, targetPhrase, maxProximity) {
        const words = text.toLowerCase().match(/\b\w+\b/g);
        const targetWords = targetPhrase.toLowerCase().split(/\s+/);
        const results = [];

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const proximityPromises = await Promise.all(targetWords.map(async (target) => {
                return await this.levenshteinDistance(word, target);
            }));
            const totalProximity = proximityPromises.reduce((acc, cur) => acc + cur, 0);
            const averageProximity = totalProximity / proximityPromises.length;
            if (averageProximity <= maxProximity) {
                const composedWord = words.slice(i, i + targetWords.length).join(' ');
                results.push({
                    word: composedWord,
                    index: i,
                    proximity: averageProximity
                });
            }
        }

        return results;
    },
    createNGrams: async function (text, n) {
        const nGrams = [];
        for (let i = 0; i < text.length - n + 1; i++) {
            nGrams.push(text.slice(i, i + n));
        }
        return nGrams;
    },
    findWordsByProximityNGrams: async function (text, targetPhrase, maxDistance) {
        const textNGrams = await this.createNGrams(text.toLowerCase(), 3);
        const targetNGrams = await this.createNGrams(targetPhrase.toLowerCase(), 3);

        const nGramCounts = {};
        textNGrams.forEach(nGram => {
            if (nGramCounts[nGram]) {
                nGramCounts[nGram]++;
            } else {
                nGramCounts[nGram] = 1;
            }
        });

        let maxCount = 0;
        let closestWord = null;
        targetNGrams.forEach(nGram => {
            if (nGramCounts[nGram]) {
                if (nGramCounts[nGram] > maxCount) {
                    maxCount = nGramCounts[nGram];
                    closestWord = text.slice(textNGrams.indexOf(nGram) - 10, textNGrams.indexOf(nGram) + targetPhrase.length + 10);
                }
            }
        });

        if (maxCount >= targetNGrams.length - maxDistance) {
            return closestWord;
        } else {
            return null;
        }
    },
    removeAccents: async function (str) {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    },
    getInnerText: async function (element) {
        return new Promise(async (resolve) => {
            if (!element?._rawText?.trim()) {
                if (element?.childNodes?.length) {
                    for (const child of element.childNodes) {
                        const text = await this.getInnerText(child)
                        if (text) {
                            resolve(text)
                        }
                    }
                }
                resolve('')
            }
            resolve (element._rawText)
        })
    },
    getHtmlText: async function (url) {
        return new Promise(resolve => {
            setTimeout(async () => {
                const html = await axios({
                    url: 'https://api.zenrows.com/v1/',
                    method: 'GET',
                    params: {
                        'url': url,
                        'apikey': '9499a51db82569b9c6f7ff27765b66c2f256ad75',
                        'premium_proxy': 'true',
                        'proxy_country': 'ar',
                    },
                }).catch(error => {
                    console.log(error)
                    return undefined
                });
                resolve(html.data)
            }, Math.random() * 2000)
        })
    }
}

