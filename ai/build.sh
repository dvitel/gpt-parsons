#!/bin/bash 
#collectingn dist folder of the flow 
pf flow build --source puzzle --output dist --format docker
#build docker img
docker build dist -t gpt-parsons-gen
#use next to run locally 
# docker run -p 8080:8080 -e PROD-CONN_API_KEY=<key> gpt-parsons-gen
#use next to test local endpoint
# curl -X POST -d '{"language": "Python", "level":"Advanced", "topic":"Recursion", "form":"Python function", "numBugs":1}' http://localhost:8080/score