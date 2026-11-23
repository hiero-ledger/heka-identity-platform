# Local Indy Besu network

Files for the `indybesu` profile of the root `docker-compose.yml`: a single-node Indy Besu network (service `indy-besu`), one QBFT validator that also serves RPC, Besu 24.12.2, chain ID 1337.

`genesis.json` and `nodekey` come from the development network of [hyperledger/indy-besu](https://github.com/hyperledger/indy-besu) (`network/config`, commit `543ec57`, Apache-2.0), with `nodekey` being upstream's `validator1` key. The genesis is reduced to one validator: upstream reads its four validators from the `ValidatorControl` contract (`qbft.validatorcontractaddress`); here that setting is removed and `extraData` lists only `validator1` (`0x93917cad…`), encoded with `besu rlp encode --type=QBFT_EXTRA_DATA`. The `alloc` section, i.e. every contract and role, is unchanged. It pre-deploys the Indy Besu contracts at the addresses the identity service and the wallet use:

| Contract                         | Address   |
| -------------------------------- | --------- |
| `IndyDidRegistry`                | `0x…3333` |
| `CredentialDefinitionRegistry`   | `0x…4444` |
| `SchemaRegistry`                 | `0x…5555` |
| `RoleControl`                    | `0x…6666` |
| `AccountControl` (permissioning) | `0x…8888` |

It also gives the Trustee role to five well-known development accounts, among them `0x627306090abaB3A6e1400e9345bC60c78a8BEf57`. That is the account of the identity service's default `INDY_BESU_ENDORSER_PRIVATE_KEY`, so the service needs no key configuration against this network. All keys here are public: never use this genesis or these keys outside local development.

## Run

```bash
# root .env: enable the method in the identity service
IDENTITY_SERVICE_DID_METHODS=indy,key,hedera,indybesu

docker compose --profile keycloak --profile indybesu up -d --build
```

The node produces a block every second. Check with:

```bash
curl -s -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://localhost:8545
```

- **Identity service in Compose:** it reaches the node at `http://indy-besu:8545`, the default of `IDENTITY_SERVICE_INDY_BESU_NODE_ADDRESS`.
- **Identity service run on the host (`yarn start`):** start only the node (`docker compose --profile indybesu up -d indy-besu`) and keep the service default `INDY_BESU_NODE_ADDRESS=http://localhost:8545`.
- **Heka Wallet on a phone:** port 8545 is published on all interfaces. Set `INDY_BESU_RPC_URL=http://<LAN IP of this machine>:8545` in the wallet (see the [wallet README](../../heka-wallet/README.md#indy-besu)).

The node exposes only the `ETH`, `NET` and `WEB3` RPC APIs.

## Reset

The chain lives in the container, so it survives `stop`/`start` and is lost when the container is removed:

```bash
docker compose --profile indybesu rm -sf indy-besu
```

Tenant wallets in Postgres keep the DIDs created before a reset, and those DIDs no longer resolve.
