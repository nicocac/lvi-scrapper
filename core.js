const puppeteer = require("puppeteer");
const utils = require("./utils");
const dataUtils = require("./data-utils");
module.exports = {
    realScrap: async function (url, id, groupingPages) {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        let saved = false;
        let retArray = []

        await Promise.all([
            page.waitForNavigation(),
            page.goto(`${url}`)
        ])

        const pages = await page.evaluate(async () => {
                const pages = Array.from(document.querySelectorAll('nav ul li'));
                return pages ? (pages.length < 11 ? pages.length : pages[pages.length - 1].children[0].innerText) : 1
            }
        )

        for (let pageNumber = 1; pageNumber <= parseInt(pages); pageNumber++) {
            if (saved) break;
            saved = false;
            await Promise.all([
                page.waitForNavigation(),
                page.goto(`${url}?page=${pageNumber}`)
            ])
            console.log(`Processing page ${pageNumber} of ${pages} for url: ${url}`)
            let data = await page.evaluate(async () => {
                const selectors = {
                    cardSelector: '.safari-card',
                    link: 'a',
                    title: 'a h2',
                    mts: 'a .card-body > div:nth-last-child(-n + 2)',
                    price: 'a .card-body > div:last-child'
                }
                try {
                    const anchors = Array
                        .from(document.querySelectorAll(selectors.cardSelector), element => element.querySelector(selectors.link).getAttribute('href'))
                    const titles = Array
                        .from(document.querySelectorAll(selectors.cardSelector), element => element.querySelector(selectors.title)?.innerText)
                    const mts = Array
                        .from(document.querySelectorAll(selectors.cardSelector), element => element.querySelector(selectors.mts)?.innerText.split('\n')?.[0])
                    const prices = Array
                        .from(document.querySelectorAll(selectors.cardSelector), element => element.querySelector(selectors.price)?.innerText.replace('.', '').split('U$S')?.[1]?.trim())
                    return anchors.map((data, index) => {
                        return {
                            link: data,
                            title: titles[index],
                            details: {
                                mts: mts[index] || 0,
                                price: prices[index] || 0
                            }
                        }
                    })
                } catch (e) {
                    console.log(`Error Processing page ${pageNumber} of ${pages} for neighborhood ${neighborhood}: ${e.message}`)
                }
            });
            const filteredData = data.filter(item => item.details.price && item.details.mts)
            const profileData = []
            for (const i of filteredData) {
                try {
                    await Promise.all([
                        page.waitForNavigation(),
                        page.goto(i.link)
                    ])
                    const announcerData = await page.evaluate(async () => {
                        const getLocationData = async function (location) {
                            return Array.from(
                                document.querySelectorAll('.container.main-wrapper .bg-light-gray > div'))
                                ?.filter(e => e?.children[0]?.children[0]?.children[0]?.textContent?.indexOf(location) !== -1)
                                ?.map(e => e?.children[0]?.children[1]?.textContent?.trim()
                                )
                        }
                        const getHtmlElementArray = (selector, title) => {
                            let allResults = Array.from(document.querySelectorAll(selector))?.find(paragraph => paragraph.innerText === title)?.closest('div')?.children
                            if (allResults) {
                                const [excluded, ...results] = allResults
                                return results
                            }
                            return []
                        }
                        const features = getHtmlElementArray("p", "Características")
                        const otherFeatures = getHtmlElementArray("p", "Otras características")
                        let description = Array.from(document.querySelectorAll("p"))?.find(paragraph => paragraph?.innerText === 'Descripción')?.closest('div')?.innerText.toUpperCase()
                        const title = document.querySelector('.main-wrapper h1')?.innerText;
                        const telButton = document.querySelector('#ver-tel');
                        const mailButton = document.querySelector('#ver-mail');
                        telButton?.click();
                        mailButton?.click();
                        const telephone = document.querySelector('#tel > span > span')?.innerText;
                        const mail = document.querySelector('#mail > a')?.innerText;
                        const owner = description?.indexOf('DUEÑO') !== -1 ? 1 : 0
                        const finished = document.querySelector('#camera .h2')?.innerText?.toLowerCase()?.indexOf('finalizado') !== -1
                        const titlePlusDescription = `${title} ${description}`
                        const [city1, city2] = await getLocationData('_ciudad', document)
                        const city = city2 ? city1 : undefined
                        const neighborhood = city2 ?? city1
                        const province = await getLocationData('_provinicia', document)?.[0] ?? ''
                        return {
                            announcerType: document.querySelector('.container.main-wrapper > div + div > :nth-child(3) > div > div > div + div > div + div > div')?.innerText || (owner ? 'dueño' : 'no data'),
                            updated_at: [{array: document.querySelector('.border-top.border-bottom.border-silver > div > div')?.innerText.split(':')?.[1]?.trim().split('.')}]?.map(({array: updatedAt}) => new Date([updatedAt[1], updatedAt[0], updatedAt[2]]))[0].toJSON().slice(0, 19).replace('T', ' '),
                            features: [...features, ...otherFeatures]?.map(feature => feature?.innerText.replace('\\n', '').trim())?.join(','),
                            duplex: titlePlusDescription?.indexOf('APTO DUPLEX') !== -1 ? 1 : 0,
                            possession: titlePlusDescription?.indexOf('POSESION') !== -1 ? 1 : 0,
                            owner,
                            city,
                            province,
                            neighborhood,
                            finished,
                            detailsTitle: title,
                            description,
                            location: Array.from(document.querySelectorAll("p"))?.find(paragraph => paragraph.innerText === 'Ubicación')?.closest('div')?.children?.[1]?.innerText,
                            telephone,
                            mail
                        }
                    })
                    profileData.push(announcerData)
                } catch (e) {
                    console.error(`Processing link ${i.link}: ${e.message}`)
                }
            }
            console.log(`Flatting data`)
            retArray = await Promise.all([...retArray, ...filteredData.map(async (item, index) => {
                const completeData = await utils.removeAccents(item.title.concat(item.details.description).toLowerCase())
                const analyzedData = await dataUtils.analyzeData(completeData)
                return {
                    ...item,
                    details: {
                        ...item.details,
                        ...profileData[index],
                        ...analyzedData
                    }
                }
            })])
            // this checks if it has to save the accumulated data, if so, cleans the array
            if (this.hasToSave(pageNumber, groupingPages)) {
                await dataUtils.createRealScrapFile(id, pageNumber, retArray)
                retArray = []
                saved = true
            }
        }
        if (!saved) {
            retArray = retArray.map(item => item.details.finished ? {...item, accuracy: 0} : utils.getAccuracy(item))
            await dataUtils.createRealScrapFile(id, page, retArray)
        }
        await browser.close();
    },
    hasToSave: function (page, groupingPages) {
        return page % groupingPages === 0
    },
    locationScrap: async function (province) {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        const url = `https://www.argentina.gob.ar/${province}/municipios`
        await Promise.all([
            page.waitForNavigation(),
            page.goto(url)
        ])
        const totalPages = await page.evaluate(async () => {
                const pages = document.querySelectorAll('#ponchoTable_paginate ul li.paginate_button:not(#ponchoTable_previous):not(#ponchoTable_next):not(#ponchoTable_ellipsis) a');
                return pages ? (pages.length < 5 ? pages.length : pages[pages.length - 1].innerText) : 1
            }
        )
        let values = []
        for (let pageNumber = 1; pageNumber <= parseInt(totalPages); pageNumber++) {
            if (pageNumber !== 1) await page.click('#ponchoTable_paginate ul li.paginate_button.active + li a')
            const data = await page.evaluate(async () => {
                try {
                    return Array
                        .from(document.querySelectorAll('#ponchoTable tbody tr'), element => {
                            return {
                                municipality: element.querySelector('td[data-title="Municipio"] > p').innerText,
                                department: element.querySelector('td[data-title="Departamento"] > p').innerText
                            }
                        })
                } catch (e) {
                    console.log(`Error getting municipality data`)
                }
            });
            values = [...values, ...data]
        }

        await dataUtils.createGenericFile('province-data', values)
        await browser.close();
    },
    neighborhoodScrap: async function (inputSelector, inputText) {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        const url = `https://clasificados.lavoz.com.ar/inmuebles`
        await Promise.all([
            page.waitForNavigation(),
            page.goto(url)
        ])
        await page.waitForSelector(inputSelector);
        await page.focus(inputSelector);
        await page.type(inputSelector, inputText);
        await page.waitForSelector('#input-ubicacionautocomplete-list');
        const data = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('#input-ubicacionautocomplete-list input[type="hidden"]'),
                e => e.value.split(','))
                .map(e => e[e.length - 1].trim()).filter(e => e.trim() !== 'Córdoba')
        })
        await dataUtils.createGenericFile('neighborhoods', data)
        await browser.close();
    }
}