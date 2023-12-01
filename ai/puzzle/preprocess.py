from promptflow import tool
import os

supported_languages = ["python"]
supported_domains = [*supported_languages,"history","chain"]

@tool
def auth(key: str, domain: str) -> str:
  domainCase = ""
  if os.environ.get("FLOW_KEY", "") == key: 
    if domain in supported_languages:
      domainCase = "programming"
    else: 
      domainCase = domain
  return {"domain": domainCase}
