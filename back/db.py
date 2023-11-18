from time import time
from azure.cosmos import CosmosClient
import uuid
import os

def cosmos_endpoint():
    return os.environ["COSMOS_ENDPOINT"]
def cosmos_key():
    return os.environ["COSMOS_KEY"]

def db_container(name:str): 
    client = CosmosClient(url=cosmos_endpoint(), credential=cosmos_key())
    db = client.get_database_client(database="gpt-parsons-db")
    container = db.get_container_client(container=name)    
    return container

def db_create_exercise_raw(creation_params, exercise_raw):
    container = db_container("exercise_raw")
    exercise_id = str(uuid.uuid4())
    exercise_raw = {"id": exercise_id, **creation_params, **exercise_raw}
    container.create_item(exercise_raw)
    return exercise_raw

def db_create_exercise_creation_process(creation_params):
    container = db_container("exercise_creation")
    running_operation = next(container.query_items('SELECT * FROM exercise_creation c WHERE c.active = true', enable_cross_partition_query=True), None)
    if running_operation is not None: 
        return running_operation, False #running is not fresh
    else:
        run_id = str(uuid.uuid4())
        running_operation = {"id": run_id, "active": True, "start_ts": int(time()), **creation_params}  
        container.create_item(running_operation)
        return running_operation, True
    
def db_exercise_creation_process(op_id):
    container = db_container("exercise_creation")
    if op_id is None: #return last operation
        running_operation = next(container.query_items('SELECT * FROM exercise_creation c ORDER BY c.start_ts DESC OFFSET 0 LIMIT 1', enable_cross_partition_query=True), None)
    else:
        running_operation = next(container.query_items('SELECT * FROM exercise_creation c WHERE c.id = @id', 
                                                        parameters=[ {"name": "@id", "value": op_id} ], enable_cross_partition_query=True), None)
    return running_operation 
    
def db_upsert_exercise_creation_process(running_operation):
    container = db_container("exercise_creation")        
    container.upsert_item(running_operation)
