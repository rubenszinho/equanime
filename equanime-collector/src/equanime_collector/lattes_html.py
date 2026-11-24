"""Reads a Lattes CV page (buscatextual's visualizacv.do) into the API's Curriculum shape.

The page is the XML rendered for people, so it carries the same records the API's XML
parser reads: publications (with the Lattes IDs CNPq links on co-authors), research
projects, concluded and ongoing advising, and the person's own degrees with advisors.
Co-authors appear in citation form ("MARCACINI, R. M."); the rules match those against
each person's citation names (`aliases`).
"""
from __future__ import annotations

import copy
import re

from bs4 import BeautifulSoup, NavigableString, Tag

ID = re.compile(r"lattes\.cnpq\.br/([0-9]{16})")
YEAR = re.compile(r"\b(19[0-9]{2}|20[0-9]{2})\b")

# Section anchors (<a name="...">) whose items become records.
PUBLICATIONS = {
    "ArtigosCompletos": "Artigo",
    "ArtigosAceitos": "Artigo aceito",
    "TrabalhosPublicadosAnaisCongresso": "Trabalho em evento",
    "TextosJornaisRevistas": "Texto em jornal ou revista",
}
LEVELS = {"mestrado": "mestrado", "doutorado": "doutorado", "pós-doutorado": "pos_doutorado", "pos-doutorado": "pos_doutorado"}


class PageError(Exception):
    """The page is not a CV this parser can read."""


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def lattes_ids(node: Tag) -> list[str]:
    found: list[str] = []
    for link in node.find_all("a", href=True):
        match = ID.search(link["href"])
        if match and match.group(1) not in found:
            found.append(match.group(1))
    return found


def first_id(node: Tag) -> str | None:
    ids = lattes_ids(node)
    return ids[0] if ids else None


def level_of(text: str) -> str | None:
    lowered = text.lower()
    if "pós-doutorado" in lowered or "pos-doutorado" in lowered or "pós-doc" in lowered:
        return "pos_doutorado"
    if "doutorado" in lowered:
        return "doutorado"
    if "mestrado" in lowered:
        return "mestrado"
    return None


def level_name(level: str) -> str:
    return {"mestrado": "mestrado", "doutorado": "doutorado"}.get(level, "pós-doutorado")


def header(soup: BeautifulSoup) -> tuple[str | None, str | None, str | None, list[str]]:
    name_node = soup.select_one(".infpessoa .nome") or soup.select_one("h2.nome")
    name = clean(name_node.get_text(" ")) if name_node else None
    text = clean(soup.get_text(" "))
    lattes_id = re.search(r"ID Lattes:\s*([0-9]{16})", text)
    updated = re.search(r"Última atualização do currículo em ([0-9]{2})/([0-9]{2})/([0-9]{4})", text)
    aliases: list[str] = []
    for label in soup.find_all("b"):
        if clean(label.get_text()) == "Nome em citações bibliográficas":
            cell = label.find_parent("div", class_="layout-cell-3")
            value = cell.find_next_sibling("div") if cell else None
            if value:
                aliases = [item.strip() for item in value.get_text().split(";") if item.strip()]
            break
    return (
        name,
        lattes_id.group(1) if lattes_id else None,
        f"{updated.group(3)}-{updated.group(2)}-{updated.group(1)}" if updated else None,
        aliases,
    )


def publication(item: Tag, kind: str) -> dict | None:
    item = copy.copy(item)  # the walk still visits the original's children
    year_node = item.find("span", attrs={"data-tipo-ordenacao": "ano"})
    explicit_year = clean(year_node.get_text()) if year_node else ""
    for noise in item.select("span.informacao-artigo, span.citado, sup"):
        noise.decompose()
    text = clean(item.get_text(" "))
    cut = text.find(" . ")
    if cut < 0:
        return None
    authors = [clean(author) for author in text[:cut].split(";") if clean(author)]
    rest = text[cut + 3 :]
    title = clean(rest.split(". ")[0]).rstrip(".")
    if not title:
        return None
    years = YEAR.findall(rest)
    published = int(explicit_year) if explicit_year.isdigit() else (int(years[-1]) if years else None)
    return {
        "title": title,
        "year": published,
        "authors": authors,
        "author_ids": lattes_ids(item),
        "source_record": f"{kind}{f' {published}' if published else ''} — {title}",
    }


def advising(item: Tag, level: str, ongoing: bool) -> dict | None:
    text = clean(item.get_text(" "))
    name = clean(text.split(". ")[0])
    if not name:
        return None
    institution = re.search(r"\)\s*-\s*([^,.]+)", text)
    record = {
        "advisee_name": name,
        "advisee_id": first_id(item),
        "level": level,
        "institution": clean(institution.group(1)) if institution else None,
    }
    if ongoing:
        start = re.search(r"Início:\s*([0-9]{4})", text)
        begun = start.group(1) if start else None
        record |= {
            "year": None,
            "period": f"{begun or '?'}–atual",
            "ongoing": True,
            "source_record": f"Orientação em andamento de {level_name(level)} de {name} (desde {begun or 'data não informada'})",
        }
    else:
        # "Name. Title. 2024. Dissertação (...)": the year right before the work's type.
        done = re.search(r"\b([0-9]{4})\.\s*(?:Dissertação|Tese|Supervisão|Monografia|Trabalho|Iniciação|Orientação)", text)
        years = YEAR.findall(text)
        finished = int(done.group(1)) if done else (int(years[-1]) if years else None)
        record |= {
            "year": finished,
            "period": str(finished) if finished else None,
            "source_record": f"Orientação concluída de {level_name(level)} de {name}{f' ({finished})' if finished else ''}",
        }
    return record


