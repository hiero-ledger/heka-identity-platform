# Heka Identity Service -  API

The Identity Service provides a REST API (by default, it is available at <http://localhost:3000> for the locally running application). This API can be explored and accessed via Swagger UI which is available at `/docs` path (<http://localhost:3000/docs> for the case above).
Since API methods often initiate asynchronous processes, the Generic Agency server provides notification events to inform clients of any updates to the process. These notifications can be received through a webhook URL or a WebSocket connection, you can choose your preferred method for receiving notification using `/user` endpoint.

There are three types of notification events that the server can send:

1. Connection State Change

- `id`: the unique identifier of connection record
- `type`: ConnectionStateChanged (Credo event type)
- `state`: start / invitation / abandoned / completed
- `details` (data from connection record)

  ```json
  {
    "threadId": "string",
    "did": "string",
    "theirDid": "string",
    "theirLabel": "string",
    "alias": "string",
    "imageUrl": "string",
    "errorMessage": "string",
    "invitationDid": "string"
  }
  ```

2. Credential State Change

- `id`: the unique identifier of credential record
- `type`: CredentialStateChanged / RevocationNotificationReceived (Credo event type)
- `state`: offer-sent / credential-issued / declined / done
- `details` (data from credential record)

  ```json
  {
    "connectionId": "string",
    "threadId": "string",
    "errorMessage": "string",
    "credentialAttributes": [
      {
        "name": "string",
        "value": "string"
      }
    ]
  }
  ```

3. Proof State Change

- `id`: the unique identifier of proof record
- `type`: ProofStateChanged (Credo event type)
- `state`: request-sent / presentation-received / declined / done
- `details` (data from proof record)

  ```json
  {
    "connectionId": "string",
    "threadId": "string",
    "isVerified": true,
    "errorMessage": "string"
  }
  ```
