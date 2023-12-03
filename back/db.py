from time import time
from azure.cosmos import CosmosClient
import uuid
import os

def cosmos_endpoint():
    return os.environ["COSMOS_ENDPOINT"]
def cosmos_key():
    return os.environ["COSMOS_KEY"]

def db_container(name:str, create_if_not_exists=False, partition_key = None): 
    client = CosmosClient(url=cosmos_endpoint(), credential=cosmos_key())
    db = client.get_database_client(database="gpt-parsons-db")
    if create_if_not_exists:
        container = db.create_container_if_not_exists(name, partition_key=partition_key)
    else:
        container = db.get_container_client(container=name)    
    return container

def db_delete_exercise_creation(operation):
    container = db_container(f"exercise_creation")
    try:
        container.delete_item(operation["id"], operation["settings"]["domain"])
        return True
    except Exception: #ignore error if key is absent
        return False 
    
def db_delete_exercise_creation_active(operation):
    container = db_container(f"exercise_creation_active")
    try:
        container.delete_item(operation["id"], operation["id"])
        return True
    except Exception: #ignore error if key is absent
        return False     
    
def db_delete_exercise(ex):
    container = db_container(f"exercise")
    try:
        container.delete_item(ex["id"], ex["settings"]["domain"])
        return True
    except Exception: #ignore error if key is absent
        return False    

def db_create_exercise_raw(running_operation, exercise_raw):
    container = db_container(f"exercise")
    exercise_id = str(uuid.uuid4())
    exercise_raw = {"id": exercise_id, "pid": running_operation["id"], "status":"raw", "settings":running_operation["settings"], 
                        "creation_ts": int(time()), "gen":exercise_raw}
    container.create_item(exercise_raw)
    return exercise_raw

def db_save_exercise(exercise):
    container = db_container(f"exercise")
    container.upsert_item(exercise)
    
def db_get_exercise_creation(op_id):
    container = db_container("exercise_creation")
    running_operation = next(container.query_items('SELECT * FROM exercise_creation c WHERE c.id = @id', 
                                                    parameters=[ {"name": "@id", "value": op_id} ], enable_cross_partition_query=True), None)
    return running_operation
    
def db_upsert_exercise_creation_process(running_operation):
    container = db_container("exercise_creation")        
    container.upsert_item(running_operation)
