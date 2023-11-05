from typing import Any, Optional
import azure.functions as func
import logging
import uuid
import json

#TODO: validation for all funcs: json schema and OpenAPI 3.1

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

def err(error: str, message: str, *, data: dict = {}) -> func.HttpResponse:
    ''' Builds json error response 400 '''
    return func.HttpResponse(json.dumps({**data, 'error':error, 'message': message}), status_code=400, mimetype="application/json")

def ok(data: dict, *, created_url: Optional[str] = None) -> func.HttpResponse:
    ''' Builds json response for 200 and 201 '''
    resp = func.HttpResponse(json.dumps({**data, "ok": True}), status_code=200 if created_url is None else 201, mimetype="application/json")
    if created_url is not None:
        resp.headers['Location'] = created_url
    return resp

@app.route(route="session", methods=["POST"])
@app.cosmos_db_output(arg_name="doc", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", container_name="sessions")
def start_session(req: func.HttpRequest, doc: func.Out[func.Document]) -> func.HttpResponse:
    ''' Creates new session for gpt-parsons, req contains configuration json '''
    session_details = req.get_json()       
    #TODO: validate user input data 
    if 'name' not in session_details:
        return err('Validation', "Name is required", data={'field':'name'})
    else:
        session_id = str(uuid.uuid4())     
        validated_session = {"id":session_id, "type": "default", "name": session_details["name"]}
        norm_url = req.url.strip("/")
        session_doc = func.Document.from_dict(validated_session)
        doc.set(session_doc) #add new session to DB
        logging.info(f'[session] {session_id} started with {session_details}')
        return ok({"sid": session_id}, created_url=f"{norm_url}/{session_id}")
    
@app.route(route="session/{id:guid}", methods=["GET"])
@app.cosmos_db_input(arg_name="docs", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", 
                        container_name="sessions", id="{id}", partition_key="default")
def get_session(req: func.HttpRequest, docs: func.DocumentList) -> func.HttpResponse:
    doc: func.Document = docs[0]
    session_data = doc.to_dict()
    return ok({"id": session_data["id"], "name": session_data["name"]})