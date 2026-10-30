"""CNPq's institutional Lattes extractor (WSCurriculo).

CNPq only answers IPs it has authorized for an institution; anything else gets
"Serviço negado.IP:...". The collector exists to run from such an IP, since
Workers have no fixed egress address. It never touches the public CV pages,
which sit behind a captcha.
"""
import base64
from html import unescape
import os
import re
from urllib.request import Request, urlopen

ENDPOINT = os.environ.get("EQUANIME_CNPQ_URL", "https://servicosweb.cnpq.br/srvcurriculo/WSCurriculo")
ENVELOPE = (
    '<?xml version="1.0" encoding="utf-8"?>'
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://ws.servico.repositorio.cnpq.br/">'
    "<soapenv:Body><ws:getCurriculoCompactado><id>{id}</id></ws:getCurriculoCompactado></soapenv:Body></soapenv:Envelope>"
)


class SourceError(Exception):
    def __init__(self, type_: str, message: str):
        super().__init__(message)
        self.type = type_
        self.message = message


def interpret(body: str) -> bytes:
    """The SOAP <return> holds a base64 ZIP, or an XML <ERRO> message."""
    match = re.search(r"<return>(.*?)</return>", body, re.S)
    if not match or not match.group(1).strip():
        raise SourceError("not_found", "O CNPq não devolveu este currículo.")
    value = unescape(match.group(1).strip())
    if value.startswith("<?xml") or "<ERRO>" in value:
        error = re.search(r"<ERRO>(.*?)</ERRO>", value, re.S)
        text = error.group(1).strip() if error else value
        if "negado" in text.lower():
            raise SourceError("not_authorized", "O extrator institucional do CNPq não autorizou este servidor.")
        raise SourceError("not_found", f"O CNPq não devolveu este currículo: {text}")
    try:
        return base64.b64decode(value, validate=False)
    except ValueError as error:
        raise SourceError("temporary_unavailable", "Resposta do CNPq ilegível.") from error


def fetch_zip(lattes_id: str, timeout: float = 60) -> bytes:
    request = Request(
        ENDPOINT,
        data=ENVELOPE.format(id=lattes_id).encode(),
        headers={"Content-Type": "text/xml; charset=utf-8", "SOAPAction": '""'},
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
    except OSError as error:
        raise SourceError("temporary_unavailable", "O serviço do CNPq não respondeu.") from error
    return interpret(body)
