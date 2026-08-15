import scrapy


class EnrichItem(scrapy.Item):
    url = scrapy.Field()
    title = scrapy.Field()
    emails = scrapy.Field()
    phones = scrapy.Field()
    instagram = scrapy.Field()
    facebook = scrapy.Field()
    whatsapp = scrapy.Field()
