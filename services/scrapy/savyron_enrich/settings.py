# SAVYRON Enrich — configuração do Scrapy.
# Respeita robots.txt, usa User-Agent identificável e delay educado.
BOT_NAME = "savyron_enrich"

SPIDER_MODULES = ["savyron_enrich.spiders"]
NEWSPIDER_MODULE = "savyron_enrich.spiders"

# Compliance: respeitar robots.txt e nunca burlar proteções.
ROBOTSTXT_OBEY = True
USER_AGENT = "SAVYRON-Prospector/1.0 (+https://crm.inovapro.cloud; enriquecimento de contatos publicos)"

# Velocidade educada: 1 request por vez, delay configurável.
DOWNLOAD_DELAY = float(__import__("os").environ.get("SCRAPY_REQUEST_DELAY_MS", "1000")) / 1000.0
CONCURRENT_REQUESTS = 1
CONCURRENT_REQUESTS_PER_DOMAIN = 1

# Timeout curto por site: se não responder, segue sem quebrar o job.
DOWNLOAD_TIMEOUT = 10

RETRY_ENABLED = True
RETRY_TIMES = 1
RETRY_HTTP_CODES = [500, 502, 503, 504, 408, 429]

COOKIES_ENABLED = False
AUTOTHROTTLE_ENABLED = False

LOG_LEVEL = "WARNING"
FEED_EXPORT_ENCODING = "utf-8"
FEED_EXPORT_INDENT = None

ITEM_PIPELINES = {
    "savyron_enrich.pipelines.EnrichPipeline": 300,
}
