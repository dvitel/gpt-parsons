#!/bin/bash 

set -e

#collect dist folder of the flow 
pf flow build --source puzzle --output dist --format docker

#----------------------------------------------------
#NOTE: next is for local docker build and testing

#build docker img
# docker build dist -t gpt-parsons-gen

#use next to run locally 
# docker run -p 8080:8080 -e PROD_CONN_API_KEY=<key> gpt-parsons-gen

#use next to test local endpoint
# curl -X POST -d '{"language": "Python", "level":"Advanced", "topic":"Recursion", "form":"Python function", "numBugs":1}' http://localhost:8080/score

#----------------------------------------------------
#NOTE: deploy to Azure App - Azure for Students subs
# bash deploy.sh --path dist -i gpt-parsons-gen:latest --name gpt-parsons-source -r ebc6ac4765644419945247daba13c00c.azurecr.io -g gpt-parsons -l eastus --subscription d6653226-8c0c-4ac1-b127-b828ee3cf24f 

#testing deployed endpoint
# curl -X POST -d '{"domain": "Programming", "level":"Advanced", "topic":"Python programming, recursion", "form":"Python function", "numErrors":1, "complexity": 10}' https://gpt-parsons-source.azurewebsites.net/score
# curl -X POST -d '{"domain": "History", "level":"Advanced", "topic":"Soccer world cup", "form":"winner teams", "numErrors":2, "complexity":5}' https://gpt-parsons-source.azurewebsites.net/score
