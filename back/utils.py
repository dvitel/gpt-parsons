import json
import azure.functions as func
from typing import Optional

def process_entity(entity):
    ''' Removes sensitive db info'''
    if type(entity) is list or isinstance(entity, func.DocumentList):
       return [process_entity(el) for el in entity]
    if isinstance(entity, func.Document):
        entity = entity.to_dict()
    if isinstance(entity, dict):
        return {k:v for k, v in entity.items() if not k.startswith("_")}
    return entity

def http_err(error: str, message: str, *, data: dict = {}, status: int = 400) -> func.HttpResponse:
    ''' Builds json error response 400 or other '''
    return func.HttpResponse(json.dumps({**data, 'error':error, 'message': message}), 
                                status_code=status, mimetype="application/json")

def http_ok(data: dict, *, created_url: Optional[str] = None) -> func.HttpResponse:
    ''' Builds json response for 200 and 201 '''
    resp = func.HttpResponse(json.dumps({**data, "ok": True}), status_code=200 if created_url is None else 201, mimetype="application/json")
    if created_url is not None:
        resp.headers['Location'] = created_url
    return resp