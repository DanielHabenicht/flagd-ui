folder_services_azurite = os.path.abspath(os.path.join(dir_path, "..", "..", "..", "..", "services", "azurite"))
cert_path = os.path.abspath(os.path.join(folder_services_azurite, "cacert.pem"))
key_path = os.path.abspath(os.path.join(folder_services_azurite, "127.0.0.1-key.pem"))

# Configure azurite certificates and authentication:
os.environ["REQUESTS_CA_BUNDLE"] = cert_path
with open(key_path, "r", encoding="utf-8") as key:
    private_key = key.read()
    token = jwt.encode(
        payload={
            "aud": "https://storage.azure.com",
            "iss": "https://sts.windows.net/",
            "iat": 0,
            "nbf": 0,
            "exp": 9999999999,
            "acr": "1",
            "aio": "",
            "altsecid": "1:live.com:foo",
            "amr": ["pwd"],
            "appid": "foo",
            "appidacr": "0",
            "email": "foo@foo.com",
            "family_name": "foo",
            "given_name": "foo",
            "groups": ["foo"],
            "idp": "live.com",
            "idtyp": "user",
            "ipaddr": "127.0.0.1",
            "name": "foo",
            "oid": "23657296-5cd5-45b0-a809-d972a7f4dfe1",
            "puid": "",
            "rh": "foo",
            "scp": "user_impersonation",
            "sub": "",
            "tid": "dd0d0df1-06c3-436c-8034-4b9a153097ce",
            "unique_name": "live.com#foo@foo.com",
            "uti": "",
            "ver": "1.0",
            "xms_idrel": "16 5",
        },
        headers={"typ": "JWT", "alg": "RS256", "x5t": "foo", "kid": "foo"},
        key=private_key,
        algorithm="RS256",
    )


class MockToken:
    # https://github.com/Azure/Azurite/issues/537
    expires_on = 9999999999
    refresh_on = None
    token = token
    token_type = "Bearer"


class AzureCredentialStubAsync:
    async def get_token(
        self,
        *scopes: str,
        claims: Optional[str] = None,
        tenant_id: Optional[str] = None,
        enable_cae: bool = False,
        **kwargs: Any,
    ) -> MockToken:
        return MockToken()