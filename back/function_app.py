import os
import azure.functions as func
import logging
from time import time
from uuid import uuid4
import azure.functions as func
from jsonschema import ValidationError
import requests
from db import db_create_exercise_raw, db_delete_exercise, db_delete_exercise_creation, db_delete_exercise_creation_active, db_get_exercise_creation, db_save_exercise, db_upsert_exercise_creation_process
from utils import http_ok, http_err, process_entity
import ast

from validation import log_err, validate_as_json

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)


@app.route(route="session", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
@app.cosmos_db_output(arg_name="doc", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", container_name="session")
@validate_as_json(input_schema={
    "type": "object",
    "properties": {
        "name": {"type":"string", "maxLength": 255},
    },
    "minProperties": 1,
    "additionalProperties": False    
})
def start_session(req: func.HttpRequest, doc: func.Out[func.Document]) -> func.HttpResponse:
    ''' Creates new session for gpt-parsons, req contains configuration json '''
    session = {"id":str(uuid4()), "type": "default", **req.get_json()}
    doc.set(func.Document.from_dict(session))
    logging.info(f'[session] started {session}')
    return session


@app.route(route="session/{id:guid}", methods=["GET"])
@app.cosmos_db_input(arg_name="sessions", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", 
                        container_name="test_sessions", id="{id}", partition_key="default")
@validate_as_json(outputs_404=True)
def get_session(req: func.HttpRequest, sessions: func.DocumentList) -> func.HttpResponse:
    return sessions[0]


@app.route(route="exercise-creation", methods=["GET"])
@app.cosmos_db_input(arg_name="ops", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", 
                        container_name="exercise_creation", sql_query="SELECT * FROM exercise_creation c ORDER BY c.start_ts DESC")
@validate_as_json(outputs_404=False)
def get_operations(req: func.HttpRequest, ops: func.DocumentList) -> func.HttpResponse:
    return ops

@app.route(route="exercise-creation/{id:guid}", methods=["GET"])
@app.cosmos_db_input(arg_name="ops", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", 
                        container_name="exercise_creation", sql_query="SELECT * FROM exercise_creation c WHERE c.id={id}")
@validate_as_json(outputs_404=True)
def get_operation(req: func.HttpRequest, ops: func.DocumentList) -> func.HttpResponse:
    return ops[0]

@app.route(route="exercise-creation", methods=["POST"])
@app.cosmos_db_input(arg_name="activeProcess", connection="CosmosDbConnectionString", database_name="gpt-parsons-db",
                        container_name="exercise_creation", sql_query="SELECT * FROM exercise_creation c WHERE c.status='active' OFFSET 0 LIMIT 1")
@app.cosmos_db_output(arg_name="newProcess", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", container_name="exercise_creation")
@app.cosmos_db_output(arg_name="newActiveProcess", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", container_name="exercise_creation_active")
@validate_as_json(input_schema={
    "type": "object",
    "properties": {
        "domain": {"type":"string", "enum": ["python","history","chain"]},
        "topic": {"type":"string", "maxLength": 255},
        "form": {"type":"string", "maxLength": 255},
        "level": {"type":"string",  "enum": ["Beginner", "Intermediate", "Advanced"]},
        "num": {"type":"integer", "minimum":1, "maximum":10},
        "complexity": {"type":"integer", "minimum":0, "maximum":10},
        "numErrors": {"type":"integer", "minimum":0, "maximum":10},
        "avoid": {"type":"string", "maxLength": 255}
    },
    "minProperties": 8,
    "additionalProperties": False
})
def start_operation(req: func.HttpRequest, activeProcess: func.DocumentList, newProcess: func.Out[func.Document], newActiveProcess: func.Out[func.Document]) -> func.HttpResponse:
    running_operation = next(iter(activeProcess), None)
    if running_operation is not None:
        result_data = process_entity(running_operation)
        logging.warn(f"[start_operation] Found running {result_data}")   
        raise ValidationError("Other operation is in progress")

    settings = {**req.get_json()}
    settings["avoid"] = [vt for v in settings.get("avoid", "").split(",") for vt in [v.strip()] if vt != ""]
    running_operation = {"id": str(uuid4()), "status": 'active', "start_ts": int(time()), "settings": settings}    
    logging.info(f"[start_operation] Creating {running_operation}.") 
    newProcess.set(func.Document.from_dict(running_operation))
    newActiveProcess.set(func.Document.from_dict({"id": running_operation["id"]}))
    return running_operation

@app.route(route="exercise-creation/{id:guid}", methods=["DELETE"])
@app.cosmos_db_input(arg_name="process", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", 
                        container_name="exercise_creation", sql_query="SELECT * FROM exercise_creation c WHERE c.id={id}")
@validate_as_json(outputs_404=True)
def delete_operation(req: func.HttpRequest, process: func.DocumentList) -> func.HttpResponse:
    doc = process[0].to_dict()    
    logging.info(f"[delete_operation] Deleting {doc}") 
    was_deleted = db_delete_exercise_creation(doc)
    return {"id":doc["id"], "deleted": was_deleted}

@app.route(route="exercise-creation/{id:guid}", methods=["PUT"])
@app.cosmos_db_input(arg_name="process", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", 
                        container_name="exercise_creation", sql_query="SELECT * FROM exercise_creation c WHERE c.id={id}")
@app.cosmos_db_output(arg_name="updatedProcess", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", container_name="exercise_creation")
@validate_as_json(input_schema={
    "type": "object",
    "properties": {
        "status": {"type":"string", "enum": ["done"]},
    },
    "required": ["status"],
    "additionalProperties": False
}, outputs_404=True)
def update_operation(req: func.HttpRequest, process: func.DocumentList, updatedProcess: func.Out[func.Document]) -> func.HttpResponse:
    doc = process[0].to_dict()
    status = req.get_json()["status"]
    doc["status"] = status
    if status == "done" and "end_ts" not in doc:
        doc["end_ts"] = int(time())
    logging.info(f"[update_operation] Updating {doc}") 
    updatedProcess.set(func.Document.from_dict(doc))
    return doc

#NOTE: at initialization these env variables are not present - should fetch them at runtime
def ai_url():
    return os.environ["AI_URL"]

def ai_key():
    return os.environ["AI_KEY"]

@app.cosmos_db_trigger(arg_name="procs", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", 
                        container_name="exercise_creation_active", lease_container_name="exercise_creation_active_lease", 
                        create_lease_container_if_not_exists=True)
def on_create_exercises(procs: func.DocumentList):
    for running_process in procs:
        active_creation_process = process_entity(running_process)
        running_operation = process_entity(db_get_exercise_creation(active_creation_process["id"]))
        try:
            logs = []
            running_operation["log"] = logs
            settings = running_operation["settings"]
            for i in range(settings["num"]):
                i_res = {"i_start_ts": int(time())} 
                logs.append(i_res)
                db_upsert_exercise_creation_process(running_operation)
                try:
                    resp = requests.post(ai_url(), json={**settings, "key": ai_key()}, timeout=40)
                except Exception as e:
                    logging.error(f"[on_create_exercises] Creation {i} error: cannot connect to AI service {e}")
                    i_res.update({"error":"Conn", "message": f"cannot connect to AI service"})
                if "error" not in i_res and resp: 
                    if not resp.ok:                 
                        logging.error(f"[on_create_exercises] Creation {i} error: {resp.status_code} {resp.text}")
                        i_res.update({"error":"Http", "message": f"AI service returned {resp.status_code}"})
                    else:
                        try:       
                            generated = resp.json()   
                            if "gen" not in generated: 
                                logging.error(f"[on_create_exercises] Creation {i} error: no 'gen' in the response: {generated}")
                                i_res.update({"error":"Format", "message": f"AI service does not return gen field"})
                            else:
                                exercise_raw = db_create_exercise_raw(running_operation, generated["gen"])
                                i_res.update({"ok":True,"exercise_id": exercise_raw["id"]})
                        except Exception as e: 
                            logging.error(f"[on_create_exercises] Creation {i} error: cannot parse json")
                            i_res.update({"error":"Format", "message": f"AI service does not return json"})
                i_res["i_end_ts"] = int(time())         
                if i == settings["num"] - 1:
                    running_operation["status"] = "done"
                    running_operation["end_ts"] = int(time())
                db_upsert_exercise_creation_process(running_operation)
        except Exception as e:
            logging.error(f"[on_create_exercises] {e}")
            if running_operation is not None: 
                try:
                    running_operation["status"] = "error"
                    running_operation["end_ts"] = int(time())
                    running_operation["error"] = f"{e}"
                    db_upsert_exercise_creation_process(running_operation)
                except Exception as e2:
                    logging.error(f"[on_create_exercises] ERROR2 {e2}")
        db_delete_exercise_creation_active(active_creation_process)


@app.route(route="exercise", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
@app.cosmos_db_input(arg_name="exercises", connection="CosmosDbConnectionString", database_name="gpt-parsons-db",
                        container_name="exercise", sql_query="SELECT * FROM exercise c ORDER BY c.creation_ts DESC")
@validate_as_json()
def get_exercises(req: func.HttpRequest, exercises: func.DocumentList) -> func.HttpResponse:
    return exercises

@app.route(route="exercise/{id:guid}", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
@app.cosmos_db_input(arg_name="exercises", connection="CosmosDbConnectionString", database_name="gpt-parsons-db",
                        container_name="exercise", sql_query="SELECT * FROM exercise c WHERE c.id={id}")
@validate_as_json(outputs_404=True)
def get_exercise(req: func.HttpRequest, exercises: func.DocumentList) -> func.HttpResponse:
    return exercises[0]

@app.route(route="exercise/{id:guid}/programming", methods=["PUT"])
@app.cosmos_db_input(arg_name="ex", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", 
                        container_name="exercise", sql_query="SELECT * FROM exercise c WHERE c.id={id}")
@validate_as_json(input_schema={
    "type": "object",
    "properties": {
        "task": {"type":"string", "maxLength": 1024},
        "code": {"type":"string", "maxLength": 2048},
        "tests": {"type":"string", "maxLength": 1024},
        "incorrect": {"type":"string", "maxLength": 2048},
        "explain": {"type":"string", "maxLength": 1024},
    },
    "minProperties": 5,
    "additionalProperties": False
}, outputs_404=True)
def update_programming_exercise(req: func.HttpRequest, ex: func.DocumentList) -> func.HttpResponse:
    doc = process_entity(ex[0])
    logging.info(f"[update_programming_exercise] Update {doc}") 
    gen = req.get_json() #update generated
    doc["gen"] = gen
    doc["update_ts"] = int(time)
    # db_save_exercise(doc)
    validation = { "is_valid": True, "validated_ts": int(time()) } #starts validation here 
    if doc["settings"]["domain"] == "python": #validate python just here - could be bad 
        #1. compile code 
        correct_code = None 
        try:
            code = gen["code"]
            tests = gen["tests"]
            wholeCorrect = code + "\n\n" + tests
            correct_code = compile(wholeCorrect, 'multiline', 'exec')  
            validation["compile"] = True
        except Exception as e:            
            validation["compile"] = False
            validation["error"] = "SyntaxError"
            validation["message"] = str(e)
        #2. run generated tests
        if correct_code is not None:
            try:
                exec(correct_code)
                validation["tests"] = True
            except Exception as e:
                validation["tests"] = False
                validation["error"] = "TestError"
                validation["message"] = str(e)
        validation["validated_ts"] = int(time())
        validation["is_valid"] = "error" not in validation
    doc["validation"] = validation
    
    fragmentation = {}
    if validation["is_valid"]:        
        fragments = gen["code"].splitlines()
        fragments_set = set(fragments)
        bugged = gen["incorrect"].splitlines()
        bugged_fragments = [f for f in bugged if f not in fragments_set]
        fragmentation["fragments":fragments, "distractors":bugged_fragments]
        doc["fragmentation"] = fragmentation
    db_save_exercise(doc)
    return doc

@app.route(route="exercise/{id:guid}", methods=["DELETE"])
@app.cosmos_db_input(arg_name="ex", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", 
                        container_name="exercise", sql_query="SELECT * FROM exercise c WHERE c.id={id}")
@validate_as_json(outputs_404=True)
def delete_exercise(req: func.HttpRequest, ex: func.DocumentList) -> func.HttpResponse:
    doc = ex[0].to_dict()    
    logging.info(f"[delete_exercise] Deleting {doc}") 
    was_deleted = db_delete_exercise(doc)
    return {"id":doc["id"], "deleted": was_deleted}