from promptflow import tool
import json 
import sys 
import os 
from azure.cosmos import CosmosClient
import uuid

@tool
def validate_gen(auth: bool, input1: str = "", language: str = '') -> str:
    if not auth: 
        return {"error": "AuthError", "message": f"Flow key missmatch"}
    else:
        try:
            generated = json.loads(input1)      
        except Exception as e:
            print(f"Cannot parse model output: {e}. Output: {input1}", file=sys.stderr)
            return {"error": "JsonParseError", "message": f"Cannot parse: {input1}"}    
        try: #simple validation of AI output - add more
            compile(generated["code"], "ex0", "exec")
        except SyntaxError as e: 
            code = generated["code"]
            print(f"Syntax error in model code: {e}. Code: {code}")
            return {"error": "SyntaxError", "message": f"Error {e} in {code}"}
        cosmos_endpoint = os.environ["COSMOS_ENDPOINT"]
        cosmos_key = os.environ["COSMOS_KEY"]
        client = CosmosClient(url=cosmos_endpoint, credential=cosmos_key)
        db = client.get_database_client(database="gpt-parsons-db")
        container = db.get_container_client(container="exercise_raw")
        exercise_id = str(uuid.uuid4())
        container.create_item({"id": exercise_id, "language": language, **generated})
        return generated