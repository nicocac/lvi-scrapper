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
    }
}

