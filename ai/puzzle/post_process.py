from promptflow import tool
import json 
import sys 
#https://microsoft.github.io/promptflow/cloud/azureai/deploy-to-azure-appservice.html

@tool
def validate_gen(auth: bool, input1: str = "") -> str:
    if not auth: 
        return {"error": "AuthError", "message": f"Flow key missmatch"}
    else:
        try:
            generated = json.loads(input1)      
        except Exception as e:
            print(f"Cannot parse model output: {e}. Output: {input1}", file=sys.stderr)
            return {"error": "JsonParseError", "message": f"Cannot parse: {input1}"}    
        return generated