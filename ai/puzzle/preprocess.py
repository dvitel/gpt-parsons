from promptflow import tool
import os

@tool
def auth(key: str) -> str:
  if os.environ.get("FLOW_KEY", "") == key: 
    return {"auth": True}
  return {"auth": False}
