#!/bin/bash
git pull
docker build -t ton-access-mngr .
docker tag      ton-access-mngr orbsnetwork/ton-access-mngr:v1.1.4
docker push     orbsnetwork/ton-access-mngr:v1.1.4