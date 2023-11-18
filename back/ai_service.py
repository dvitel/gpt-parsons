import logging
import os
import requests
from time import time
import db

#NOTE: at initialization these env variables are not present - should fetch them at runtime
def ai_url():
    return os.environ["AI_URL"]

def ai_key():
    return os.environ["AI_KEY"]

def ai_gen_exercises(creation_params, running_operation, key):    
    try:
        logs = []
        logging.info(f"[ai_gen_exercises] Input data is valid. New operation: {running_operation}. AI url: {ai_url()}")

        for i in range(running_operation.get("num")):
            i_start_ts = int(time())
            i_res = None 
            try:
                resp = requests.post(ai_url(), json={**creation_params, "key": key}, timeout=30)
            except Exception as e:
                logging.error(f"[ai_gen_exercises] Creation {i} error: cannot connect to AI service {e}")
                i_res = {"error":"Conn", "message": f"cannot connect to AI service"}
            if i_res is None: 
                if not resp.ok:                 
                    logging.error(f"[ai_gen_exercises] Creation {i} error: {resp.status_code} {resp.text}")
                    i_res = {"error":"Http", "message": f"AI service returned {resp.status_code}"}                
                else:
                    try:       
                        generated = resp.json()   
                        if "gen" not in generated: 
                            logging.error(f"[ai_gen_exercises] Creation {i} error: no 'gen' in the response: {generated}")
                            i_res = {"error":"Format", "message": f"AI service does not return gen field"}
                        else:
                            exercise_raw = db.db_create_exercise_raw(creation_params, generated["gen"])
                            i_res = {"ok":True,"exercise_id": exercise_raw["id"]}
                    except Exception as e: 
                        logging.error(f"[ai_gen_exercises] Creation {i} error: cannot parse json")
                        i_res = {"error":"Format", "message": f"AI service does not return json"}
            i_res["i_start_ts"] = i_start_ts
            i_res["i_end_ts"] = int(time())
            logs.append(i_res)
            db.db_upsert_exercise_creation_process(running_operation)
        running_operation["log"] = logs
        running_operation["active"] = False 
        running_operation["end_ts"] = int(time())
        running_operation["duration"] = running_operation["end_ts"] - running_operation["start_ts"]
        db.db_upsert_exercise_creation_process(running_operation)
    except Exception as e:
        logging.error(f"[ai_gen_exercises] {e}")
        if running_operation is not None: 
            try:
                running_operation["active"] = False 
                running_operation["end_ts"] = int(time())
                running_operation["duration"] = running_operation["end_ts"] - running_operation["start_ts"]
                running_operation["error"] = f"{e}"
                db.db_upsert_exercise_creation_process(running_operation)
            except Exception as e2:
                logging.error(f"[ai_gen_exercises] ERROR2 {e2}")