def training(period: str, item: Tag) -> dict | None:
    text = clean(item.get_text(" "))
    first = text.split(". ")[0]
    level = level_of(first)
    if not level:
        return None
    advisor_name = None
    advisor_id = None
    for label in ("Orientador", "Supervisor"):
        for node in item.find_all(string=re.compile(rf"{label}\s*:")):
            # "Orientador: <a href=lattes/ID></a>Name." or "Orientador: Name."
            following = node.next_sibling
            if isinstance(following, Tag) and following.name == "a" and ID.search(following.get("href", "")):
                advisor_id = ID.search(following["href"]).group(1)
                tail = following.next_sibling
                advisor_name = clean(str(tail)).rstrip(".") if isinstance(tail, NavigableString) else None
            else:
                match = re.search(rf"{label}\s*:\s*([^.]+)", str(node))
                advisor_name = clean(match.group(1)) if match else None
            break
        if advisor_name or advisor_id:
            break
    lines = [clean(part) for part in item.get_text("\n").split("\n") if clean(part)]
    institution = lines[1].rstrip(".").split(",")[0] if len(lines) > 1 else None
    years = YEAR.findall(period)
    start = years[0] if years else None
    end = years[1] if len(years) > 1 else None
    ongoing = "atual" in period.lower() or (start is not None and end is None and "-" in period)
    if not ongoing and start and not end:
        end, start = start, None
    shown = f"{start}–{end or 'atual'}" if start else end
    return {
        "level": level,
        "advisor_name": advisor_name,
        "advisor_id": advisor_id,
        "year": int(end) if end else None,
        "period": shown,
        "ongoing": ongoing,
        "institution": institution or None,
        "source_record": f"Formação: {level_name(level)}{f' em {institution}' if institution else ''}"
        f"{f', orientação de {advisor_name}' if advisor_name else ''}{f' ({shown})' if shown else ''}",
    }


def parse_cv_page(html: str, *, requested_name: str, lattes_url: str, consulted_at: str) -> dict:
    soup = BeautifulSoup(html, "lxml")
    if soup.select_one("#divCaptcha"):
        raise PageError("A página pediu captcha.")
    name, lattes_id, updated, aliases = header(soup)
    if not lattes_id:
        raise PageError("A página não traz o ID Lattes de 16 dígitos.")

    publications: list[dict] = []
    projects: dict[str, dict] = {}
    advisings: list[dict] = []
    trainings: list[dict] = []

    section: str | None = None
    subsection = ""
    project: dict | None = None
    for node in soup.body.find_all(True) if soup.body else []:
        if node.name == "a" and node.get("name"):
            anchor = node["name"]
            if "_" not in anchor:
                section = anchor
                subsection = clean(node.parent.get_text(" ")) if node.parent and node.parent.name == "b" else ""
                project = None
            continue
        classes = node.get("class") or []
        if "cita-artigos" in classes:
            subsection = clean(node.get_text(" "))
            continue
        if node.name == "span" and "transform" in classes:
            if section in PUBLICATIONS or section == "LivrosCapitulos":
                kind = PUBLICATIONS.get(section or "") or ("Capítulo de livro" if "apítulo" in subsection else "Livro")
                record = publication(node, kind)
                if record:
                    publications.append(record)
            elif section in {"Orientacaoemandamento", "Orientacoesconcluidas"}:
                level = level_of(subsection)
                record = advising(node, level, section == "Orientacaoemandamento") if level else None
                if record:
                    advisings.append(record)
            continue
        if node.name == "div" and "layout-cell-9" in classes and section in {
            "FormacaoAcademicaTitulacao",
            "FormacaoAcademicaPosDoutorado",
            "ProjetosPesquisa",
        }:
            cell = node.find("div", class_="layout-cell-pad-5", recursive=False)
            label = node.find_previous_sibling("div", class_="layout-cell-3")
            period = clean(label.get_text(" ")) if label else ""
            if not cell:
                continue
            if section == "ProjetosPesquisa":
                if period:
                    title = clean(cell.get_text(" "))
                    years = YEAR.findall(period)
                    span = f"{years[0]}–{years[1] if len(years) > 1 else 'atual'}" if years else None
                    project = {
                        "title": title,
                        "period": span,
                        "institution": None,
                        "participants": [],
                        "participant_ids": [],
                        "source_record": f"Projeto de pesquisa{f' ({span})' if span else ''} — {title}",
                    }
                    if title and title not in projects:
                        projects[title] = project
                elif project is not None:
                    text = clean(cell.get_text(" "))
                    nature = re.search(r"Natureza:\s*([^.;]+)", text)
                    if nature and clean(nature.group(1)).lower() != "pesquisa":
                        projects.pop(project["title"], None)
                    members = re.search(r"Integrantes:\s*(.+?)(?:\.\s*(?:Financiador|Número|$)|$)", text)
                    if members:
                        project["participants"] = [
                            clean(part.rsplit(" - ", 1)[0]) for part in members.group(1).split(" / ") if clean(part)
                        ]
                    project["participant_ids"] = lattes_ids(cell)
            else:
                record = training(period, cell)
                if record:
                    trainings.append(record)

    return {
        "requested_name": requested_name,
        "detected_name": name,
        "lattes_id": lattes_id,
        "lattes_url": lattes_url,
        "consulted_at": consulted_at,
        "source": "public_page",
        "aliases": aliases,
        "lattes_updated_at": updated,
        "collection_status": "complete",
        "error_type": None,
        "error_message": None,
        "warnings": [],
        "publications": publications,
        "projects": list(projects.values()),
        "advising": advisings,
        "training": trainings,
    }
