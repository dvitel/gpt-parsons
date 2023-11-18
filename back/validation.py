# import functools
from typing import Optional
import azure.functions as func
from jsonschema import validate, ValidationError
import json

def err(error: str, message: str, *, data: dict = {}, status: int = 400) -> func.HttpResponse:
    ''' Builds json error response 400 or other '''
    return func.HttpResponse(json.dumps({**data, 'error':error, 'message': message}), 
                                status_code=status, mimetype="application/json")

def ok(data: dict, *, created_url: Optional[str] = None) -> func.HttpResponse:
    ''' Builds json response for 200 and 201 '''
    resp = func.HttpResponse(json.dumps({**data, "ok": True}), status_code=200 if created_url is None else 201, mimetype="application/json")
    if created_url is not None:
        resp.headers['Location'] = created_url
    return resp

def get_validation_error(input, schema):
    try: 
        validate(input, schema)
        return None
    except ValidationError as e:
        return err("Validation", str(e))    
        
# def as_json(input_schema: str = None, outputs_201 = False):
#     ''' decorator to convert HttpRequest and response to json and check the schema '''
#     def decorator_as_json(func):
#         @functools.wraps(func)
#         def wrapper(*args, **kwargs):
#             try:
#                 args1 = []
#                 kwargs1 = {}
#                 url = ""
#                 for a in args:
#                     if type(a) is func.HttpRequest:
#                         a_json = a.get_json()
#                         validate(a_json, input_schema) 
#                         url = a.url.strip("/")
#                         args1.append(a_json)
#                     else:
#                         args1.append(a)
#                 for k, v in kwargs.items():
#                     if type(v) is func.HttpRequest:
#                         v_json = v.get_json()
#                         validate(v_json, input_schema) 
#                         url = v.url.strip("/")
#                         kwargs1[k] = v_json
#                     else:
#                         kwargs1[k] = v
#                 res = func(*args1, **kwargs1)
#                 created_url = None 
#                 if "id" in res and outputs_201:
#                     entity_id = res["id"]
#                     created_url = f"{url}/{entity_id}"
#                 return ok({"data": res}, created_url=created_url)
#             except ValidationError as e:
#                 return err("Validation", str(e))
#             except Exception as e: 
#                 return err("InternalServerError", str(e), status=500)
#         return wrapper
#     return decorator_as_json