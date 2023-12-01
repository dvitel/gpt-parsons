from promptflow import tool
import json 
import sys 
#https://microsoft.github.io/promptflow/cloud/azureai/deploy-to-azure-appservice.html

@tool
def postprocess(domain: str = "", prog: str = "", hist: str = "", chain: str = "") -> str:
    res = {"programming": prog, "history": hist, "chain": chain}
    if domain == "": 
        return {"error": "AuthError", "message": f"Flow key missmatch"}
    elif domain in res:
        try:
            generated = json.loads(res[domain])      
        except Exception as e:
            print(f"Cannot parse model output: {e}. Output: {res[domain]}", file=sys.stderr)
            return {"error": "JsonParseError", "message": f"Cannot parse: {res[domain]}"}    
        return generated
    return {"error": "Unsupported", "message": "Specified domain is not yet supported"}