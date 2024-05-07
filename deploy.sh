#!/bin/bash

# make sure version in package json and dockerfile match

git pull
docker build -t ton-access-mngr .
docker tag      ton-access-mngr orbsnetwork/ton-access-mngr:v1.1.5
docker push     orbsnetwork/ton-access-mngr:v1.1.5  