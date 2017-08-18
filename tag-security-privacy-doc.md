# TAG Security & Privacy Review Document

Answering questions from [the questionaire doc here](https://w3ctag.github.io/security-questionnaire/).

*Note: All answers assume that the data that is stored in the database is not being considered something that is introduced by this feature, as the developer can store anything they want in IndexedDB. This feature does NOT increase access or availability of the developer's IndexedDB database anyone outside the origin that can already read/write/create/delete those databases.*


### 3.1. Does this specification deal with personally-identifiable information?
No.

### 3.2. Does this specification deal with high-value data?
No.

### 3.3 Does this specification introduce new state for an origin that persists across browsing sessions?
No, observers do not persist across browsing sessions, and require an open database connection to be created. Database connections close when the browsing state is destroyed.

### 3.4. Does this specification expose persistent, cross-origin state to the web?
No.

### 3.5. Does this specification expose any other data to an origin that it doesn’t currently have access to?
No.

### 3.6. Does this specification enable new script execution/loading mechanisms?
No.

### 3.7. Does this specification allow an origin access to a user’s location?
No.

### 3.8. Does this specification allow an origin access to sensors on a user’s device?
No.

### 3.9. Does this specification allow an origin access to aspects of a user’s local computing environment?
No.

### 3.10. Does this specification allow an origin access to other devices?
No.

### 3.11. Does this specification allow an origin some measure of control over a user agent’s native UI?
No.

### 3.12. Does this specification expose temporary identifiers to the web?
No.

### 3.13. Does this specification distinguish between behavior in first-party and third-party contexts?
No.

### 3.14. How should this specification work in the context of a user agent’s "incognito" mode?
Exact same operation.

### 3.15. Does this specification persist data to a user’s local device?
No.

### 3.16. Does this specification have a "Security Considerations" and "Privacy Considerations" section?
There are no known security or privacy impacts of this feature.

### 3.17. Does this specification allow downgrading default security characteristics?
No.
