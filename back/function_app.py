import os
import random
import azure.functions as func
import logging
from time import time
from uuid import uuid4
import azure.functions as func
from jsonschema import ValidationError
import requests
from db import db_create_exercise_raw, db_delete_exercise, db_delete_exercise_creation, db_delete_exercise_creation_active, db_get_exercise, db_get_exercise_creation, db_get_puzzle_for_session, db_get_session, db_save_exercise, db_upsert_exercise, db_upsert_exercise_creation_process, db_upsert_session
from utils import http_ok, http_err, process_entity
import ast

from validation import log_err, validate_as_json

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)

def get_puzzle_for_session(domain, last_puzzle_id):
    session_update = db_get_puzzle_for_session(domain, last_puzzle_id)
    puzzle = session_update["puzzle"]
    if puzzle["shuffled"]:
        all_fragments = [*puzzle.get("fragments", []), *puzzle.get("distractors", [])]
        random.shuffle(all_fragments)
        split_point = random.randint(0, len(all_fragments) - 1)
        puzzle["fragments"] = all_fragments[:split_point]
        puzzle["distractors"] = all_fragments[split_point:]
    return session_update

@app.route(route="session", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
@app.cosmos_db_output(arg_name="doc", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", container_name="session")
@validate_as_json(input_schema={
    "type": "object",
    "properties": {
        "domain": {"type":"string", "enum": ["python","history","chain"]},
        "prevSessionId": {"type":"string", "maxLength": 36}
    },
    "required": ["domain"],
    "additionalProperties": False    
})
def start_session(req: func.HttpRequest, doc: func.Out[func.Document]) -> func.HttpResponse:
    ''' Creates new session for gpt-parsons, req contains configuration json '''    
    req_data = req.get_json()
    domain = req_data["domain"]
    prev_session_id = req_data.get("prevSessionId", None)
    prev_session = None 
    session = None 
    last_puzzle_id = 0
    if prev_session_id is not None:
        prev_session = db_get_session(prev_session_id, domain)
        if prev_session is not None:
            last_puzzle_id = prev_session.get("last_puzzle_id", 0)            
            if prev_session.get("solved", 0) > 0: #solved puzzles 
                prev_session["end_ts"] = int(time())            
                db_upsert_session(prev_session)
            else: 
                del prev_session["puzzle"]
                session = prev_session
                session["stats"] = {}
                session["start_ts"] = int(time())
    if session is None: 
        session = {"id":str(uuid4()), "domain":domain, "start_ts": int(time()) }
    if "puzzle" not in session: #we need to select new puzzle 
        session_update = get_puzzle_for_session(domain, last_puzzle_id)
        session.update(**session_update)
    doc.set(func.Document.from_dict(session))
    logging.info(f'[session] started {session}')
    return session

@app.route(route="session/{id:guid}", methods=["PUT"], auth_level=func.AuthLevel.ANONYMOUS)
@app.cosmos_db_input(arg_name="sessions", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", 
                        container_name="session", sql_query="SELECT * FROM session c WHERE c.id={id}")
@app.cosmos_db_output(arg_name="updated", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", container_name="session")
@validate_as_json(input_schema={
    "type": "object",
    "properties": {
        "fragments": {"type": "array", "items": {"type": "string", "maxLength": 1000}, "maxItems": 100},
        "skip": {"type": "boolean"},
        "stats": {"type":"object",
                  "properties": {
                    "moves": {"type": "integer", "minimum": 0}
                  }}
    },
    "minProperties": 3,
    "additionalProperties": False    
}, outputs_404=True)
def update_session(req: func.HttpRequest, sessions: func.DocumentList, updated: func.Out[func.Document]) -> func.HttpResponse:
    ''' Submits or skips puzzle and get new one '''
    req_data = req.get_json()    
    session = sessions[0].to_dict()
    puzzle = session["puzzle"]
    puzzle_id = puzzle["id"]
    ex = db_get_exercise(puzzle_id)    
    if ex is None: 
        return {"reset": True}
    ex_stats = ex.setdefault("stats", {})    
    skip = req_data["skip"]
    puzzle_stats = req_data.get("stats", {})
    resp = {}
    last_puzzle_id = session.get("last_puzzle_id", 0)
    domain = session["domain"]
    if skip:
        skipped_ids = set(session.get("skipped_ids", []))
        skipped_ids.add(puzzle_id)
        session["skipped"] = session.get("skipped", 0) + 1
        session["skipped_ids"] = list(skipped_ids)
        ex_stats["skipped"] = ex_stats.get("skipped", 0) + 1
        session_update = get_puzzle_for_session(domain, last_puzzle_id)
        resp["solved"] = False
        resp["puzzle"] = session_update["puzzle"]
        session.update(**session_update)
    else:
        session["moves"] = session.get("moves", 0) + puzzle_stats.get("moves", 0)
        ex_stats["moves"] = ex_stats.get("moves", 0) + puzzle_stats.get("moves", 0)
        proposed = req_data["fragments"]
        solution = ex["fragmentation"]["fragments"]
        #first check is to compare fragments from ex to proposed fragments 
        if len(proposed) != len(solution) or any(a != b for (a, b) in zip(proposed, solution)):
            session["error"] = session.get("error", 0) + 1
            ex_stats["error"] = ex_stats.get("error", 0) + 1

            #TODO: domain specific checks

            resp["solved"] = False
            if "explain" in ex["gen"]:
                resp["hint"] = ex["gen"]["explain"]    
        else: #correct  
            solved_ids = set(session.get("solved_ids", []))
            solved_ids.add(puzzle_id)
            session["solved"] = session.get("solved", 0) + 1
            session["solved_ids"] = list(solved_ids)
            ex_stats["solved"] = ex_stats.get("solved", 0) + 1            
            session_update = get_puzzle_for_session(domain, last_puzzle_id)
            resp["solved"] = True
            resp["puzzle"] = session_update["puzzle"]
            session.update(**session_update)

    db_upsert_exercise(ex)
    updated.set(func.Document.from_dict(session))
    return resp


@app.route(route="session/{id:guid}", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
@app.cosmos_db_input(arg_name="sessions", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", 
                        container_name="session", sql_query="SELECT * FROM session c WHERE c.id={id}")
@validate_as_json(outputs_404=True)
def get_session(req: func.HttpRequest, sessions: func.DocumentList) -> func.HttpResponse:
    s = sessions[0].to_dict()
    return {"id":s["id"], "puzzle":s["puzzle"]}

@app.route(route="session", methods=["GET"])
@app.cosmos_db_input(arg_name="sessions", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", 
                        container_name="session", sql_query="SELECT * FROM session c")
@validate_as_json()
def get_sessions(req: func.HttpRequest, sessions: func.DocumentList) -> func.HttpResponse:
    return sessions

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
        "complexity": {"type":"integer", "minimum":0, "maximum":30},
        "numErrors": {"type":"integer", "minimum":0, "maximum":5},
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

def fetch_top_level_names(code):
    try:
        mod = ast.parse(code)
        return [el.name for el in mod.body if hasattr(el, "name")]
    except: 
        return []

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
            glob_avoid = [*settings.get("avoid", [])]
            for i in range(settings["num"]):
                i_res = {"i_start_ts": int(time()),"avoid":list(glob_avoid)} 
                logs.append(i_res)
                db_upsert_exercise_creation_process(running_operation)
                local_settings = {**settings, "avoid": list(glob_avoid)}
                try:
                    resp = requests.post(ai_url(), json={**local_settings, "key": ai_key()}, timeout=40)
                except Exception as e:
                    logging.error(f"[on_create_exercises] Creation {i} error: cannot connect to AI service {e}")
                    i_res.update({"error":type(e).__name__, "message": str(e)})
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
                            elif "error" in generated["gen"]:
                                i_res.update({"error":generated["gen"]["error"], "message": generated["gen"].get("message", "")})
                            else:
                                if "code" in generated["gen"] and settings["domain"] == "python":
                                    new_names = fetch_top_level_names(generated["gen"]["code"])
                                    glob_avoid.extend(new_names)
                                exercise_raw = db_create_exercise_raw(running_operation, local_settings, generated["gen"])
                                i_res.update({"ok":True,"exercise_id": exercise_raw["id"]})
                        except Exception as e: 
                            message = f"{type(e).__name__} {str(e)}"
                            logging.error(f"[on_create_exercises] Creation {i} error: {message}")
                            i_res.update({"error":type(e).__name__, "message": str(e)})
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


@app.route(route="exercise", methods=["GET"])
@app.cosmos_db_input(arg_name="exercises", connection="CosmosDbConnectionString", database_name="gpt-parsons-db",
                        container_name="exercise", sql_query="SELECT * FROM exercise c ORDER BY c.creation_ts DESC")
@app.cosmos_db_input(arg_name="puzzles", connection="CosmosDbConnectionString", database_name="gpt-parsons-db",
                        container_name="puzzle", sql_query="SELECT c.id, c.enabled FROM puzzle c")
@validate_as_json()
def get_exercises(req: func.HttpRequest, exercises: func.DocumentList, puzzles: func.DocumentList) -> func.HttpResponse:
    puzzle_enabled = {d["id"]:d["enabled"] for puzzle in puzzles for d in [puzzle.to_dict()]}
    exs = [{**e,"puzzle":{"enabled":puzzle_enabled[e["id"]]}} if e["id"] in puzzle_enabled else e for ex in exercises for e in [ex.to_dict()]]
    return exs

@app.route(route="exercise/{id:guid}", methods=["GET"])
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
    gen = req.get_json() #update generated
    doc["gen"] = gen
    logging.info(f"[update_programming_exercise] Update {doc}") 
    doc["update_ts"] = int(time())
    # db_save_exercise(doc)
    validation = { "is_valid": True, "validated_ts": int(time()) } #starts validation here 
    if doc["settings"]["domain"] == "python": #validate python just here - could be bad 
        #1. compile code 
        code = gen["code"]
        tests = gen.get("tests", "").split(os.linesep) #one by one tests
        # try:            
        #     correct_code = compile(full_code, 'multiline', 'exec')  
        #     validation["compile"] = True
        # except Exception as e:            
        #     validation["compile"] = False
        #     validation["error"] = "SyntaxError"
        #     validation["message"] = str(e)
        #     correct_code = None
        # #2. run generated tests
        current_test = ""
        tests_passed = 0
        try:
            for test in tests:
                current_test = test
                glob = {}
                full_code = f"{code}{os.linesep}{test}"
                exec(full_code, glob)
                tests_passed += 1
        except Exception as e:
            validation["error"] = type(e).__name__
            validation["test"] = current_test
            validation["message"] = str(e)
        validation["validated_ts"] = int(time())
        validation["is_valid"] = "error" not in validation
        validation["tests_passed"] = tests_passed
    doc["validation"] = validation
    doc["status"] = "validated" if validation["is_valid"] else "error"
    
    fragmentation = {}
    if validation["is_valid"]:        
        logging.info(f"[fragmentation] starts")
        fragments = gen["code"].splitlines()
        fragments_set = set(fragments)
        bugged = gen["incorrect"].splitlines()
        bugged_fragments = [f for f in bugged if f not in fragments_set]
        fragmentation["fragments"] = fragments
        fragmentation["distractors"] = bugged_fragments
        doc["fragmentation"] = fragmentation
    logging.info(f"[update_programming_exercise] Saving...") 
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

@app.route(route="puzzle/{id:guid}", methods=["POST"])
@app.cosmos_db_input(arg_name="ex", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", 
                        container_name="exercise", sql_query="SELECT * FROM exercise c WHERE c.id={id}")
@app.cosmos_db_output(arg_name="puzzles", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", container_name="puzzle")
@app.cosmos_db_output(arg_name="exs", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", container_name="exercise")
@validate_as_json(input_schema={
    "type": "object",
    "properties": {
        "domain": {"type":"string", "enum": ["python","history","chain"]},
        "task": {"type":"string", "maxLength": 1024},
        "fragments": {"type": "array", "items": {"type": "string", "maxLength": 1000}, "maxItems": 100},
        "distractors": {"type": "array", "items": {"type": "string", "maxLength": 1000}, "maxItems": 100},
        "shuffled": {"type":"boolean"},
        "enabled": {"type":"boolean"}
    },
    "minProperties": 6,
    "additionalProperties": False    
})
def upsert_puzzle(req: func.HttpRequest, ex: func.DocumentList, puzzles: func.Out[func.Document], exs: func.Out[func.Document]) -> func.HttpResponse:
    puzzle = {"id":req.route_params["id"],**req.get_json()}
    ex0 = process_entity(ex[0])
    ex0["status"] = "approved"
    ex0["update_ts"] = int(time())
    puzzles.set(func.Document.from_dict(puzzle))
    exs.set(func.Document.from_dict(ex0))
    logging.info(f'[puzzle] {puzzle}')
    return puzzle

@app.route(route="puzzle/{id:guid}", methods=["GET"])
@app.cosmos_db_input(arg_name="ex", connection="CosmosDbConnectionString", database_name="gpt-parsons-db", 
                        container_name="puzzle", sql_query="SELECT * FROM puzzle c WHERE c.id={id}")
@validate_as_json(outputs_404=True)
def get_puzzle(req: func.HttpRequest, ex: func.DocumentList) -> func.HttpResponse:
    return ex[0]