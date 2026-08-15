"""Spider de enriquecimento: visita o site institucional de uma empresa e
extrai e-mail, telefone, Instagram, Facebook e WhatsApp. Apenas a página
inicial é visitada (sem seguir links externos). Falhas/timeout não quebram
o job — o serviço retorna item vazio ou erro tolerável.
"""
import re

import scrapy

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
PHONE_RE = re.compile(
    r"(?:\+?55[\s()-]*)?(?:\d{2,3}[\s()-]*)?\d{4,5}[\s()-]*\d{4}"
)
INSTA_RE = re.compile(r"instagram\.com/(?:p/)?([a-zA-Z0-9_.]{3,30})", re.IGNORECASE)
FACEBOOK_RE = re.compile(r"facebook\.com/([a-zA-Z0-9_.\-]{3,60})", re.IGNORECASE)
WHATSAPP_RE = re.compile(
    r"(?:wa\.me/|api\.whatsapp\.com/send\?phone=)(\d+)", re.IGNORECASE
)


class EnrichmentSpider(scrapy.Spider):
    name = "enrichment"

    def __init__(self, url=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.start_urls = [url] if url else []

    def parse(self, response):
        text = " ".join(response.xpath("//text()").getall() or [])
        if not text:
            text = response.text or ""

        emails = list(dict.fromkeys(EMAIL_RE.findall(text)))[:5]
        phones = list(dict.fromkeys(PHONE_RE.findall(text)))[:5]

        instagram = None
        m = INSTA_RE.search(text)
        if m:
            instagram = m.group(1).strip("/")

        facebook = None
        m = FACEBOOK_RE.search(text)
        if m:
            facebook = "https://facebook.com/" + m.group(1)

        whatsapp = None
        m = WHATSAPP_RE.search(text)
        if m:
            whatsapp = "+" + re.sub(r"\D", "", m.group(1))

        title = response.xpath("//title/text()").get()
        yield {
            "url": response.url,
            "title": (title or "").strip()[:200],
            "emails": emails,
            "phones": phones,
            "instagram": instagram,
            "facebook": facebook,
            "whatsapp": whatsapp,
        }
