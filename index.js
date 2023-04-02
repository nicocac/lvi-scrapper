const puppeteer = require('puppeteer');
const fs = require('fs');
const utils = require('./utils');

(async () => {

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const neighborhoods = [
        "aras-de-manantiales",
        "miradores-de-manantiales",
        "prados-de-manantiales",
        "solares-de-manantiales",
        "colinas-de-manantiales",
        "lomas-de-manantiales",
        "altos-de-manantiales",
        "quebradas-de-manantiales",
        "rincon-de-manantiales",
        "costas-de-manantiales",
        "terrazas-de-manantiales",
        "cuestas-de-manantiales",
        "riberas-de-manantiales",
        "campos-de-manantiales",
        "pampas-de-manantiales",
        "brisas-de-manantiales",
        "manantiales"]
    const scrappingFolder = `./${utils.getDateString()}`
    const pendingNeighborhoods = neighborhoods.filter(neighborhood => !fs.existsSync(utils.getFileName(scrappingFolder, neighborhood)))
    let retArray = []

    for (let neighborhood of pendingNeighborhoods) {
        await Promise.all([
            page.waitForNavigation(),
            page.goto(`https://clasificados.lavoz.com.ar/inmuebles/terrenos-y-lotes/venta?provincia=cordoba&ciudad=cordoba&barrio[0]=${neighborhood}`)
        ])

        const pages = await page.evaluate(async () =>
            Array.from(document.querySelectorAll('nav ul li')).length || 1
        )

        for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
            await Promise.all([
                page.waitForNavigation(),
                page.goto(`https://clasificados.lavoz.com.ar/inmuebles/terrenos-y-lotes/venta?provincia=cordoba&ciudad=cordoba&barrio[0]=${neighborhood}&page=${pageNumber}`)
            ])
            console.log(`Processing page ${pageNumber} of ${pages} for neighborhood: ${neighborhood}`)
            let data = await page.evaluate(async (neighborhood) => {
                try {
                    const anchors = Array
                        .from(document.querySelectorAll('.safari-card'), element => element.querySelector('a').getAttribute('href'))
                    const titles = Array
                        .from(document.querySelectorAll('.safari-card'), element => element.querySelector('a h2')?.innerText)
                    const mts = Array
                        .from(document.querySelectorAll('.safari-card'), element => element.querySelector('a .card-body > div:nth-last-child(-n + 2)')?.innerText.split('\n')?.[0])
                    const prices = Array
                        .from(document.querySelectorAll('.safari-card'), element => element.querySelector('a .card-body > div:last-child')?.innerText.replace('.', '').split('U$S')?.[1]?.trim())
                    return anchors.map((data, index) => {
                        return {
                            link: data,
                            title: titles[index],
                            neighborhood,
                            details: {
                                mts: mts[index] || 0,
                                price: prices[index] || 0
                            }
                        }
                    })
                } catch (e) {
                    console.log(`Error Processing page ${pageNumber} of ${pages} for neighborhood ${neighborhood}: ${e.message}`)
                }
            }, neighborhood);
            const filteredData = data.filter(item => item.details.price && item.details.mts)
            const profileData = []
            for (const i of filteredData) {
                try {
                    await Promise.all([
                        page.waitForNavigation(),
                        page.goto(i.link)
                    ])
                    const announcerData = await page.evaluate(() => {
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
                        const finished = !!document.querySelector('#camera h2')?.innerText
                        const titlePlusDescription = `${title} ${description}`
                        return {
                            announcerType: document.querySelector('.container.main-wrapper > div + div > :nth-child(3) > div > div > div + div > div + div > div')?.innerText || (owner ? 'dueño' : 'no data'),
                            updated_at: [{array: document.querySelector('.border-top.border-bottom.border-silver > div > div')?.innerText.split(':')?.[1]?.trim().split('.')}]?.map(({array: updatedAt}) => new Date([updatedAt[1], updatedAt[0], updatedAt[2]]))[0].toJSON().slice(0, 19).replace('T', ' '),
                            features: [...features, ...otherFeatures]?.map(feature => feature?.innerText.replace('\\n', '').trim())?.join(','),
                            duplex: titlePlusDescription?.indexOf('APTO DUPLEX') !== -1 ? 1 : 0,
                            possession: titlePlusDescription?.indexOf('POSESION') !== -1 ? 1 : 0,
                            owner,
                            finished,
                            detailsTitle: title,
                            description,
                            north: titlePlusDescription.indexOf('NORTE') !== -1 ? 1 : 0,
                            location: Array.from(document.querySelectorAll("p"))?.find(paragraph => paragraph.innerText === 'Ubicación')?.closest('div')?.children?.[1]?.innerText,
                            telephone,
                            mail
                        }
                    })
                    profileData.push(announcerData)
                } catch (e) {
                    console.log(`Processing link ${i.link}: ${e.message}`)
                    return {}
                }
            }
            console.log(`Flatting data`)
            retArray = [...retArray, ...filteredData.map((item, index) => {
                return {
                    ...item,
                    details: {
                        ...item.details,
                        ...profileData[index]
                    }
                }
            })]
        }
        retArray = retArray.map(item => item.details.finished ? {...item, accuracy: 0 } : utils.getAccuracy(item))

        if (!fs.existsSync(`./${utils.getDateString()}`)){
            fs.mkdirSync(`./${utils.getDateString()}`);
        }
        await fs.writeFile(`./${utils.getDateString()}/result-${neighborhood}.json`, JSON.stringify(retArray), function (err) {
            if (err) throw err;
            console.log('File is created successfully.');
            retArray = []
        })
    }

    await browser.close();
})();