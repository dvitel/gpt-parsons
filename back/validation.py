import functools
import logging
from typing import Optional
from jsonschema import validate, ValidationError
import azure.functions as func
from utils import http_err, http_ok, process_entity

def get_validation_error(input: dict, schema: dict) -> Optional[func.HttpResponse]:
    try: 
        validate(input, schema)
        return None
    except ValidationError as e:
        return http_err("Validation", str(e))    
        

def validate_as_json(input_schema: str = None, outputs_404 = False):
    ''' decorator to convert HttpRequest and response to json and check the schema '''
    def decorator_as_json(f):
        @functools.wraps(f)
        def wrapper(*args, **kwargs):
            try:
                url = ""
                req_method = ""
                has_document_in_list = False 
                for arglist in [args, kwargs.values()]:
                    for a in arglist:
                        if isinstance(a, func.HttpRequest):
                            url = a.url.strip("/")
                            req_method = a.method.lower()
                            if input_schema is not None:
                                a_json = a.get_json()
                                logging.info(f"[validate_as_json] validating {a_json}")
                                validate(a_json, input_schema)                         
                                a.get_json = lambda: a_json
                        if isinstance(a, func.DocumentList):
                            has_document_in_list = len(a) > 0
                if outputs_404 and req_method == "get" and not has_document_in_list:
                    logging.info(f"[validate_as_json] not found: {url}")
                    return http_err("NotFound", "Requested entity was not found", status=404)
                entity = f(*args, **kwargs)
                if isinstance(entity, func.HttpResponse):
                    return entity
                created_url = None 
                if "id" in entity and req_method == "post":
                    entity_id = entity["id"]
                    created_url = f"{url}/{entity_id}"
                return http_ok({"data": process_entity(entity)}, created_url=created_url)
            except ValidationError as e:
                logging.error(f"[{f.__name__}] error {e}")
                return http_err("Validation", str(e))
            except ValueError as e:
                logging.error(f"[{f.__name__}] error {e}")
                return http_err("Validation", str(e))            
            except Exception as e: 
                logging.error(f"[{f.__name__}] error {e}")
                return http_err("InternalServerError", str(e), status=500)
        return wrapper
    return decorator_as_json

def log_err(f):
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception as e: 
            logging.error(f"[{f.__name__}] error {e}")
    return wrapper
