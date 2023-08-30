# Mngr
ton Access Node container, which test its sibling proto-nets v2-mainnet, v4-testnet
and also fetch the nodes from the edge

## Endpoints
- `/` returns health status of proto-nets (edge*nginx calls this upon a /mngr call to the edge)
- `/nodes` returns a list of all nodes

## Releases
`v1.1.0`
- health is based on atleast one healthy protonet
- nodes list is unity of beName2Id with edge installed backends

`1.0.2`
- Serail calls to sibling and protonets containers to avoid stability issues
- loop interval waits a minute between every cycle, instead of setInterval

`1.0.1`
- First version parallel calls to sibling and protonets containers
