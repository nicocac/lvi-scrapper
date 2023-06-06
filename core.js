const puppeteer = require("puppeteer");
const utils = require("./utils");
const dataUtils = require("./data-utils");
const proxyChain = require('proxy-chain');
const {parse} = require('node-html-parser')
module.exports = {
    realScrap: async function (url, id, groupingPages, test = false) {
        // const proxyUrl = 'http://localhost:8000';
        const oldProxyUrl = 'http://45.6.4.60:8081';
        const newProxyUrl = await proxyChain.anonymizeProxy(oldProxyUrl);
        const browser = await puppeteer.launch({
            ignoreHTTPSErrors: true,
            args: [
                `--proxy-server=${newProxyUrl}`,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });
        const page = await browser.newPage();

        // signal to the intermediate proxy server what upstream proxy we want to use
        /* await page.setExtraHTTPHeaders({
            prueba: 'quisio',
            'x-no-forward-upstream-proxy': 'https://api.scrapfly.io/scrape?key=scp-live-b1e846906a064b4ebea55b5d2c856821&url=https%3A%2F%2Fhttpbin.dev%2Fanything&country=ar'
        }); */

        let saved = false;
        let retArray = []

        try {
            await page.goto(`${url}`)
        } catch (e) {
            setTimeout(async () => {
                await page.goto(`${url}`)
            }, 1.08e+7)
        }

        const pages = await page.$$eval('nav ul li', (pages) => pages ? (pages.length < 11 ? pages.length : pages[pages.length - 1].children[0].innerText) : 1)

        let pageNumber = await dataUtils.recapPageNum(id, groupingPages);

        for (pageNumber; pageNumber <= parseInt(pages); pageNumber++) {

            if (saved && test) break;
            saved = false;
            await page.goto(`${url}?page=${pageNumber}`)
            await page.waitForSelector('.safari-card')
            await page.mouse.move(100, 100, {steps: 10}); // move the mouse in a human-like way
            await page.mouse.click(0, 0); // click on a specific point
            console.log(`Processing page ${pageNumber} of ${pages} for url: ${url}`)
            const selectors = {
                cardSelector: 'div.content-start > div',
                link: 'a',
                title: 'a h2',
                mts: 'a .card-body > div:nth-last-child(-n + 2)',
                price: 'a .card-body > div:last-child'
            }

            const data = await page.$$eval(selectors.cardSelector, (list, selectors) => {
                const getPrice = (innerText) => {
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
                    const coin = types.find(e => innerText.indexOf(e.symbol) !== -1)
                    if (!coin) return null
                    return {
                        type: coin.name,
                        amount: innerText.replaceAll('.', '').split(coin.symbol)?.[1]?.trim()
                    }
                }
                return list.map((element) => {
                    return {
                        link: element.querySelector(selectors.link).getAttribute('href'),
                        title: element.querySelector(selectors.title)?.innerText,
                        details: {
                            meters: element.querySelector(selectors.mts)?.innerText.split('\n')?.[0],
                            price: getPrice(element.querySelector(selectors.price)?.innerText),
                        }
                    }
                })
            }, selectors)

            const filteredData = data.filter(item => item.details?.price?.amount && item.details?.meters)

            const profileData = []
            for (const i of filteredData) {
                // add timeout random between 1 and 5 seconds for each profile
                await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 5000)));
                try {
                    await page.goto(i.link)
                    await page.waitForSelector('div.justify-between')
                    await page.mouse.move(100, 100, {steps: 10}); // move the mouse in a human-like way
                    await page.mouse.click(10000, 10000); // click on a specific point
                    const featureDescription = await page.$$eval('p', (results) => {
                        const asArray = Array.from(results)
                        const [, ...features] = asArray?.find(e => e.innerText === "Características").closest('div')?.children
                        const [, ...otherFeatures] = asArray?.find(e => e.innerText === "Otras características").closest('div')?.children
                        const description = asArray?.find(paragraph => paragraph?.innerText === 'Descripción')?.closest('div')?.innerText.toUpperCase()
                        return {
                            features: [...features, ...otherFeatures]
                                ?.map(feature => feature?.innerText.replace('\\n', '').trim())
                                ?.join(','),
                            description
                        }
                    })
                    const getLocationDOMData = async (locationInput) =>
                        await page.$$eval('.container.main-wrapper .bg-light-gray > div', (results, locationInput) => {
                            return results
                                ?.filter(e => e?.children[0]?.children[0]?.children[0]?.textContent?.indexOf(locationInput) !== -1)
                                ?.map(e => e?.children[0]?.children[1]?.textContent?.trim()
                                )
                        }, locationInput)
                    const getLocationData = async () => {
                        let [city, neighborhood] = await getLocationDOMData('_ciudad')
                        if (!neighborhood) {
                            city = undefined
                            neighborhood = city
                        }
                        const province = (await getLocationDOMData('_provinicia'))?.[0] ?? ''
                        return {
                            neighborhood,
                            city,
                            province
                        }
                    }
                    const locationData = await getLocationData()
                    const getContactData = async (selector, clickedSelector) => {
                        try {
                            await page.waitForSelector(selector)
                            await page.click(selector)
                            return await page.$eval(clickedSelector, telButton => telButton?.innerText || 'no data')
                        } catch (e) {
                            return 'no data'
                        }
                    }
                    const phoneNumber = await getContactData('#ver-tel', '#tel > span > span')
                    const mail = await getContactData('#ver-mail', '#mail > a')
                    let finished = false
                    try {
                        finished = await page.$eval('#camera .h2', result => result?.innerText && result?.innerText?.toLowerCase()?.indexOf('finalizado') !== -1)
                    } catch (e) {
                        // throw element not found
                    }
                    const announcerType = await page.$eval('.clearfix .container.px2 div.h5.gray', result => {
                        if (result?.innerText) {
                            return 'inmobiliaria'
                        }
                        return 'no data'
                    })
                    profileData.push({
                        ...featureDescription,
                        ...locationData,
                        phoneNumber,
                        mail,
                        finished,
                        announcerType
                    })
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
                        // it analyzes data to infer some features
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
        if (!saved && pages !== 0) {
            retArray = retArray.map(item => item.details.finished ? {...item, accuracy: 0} : utils.getAccuracy(item))
            await dataUtils.createRealScrapFile(id, pages, retArray)
        }
        if (pages === 0) {
            console.log('Scraper finished without results')
        }
        // Clean up
        await browser.close();
        await proxyChain.closeAnonymizedProxy(newProxyUrl, true);
    },
    realScrapApi: async function (url, id, groupingPages, test = false) {
        let saved = false
        let rootHtml
        try {
            if (test) {
                rootHtml = await dataUtils.getGenericData('./generic-data/scrappingApi')
            }
        } catch (e) {
        }

        if (!rootHtml) {
            rootHtml = await utils.getHtmlText(url)
            test && await dataUtils.createGenericFile('scrappingApi', html, 'text')
        }

        const selectors = {
            pages: 'nav ul li',
            card: 'div.content-start > div',
            link: 'a',
            title: 'a h2',
            mts: 'a .card-body > div:nth-last-child(2)',
            price: 'a .card-body > div:last-child'
        }

        const dom = parse(rootHtml);
        const pageArray = Array.from(dom.querySelectorAll(selectors.pages))
        let pages = pageArray
            ? (pageArray.length < 11
                ? pageArray.length
                : parseInt(pageArray[pageArray.length - 1].textContent))
            : 1
        let pageNumber = await dataUtils.recapPageNum(id, groupingPages);

        let retArray = []
        for (pageNumber; pageNumber <= pages; pageNumber++) {
            console.log(`Processing page ${pageNumber} of ${pages} for url: ${url}`)
            if (pageNumber > 1) {
                rootHtml = await utils.getHtmlText(`${url}?page=${pageNumber}`)
            }
            const cards = dom.querySelectorAll(selectors.card)[0]

            const data = []

            for (const element of cards) {
                let detailHtml = ''
                const mts = element.querySelector(selectors.mts).textContent
                const title = element.querySelector(selectors.title).textContent
                const price = await dataUtils.getPrice(element.querySelector(selectors.price).textContent)
                const link = element.querySelector(selectors.link).getAttribute('href')
                try {
                    if (test) {
                        detailHtml = await dataUtils.getGenericData('./generic-data/detailHtmlApi')
                    }
                } catch (e) {
                }

                if (!detailHtml) {
                    detailHtml = await utils.getHtmlText(link)
                    test && await dataUtils.createGenericFile('detailHtmlApi', detailHtml, 'text')
                }
                console.log(`Processing link: ${link}`)
                const detailDom = parse(detailHtml);
                const featureDescription = await this._getFeatureDescription(detailDom, 'p')
                const completeData = await utils.removeAccents(title.concat(featureDescription.description).toLowerCase())
                const analyzedData = await dataUtils.analyzeData(completeData)
                data.push({
                    link,
                    title,
                    finished: (await this._isFinished(detailDom)),
                    meters: mts?.split('\n')?.[0],
                    price,
                    announcer: (await this._getAnnouncerType(detailDom)),
                    ...featureDescription,
                    ...(await this._getLocationData(detailDom)),
                    ...analyzedData
                })
                console.log(`data: ${JSON.stringify(data[data.length - 1])}`)
            }
            console.log('Flatting data')
            retArray = [...retArray, ...data]
            // this checks if it has to save the accumulated data, if so, cleans the array
            if (this._hasToSave(pageNumber, groupingPages)) {
                try {
                    await dataUtils.createRealScrapFile(id, pageNumber, retArray)
                } catch (e) {
                    console.error(e)
                    throw e
                }
                retArray = []
                saved = true
            }
        }
        if (!saved && pages !== 0) {
            retArray = retArray.map(item => item.details.finished ? {...item, accuracy: 0} : utils.getAccuracy(item))
            await dataUtils.createRealScrapFile(id, pages, retArray)
        }
        if (pages === 0) {
            console.log('Scraper finished without results')
        }
    },
    _getAnnouncerType: async function (document) {
        const element = await document.querySelector('.clearfix .container.px2 div.h5.gray')
        return element?.textContent || 'no data'
    },
    _isFinished: async function (document) {
        const element = await document.querySelector('#camera .h2')
        return element?.textContent && element?.textContent?.toLowerCase()?.indexOf('finalizado') !== -1
    },
    _getLocationData: async function (document) {
        let [city, neighborhood] = await this._getLocationDOMData(document, '_ciudad')
        if (!neighborhood) {
            neighborhood = JSON.parse(JSON.stringify(city))
            city = undefined
        }
        const province = (await this._getLocationDOMData(document, '_provinicia'))?.[0] ?? ''
        return {
            neighborhood,
            city,
            province
        }
    },
    _getLocationDOMData: async function (document, locationInput) {
        const elements = document.querySelectorAll('.container.main-wrapper .bg-light-gray > div')
        const mappedElements = elements
            ?.map(e => {
                return {
                    text: e?.querySelector('div > div + div')?.textContent?.trim() || e?.querySelector('a')?.textContent?.trim(),
                    label: e?.querySelector('title')?.textContent
                }
            })
        const filteredElements = mappedElements?.filter(e => e?.label && e?.label?.indexOf(locationInput) !== -1)
        return filteredElements?.map(e => e.text)

    },
    _getFeatureDescription: async function (document, selector) {
        const asArray = Array.from(document.querySelectorAll(selector))
        const [, ...features] = asArray?.find(e => e.textContent === "Características").closest('div')?.childNodes
        const [, ...otherFeatures] = asArray?.find(e => e.textContent === "Otras características").closest('div')?.childNodes
        const description = asArray?.find(paragraph => paragraph.textContent === 'Descripción')?.closest('div').textContent
        const result = {
            features: [...features, ...otherFeatures]
                ?.map(feature => feature.textContent?.replace('\\n', '').trim())
                ?.join(','),
            description
        }
        return result
    },
    _hasToSave: function (page, groupingPages) {
        return page % groupingPages === 0
    },
    // this scrapper gets all the locations by province that are registered in argentina.gob.ar
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
    }   ,
    // this scrapper gets all the neighborhoods that are defined in la voz del interior
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