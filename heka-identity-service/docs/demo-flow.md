# Demo Flow

In this demo, we will demonstrate how to connect two agents and perform SSI operations, including creating a connection, offering a credential, and requesting a proof. One agent will act as an Issuer and Verifier (Identity Service Agent), while the other will act as a Holder (Mobile agent).

## Configure demo environment

<!-- textlint-disable textlint-rule-terminology -->

Before proceeding with the demo, it is necessary to set up the Heka Identity Service. Additionally, you will need to install the Heka Wallet Android application.

<!-- textlint-enable -->

### Set up the Heka Identity Service

You can find instructions on how to set up the Heka Identity Service in the [Setup and Configure](setup.md) section. After setting up the service, you should be able to access the Heka Identity Service Swagger UI (by default <http://localhost:3000/docs>). All Issuer and Verifier operations for this demo will be executed from this Swagger UI.

### Install and prepare Heka Wallet Android app

You can install the Heka Wallet app using the APK provided in the repo.

## Authentication/Authorization

To use the Heka Identity Service API, you need to get an auth token.
You can receive this token from a local deployment of [Heka Auth Service](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-auth-service) or by interacting with a third-party OAuth provider (requires changes in JWT configuration, see [corresponding setup guidance](setup.md#auth-service).

Once you have the token, follow these steps to authenticate:

1. Open the Heka Identity Service Swagger page (To access the Swagger page, simple append `/docs` to the URL of the Heka Identity Service).
2. Click the `Authorize` button in the top right corner of the page and enter the received token, then click `Authorize`.

## Creating a connection

For agent communication, you need to create a connection. To create a connection between the Issuer/Verifier (Heka Identity Service Agent) and the Holder (Mobile Agent), follow these steps:

1. On the Swagger page, expand the `POST: /connections/create-invitation` endpoint section and click the `Try it out` button.
2. Fill the `label` and `alias` fields with desired values and click the `Execute` button.
3. If the execution result returns a success code (200), you will receive an invitation URL.
4. To accept this invitation link using the Heka Wallet app, convert it to a QR code, and then scan it using the Heka Wallet app.

After scanning the QR code, a pairwise connection should be created between your Mobile agent and the Heka Identity Service Agent. You can check this connection using the `GET: /connections` endpoint on the Heka Identity Service side or in the Contacts section of the Heka Wallet app.

## Offering a credential

To offer a credential to the Holder, we need a `Public DID`, a `Schema`, and a `Credential Definition`.

### Public DID

To create a Public Issuer DID, follow these steps:

1. On the Swagger page, expand the `POST: /dids` endpoint section and click the `Try it out` button.
2. This endpoint has no parameters, so you can just click the `Execute` button.
3. If the execution result returns a success code (201), a new Public DID and DID Document will be returned in the response body.

### Schema

At the moment, we cannot create schemas. Instead, we can use one of the already predefined schema from the ledger (e.g., `did:partisia:testnet:7345c1c7-7ed6-4921-bc61-16d47eda590d/resources/8fcfc649-b7d8-4e87-8ed2-24a3f60a3538`). You can use the `GET: /schemas/{schemaId}` endpoint to view the attributes of the schema.

### Credential Definition

To create a credential definition, follow these steps:

1. On the Swagger page, expand the `POST: /credential-definitions` endpoint section and click the `Try it out` button.
2. Fill the `issuerId`, `schemaId`, and `tag` fields, and click the "Execute" button.
3. If the execution result returns a success code (201), you will receive credential defenition ID in the response body.

### Offer a credential

Now, let's offer a verifiable credential to the Holder by following these steps:

1. On the Swagger page, expand the `POST: /credentials/offer` endpoint section and click the `Try it out` button.
2. Fill the `connectionId`, `credentialDefinitionId`, `comment`, and `attributes` fields. Note that the attributes must match the selected schema attributes. Click the "Execute" button.
3. If the execution result returns a success code (200), it means that the offer has been sent to the holder, and you will receive a notification about the new credential offer in the Heka Wallet app.
4. Open the Heka Wallet app and click on the `View` button in the `New Credential Offer` notification.
5. On the opened page, you can see the details of the offered credential. To accept the provided credential, click the `Accept` button.
6. If you accept the offer, you will need to wait until the credential is issued and stored in your wallet.

After the credential is issued, you can view it in the credentials tab of the Heka Wallet app.

## Requesting a proof

To request a proof from the Holder, follow these steps:

1. On the Swagger page, expand the `POST: /proofs/request` endpoint section and click the `Try it out` button.
2. Fill the `connectionId`, `name`, `comment` and `proofParams` (Inside `proofParams` you can provide `credentialDefinitionId` or `schemaId` or `attributes` with `predicates`) fields. Click the `Execute` button.
3. If the execution result returns a success code (200), it means that the proof request has been sent to the holder, and you will receive a notification about the new proof request in the Heka Wallet app.
4. Open the Heka Wallet app and click on the `View` button in the `New Proof Request` notification.
5. On the opened page, you can see the details of the proof request. To present the requested proof, click the `Share` button.

After a proof being presented has been formed, it is sent to the verifier. You can view presented proof using `GET /proofs` endpoint
