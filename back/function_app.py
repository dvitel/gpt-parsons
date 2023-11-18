import json
import os
from threading import Thread
from typing import Optional
import azure.functions as func
import logging
from time import time
import db 
import uuid
from ai_service import ai_gen_exercises
from validation import err, get_validation_error

def ok(data: dict, *, created_url: Optional[str] = None) -> func.HttpResponse:
    ''' Builds json response for 200 and 201 '''
    resp = func.HttpResponse(json.dumps({**data, "ok": True}), status_code=200 if created_url is None else 201, mimetype="application/json")
    if created_url is not None:
        resp.headers['Location'] = created_url
    return resp

#TODO: validation for all funcs: json schema and OpenAPI 3.1

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)

def process_entity(entity):
    ''' Removes sensitive db info'''
    return {k:v for k, v in entity.items() if not k.startswith("_")}    

start_session_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type":"string", "maxLength": 255},
    },
    "minProperties": 1,
    "additionalProperties": False    
}
@app.route(route="session", methods=["POST"])
@app.cosmos_db_output(arg_name="doc", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", container_name="sessions")
def start_session(req: func.HttpRequest, doc: func.Out[func.Document]) -> func.HttpResponse:
    ''' Creates new session for gpt-parsons, req contains configuration json '''
    try:
        session_details = req.get_json()       
        #TODO: validate user input data 
        error = get_validation_error(session_details, start_session_SCHEMA)
        if error is not None:
            return error 
        session_id = str(uuid.uuid4())     
        validated_session = {"id":session_id, "type": "default", "name": session_details["name"]}
        norm_url = req.url.strip("/")
        session_doc = func.Document.from_dict(validated_session)
        doc.set(session_doc) #add new session to DB
        logging.info(f'[session] {session_id} started with {session_details}')
        return ok({"sid": session_id}, created_url=f"{norm_url}/{session_id}")
    except Exception as e:
        logging.error(f"[start_session] {e}")
        return err("InternalServerError", str(e), status=500)
    
@app.route(route="session/{id:guid}", methods=["GET"])
@app.cosmos_db_input(arg_name="docs", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", 
                        container_name="test_sessions", id="{id}", partition_key="default")
def get_session(req: func.HttpRequest, docs: func.DocumentList) -> func.HttpResponse:
    doc: func.Document = docs[0]
    session_data = doc.to_dict()
    return ok({"id": session_data["id"], "name": session_data["name"]})

@app.route(route="exercise-creation/{id:guid?}", methods=["GET"])
def get_active_exercise_creation(req: func.HttpRequest):
    running_operation = db.db_exercise_creation_process(req.route_params.get("id", None))
    if running_operation is None:
        return ok({})
    return ok({"data": process_entity(running_operation)})

create_exercises_SCHEMA = {
    "type": "object",
    "properties": {
        "language": {"type":"string", "enum": ["Python"]},
        "topic": {"type":"string", "maxLength": 255},
        "form": {"type":"string", "maxLength": 255},
        "level": {"type":"string",  "enum": ["Beginner", "Intermediate", "Advanced"]},
        "num": {"type":"integer", "minimum":1, "maximum":10}
    },
    "minProperties": 5,
    "additionalProperties": False
}
@app.route(route="exercise-creation", methods=["POST"])
def create_exercises(req: func.HttpRequest):
    running_operation = None
    try:
        creation_params = req.get_json()
        error = get_validation_error(creation_params, create_exercises_SCHEMA)
        if error is not None: 
            return error 
        
        creation_params["numBugs"] = 1

        #TODO: atomicity of this
        running_operation, is_fresh = db.db_create_exercise_creation_process(creation_params)
        if not is_fresh:
            logging.warn(f"[create_exercise] Found running {running_operation}")        
            return err("Busy", "Creation operation is in progress", data = {"data": process_entity(running_operation)})
        logging.info(f"[create_exercise] Creating new running operation")

    except Exception as e:        
        logging.error(f"[create_exercise] {e}")
        if running_operation is not None: 
            try:
                running_operation["active"] = False 
                running_operation["end_ts"] = int(time())
                running_operation["duration"] = running_operation["end_ts"] - running_operation["start_ts"]
                running_operation["error"] = f"{e}"
                db.db_upsert_exercise_creation_process(running_operation)
            except Exception as e2:
                logging.error(f"[create_exercise] ERROR2 {e2}")
        return err("InternalServerError", str(e), status=500)        

    key = req.headers.get("x-functions-key")
    res_data = process_entity(running_operation)
    bgt = Thread(target=lambda: ai_gen_exercises(creation_params, running_operation, key), daemon=False)
    bgt.start()

    norm_url = req.url.strip("/")
    run_id = running_operation["id"]
    return ok({"data": res_data}, created_url=f"{norm_url}/{run_id}")

#Following triggers are async processing of exercises
#Async flow is triggered either by admin or timer Azure function

# @app.cosmos_db_trigger(arg_name="docs", connection="CosmosDbConnectionString", database_name="gpt-parsons-db",
#                         container_name="exercise_raw", lease_container_name="exercise_raw_leases", create_lease_container_if_not_exists=True)
# @app.cosmos_db_output(arg_name="out_doc", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", container_name="parsons_exercise")
# def prepare_exercise(docs: func.DocumentList, out_doc:func.Out[func.Document]):
#     ''' Process GPT output and forms fragments. Exercises are stored for later uses by session '''
#     for doc in docs:
#         ex = doc.to_dict()
#         ex_id = ex['id']
#         correct = ex["code"]
#         bugged = ex["bugged"]
#         # alignment = best_alignment(correct, bugged)
        
#         # Example: correct: a b c d, bugged: a c d (no distractor)
#         #                  set { a b c d } 
#         # fragments: [a, b, c, d] distractors [X]. OR [ab, c, d] distractors: [x] OR [ab, cd] distractors: [xd]

        

#         # TODO 1: finish minimal fragmentation impl based on the alignment 
#         # TODO 2: fetch instructor settings of desired number of fragments and split some fragments further

#         output = {"fragments": [], "distractors": []}
#         out_doc.set(func.Document.from_dict(output)) #output to parsons_exercise
#         logging.info(f"Processed ex: {ex_id}")