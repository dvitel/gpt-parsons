from promptflow import tool
import os

@tool
def auth(key: str, domain: str) -> str:
  domainCase = ""
  if os.environ.get("FLOW_KEY", "") == key: 
    domainCase = domain
  return {"domain": domainCase}
