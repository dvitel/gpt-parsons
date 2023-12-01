import os
import azure.functions as func
import logging
from time import time
from uuid import uuid4
import azure.functions as func
from jsonschema import ValidationError
import requests
from db import db_create_exercise_raw, db_upsert_exercise_creation_process
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
                        container_name="exercise_creation", sql_query="SELECT * FROM exercise_creation c WHERE c.active=true OFFSET 0 LIMIT 1")
@app.cosmos_db_output(arg_name="newProcess", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", container_name="exercise_creation")
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
def create_exercises(req: func.HttpRequest, activeProcess: func.DocumentList, newProcess: func.Out[func.Document]) -> func.HttpResponse:
    running_operation = next(iter(activeProcess), None)
    if running_operation is not None:
        result_data = process_entity(running_operation)
        logging.warn(f"[create_exercise] Found running {result_data}")   
        raise ValidationError("Creation operation is in progress")

    running_operation = {"id": str(uuid4()), "active": True, "start_ts": int(time()), "numBugs": 1, **req.get_json()}
    running_operation["avoid"] = [vt for v in running_operation.get("avoid", "").split(",") for vt in [v.strip()] if vt != ""]
    logging.info(f"[create_exercise] Creating {running_operation}.") 
    newProcess.set(func.Document.from_dict(running_operation))
    return running_operation

#NOTE: at initialization these env variables are not present - should fetch them at runtime
def ai_url():
    return os.environ["AI_URL"]

def ai_key():
    return os.environ["AI_KEY"]

@app.cosmos_db_trigger(arg_name="procs", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", 
                        container_name="exercise_creation", lease_container_name="exercise_creation_lease", 
                        create_lease_container_if_not_exists=True)
def on_create_exercises(procs: func.DocumentList):
    for running_process in procs:
        running_operation = process_entity(running_process)
        if "logs" in running_operation or not running_operation["active"]:
            return #trigger is due to update
        try:
            logs = []
            running_operation["log"] = logs
            for i in range(running_operation.get("num")):
                i_res = {"i_start_ts": int(time())} 
                logs.append(i_res)
                db_upsert_exercise_creation_process(running_operation)
                try:
                    resp = requests.post(ai_url(), json={**running_operation, "key": ai_key()})
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
                db_upsert_exercise_creation_process(running_operation)            
            running_operation["active"] = False 
            running_operation["end_ts"] = int(time())
            db_upsert_exercise_creation_process(running_operation)
        except Exception as e:
            logging.error(f"[on_create_exercises] {e}")
            if running_operation is not None: 
                try:
                    running_operation["active"] = False 
                    running_operation["end_ts"] = int(time())
                    running_operation["duration"] = running_operation["end_ts"] - running_operation["start_ts"]
                    running_operation["error"] = f"{e}"
                    db_upsert_exercise_creation_process(running_operation)
                except Exception as e2:
                    logging.error(f"[on_create_exercises] ERROR2 {e2}")


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


@app.route(route="python-exercise/{id:guid}", methods=["PUT"])
def validate_python_exercise(req: func.HttpRequest):
    ''' Validate exercise after manual investigation or discard the exercise'''
    ex_raw = process_entity(ex)
    #1. compile code 
    correct_code = None 
    try:
        code = ex_raw["code"]
        tests = ex_raw["tests"]
        wholeCorrect = code + "\n\n" + tests
        correct_code = compile(wholeCorrect, 'multiline', 'exec')            
    except Exception as e:
        ex_raw["error"] = {"error":"SyntaxError","message":str(e)}
    #2. run generated tests
    if correct_code is not None:
        try:
            exec(correct_code)
        except Exception as e:
            ex_raw["error"] = {"error":"TestError","message":str(e)}
    ex_raw["validated_ts"] = int(time())
    ex_raw["valid"] = "error" not in ex_raw
    valid.set(func.Document.from_dict(ex_raw))


@app.cosmos_db_trigger(arg_name="exercise", connection="CosmosDbConnectionString", database_name="gpt-parsons-db",
                        container_name="python_exercise_raw", lease_container_name="python_exercise_raw_lease", create_lease_container_if_not_exists=True)
@app.cosmos_db_output(arg_name="valid", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", container_name="python_exercise_valid")
def fragment_python_exercise(exercise: func.DocumentList, valid: func.Out[func.Document]):
    ''' Cosmos db Trigger that validates raw exercises dependign of settings '''
    for ex in exercise:
        ex_raw = process_entity(ex)
        #1. compile code 
        correct_code = None 
        try:
            code = ex_raw["code"]
            tests = ex_raw["tests"]
            wholeCorrect = code + "\n\n" + tests
            correct_code = compile(wholeCorrect, 'multiline', 'exec')            
        except Exception as e:
            ex_raw["error"] = {"error":"SyntaxError","message":str(e)}
        #2. run generated tests
        if correct_code is not None:
            try:
                exec(correct_code)
            except Exception as e:
                ex_raw["error"] = {"error":"TestError","message":str(e)}
        ex_raw["validated_ts"] = int(time())
        ex_raw["valid"] = "error" not in ex_raw
        valid.set(func.Document.from_dict(ex_raw))        