const { ZenRows } = require("zenrows");

module.exports = {
    getAccuracy: function (item, location) {
        if(!location) return 0;
        const neighborhoodKeys = location?.split(' ').filter(k => k !== 'de')
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
    removeAccents: async function (str) {
        return str.normalize("NFD").replaceAll(/[\u0300-\u036f]/g, "");
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
            resolve(element._rawText)
        })
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
                resolve(html.data)
            }, Math.random() * 2000)
        })
    }
}

