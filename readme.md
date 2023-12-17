# Mngr
ton Access Node container, which test its sibling proto-nets v2-mainnet, v4-testnet
and also fetch the nodes from the edge

## Endpoints
- `/` returns health status of proto-nets (edge*nginx calls this upon a /mngr call to the edge)
- `/nodes` returns a list of all nodes
- `/v1/nodes` returns a list of all nodes in legacy v1 format to replace edge implementation
- `/status` [not used]returns status code and text (redundant - not used by edge or client)
- `/health` healthcheck for edge, return true if atleast one protonet is serving

## Releases
`v1.1.1`
- try & catch on nodes list
- disable ws test untill it is production grade

`v1.1.0`
- dynamic healthcheck calls on the backend for /nodes
- /v1/nodes legacy nodes
- health is based on atleast one healthy protonet
- nodes list is unity of beName2Id with edge installed backends

`1.0.2`
- Serail calls to sibling and protonets containers to avoid stability issues
- loop interval waits a minute between every cycle, instead of setInterval

`1.0.1`
- First version parallel calls to sibling and protonets containers
