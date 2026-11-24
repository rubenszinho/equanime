"""Opens a CV the way a person does on CNPq's site: home page, Busca Textual, the name,
the result, "Abrir Currículo".

CNPq's search runs an invisible reCAPTCHA that scores the session and hands the CV link
its token; for a normal visit no challenge appears. If one ever does (a checkbox or
image challenge, or the captcha page), the collection stops with `captcha_required` and
the API asks the user for the XML. Equânime never solves or fakes a captcha.

One browser per CV, one CV at a time (the job queue), with pauses between steps.
"""
from __future__ import annotations

import os
import random
import re
import time
import unicodedata

from equanime_collector.cnpq import SourceError

HOME = "https://lattes.cnpq.br/"
SEARCH = "https://buscatextual.cnpq.br/buscatextual/busca.do?metodo=apresentar"
# How many same-name results to open before giving up on finding the requested ID.
MAX_OPENED = int(os.environ.get("EQUANIME_BUSCA_MAX_RESULTS", "5"))
TIMEOUT_MS = 30_000
CHALLENGE = "#divCaptcha, iframe[src*='recaptcha/api2/bframe'], iframe[src*='recaptcha/enterprise/bframe']"


def pause(low: float = 0.8, high: float = 2.0) -> None:
    time.sleep(random.uniform(low, high))


def challenged(page) -> bool:
    for frame in page.locator(CHALLENGE).all():
        try:
            if frame.is_visible():
                return True
        except Exception:  # a frame that went away is not a challenge
            continue
    return False


def stop_if_challenged(page) -> None:
    if challenged(page):
        raise SourceError("captcha_required", "O site do CNPq pediu captcha. Envie o XML do currículo.")


def tokens(name: str) -> set[str]:
    plain = unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode().lower()
    return {word for word in re.findall(r"[a-z]+", plain) if len(word) > 2}


def by_likeness(name: str, results: list[str]) -> list[int]:
    """Result positions, the names sharing most words with `name` first."""
    wanted = tokens(name)
    return sorted(range(len(results)), key=lambda index: -len(wanted & tokens(results[index])))


def page_id(html: str) -> str | None:
    match = re.search(r"ID Lattes:\s*(?:<[^>]+>\s*)*([0-9]{16})", html)
    return match.group(1) if match else None


def fetch_cv_page(name: str, lattes_id: str) -> str:
    """The CV page's HTML for `lattes_id`, found by searching `name`."""
    from playwright.sync_api import Error as PlaywrightError, sync_playwright

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                context = browser.new_context(locale="pt-BR", timezone_id="America/Sao_Paulo")
                context.set_default_timeout(TIMEOUT_MS)
                page = context.new_page()
                # The home page sets the cookies the search expects.
                page.goto(HOME, wait_until="domcontentloaded")
                pause()
                page.goto(SEARCH, wait_until="domcontentloaded")
                stop_if_challenged(page)
                pause()
                box = page.locator("#textoBusca")
                box.click()
                box.press_sequentially(name, delay=random.randint(80, 160))
                pause(0.4, 1.0)
                page.locator("#botaoBuscaFiltros").first.click()
                page.wait_for_load_state("domcontentloaded")
                pause(1.5, 2.5)
                stop_if_challenged(page)
                results = page.locator(".resultado li a")
                count = results.count()
                if count == 0:
                    raise SourceError("not_found", f"A busca do CNPq não encontrou currículos para o nome {name}.")
                for index in by_likeness(name, results.all_inner_texts())[:MAX_OPENED]:
                    results.nth(index).click()
                    opener = page.locator("#idbtnabrircurriculo")
                    opener.wait_for(state="visible")
                    pause()
                    with context.expect_page() as popup:
                        opener.click()
                    cv = popup.value
                    cv.wait_for_load_state("domcontentloaded")
                    pause(1.0, 2.0)
                    stop_if_challenged(cv)
                    html = cv.content()
                    cv.close()
                    if page_id(html) == lattes_id:
                        return html
                    # Another person with the same name: close the preview, try the next one.
                    page.keyboard.press("Escape")
                    closer = page.locator("#idbtnfechar, a:has-text('Fechar')").first
                    if closer.is_visible():
                        closer.click()
                    pause()
                raise SourceError(
                    "not_found",
                    f"A busca do CNPq por {name} não trouxe o currículo {lattes_id} entre os {min(count, MAX_OPENED)} primeiros resultados.",
                )
            finally:
                browser.close()
    except PlaywrightError as error:
        raise SourceError("temporary_unavailable", "O site do CNPq não respondeu como esperado.") from error
