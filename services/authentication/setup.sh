#!/bin/bash
echo "Removing old containers and images..."
docker rm generate-keycloak-setup --force || true
docker rm generate-keycloak-setup-stage --force || true
docker image rm generate-keycloak-setup-stage --force || true

echo "Starting Keycloak container"
docker run --name generate-keycloak-setup --env KEYCLOAK_ADMIN=admin --env KEYCLOAK_ADMIN_PASSWORD=admin -d quay.io/keycloak/keycloak:latest start-dev

# Wait for server start
while ! docker logs generate-keycloak-setup | grep -q "Installed features";
do
    sleep 1
    echo "waiting for server start..."
done

echo "Generating keycloak configuration..."
# Spawn a shell inside the container and modify the realms, user etc 
cat <<EOF | docker exec -i generate-keycloak-setup sh
# Login into keycloak with admin credentials
/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --user admin --password admin --realm master

/opt/keycloak/bin/kcadm.sh create realms -s realm=flagd-ui -s enabled=true
/opt/keycloak/bin/kcadm.sh update realms/flagd-ui/users/profile -s unmanagedAttributePolicy=ENABLED

# Create Claim Mapper
/opt/keycloak/bin/kcadm.sh create -x "client-scopes" --target-realm=flagd-ui --server http://localhost:8080 -s name=flagd-ui -s protocol=openid-connect -s id=3d68dadc-bd71-4dce-93fe-d486fb67b83d -s 'description=Mapper for the flagd-ui'
/opt/keycloak/bin/kcadm.sh create -x "client-scopes/3d68dadc-bd71-4dce-93fe-d486fb67b83d/protocol-mappers/models" --target-realm=flagd-ui --server http://localhost:8080 -s name=user-attribute-id-mapper -s protocol=openid-connect -s protocolMapper=oidc-usermodel-attribute-mapper -s id=4281e4b4-63bc-4f68-a23c-5c1606725ad6 -s 'config."introspection.token.claim"=false' -s 'config."multivalued"=false' -s 'config."userinfo.token.claim"=true' -s 'config."id.token.claim"=true' -s 'config."claim.name"=id' -s 'config."jsonType.label"=String' -s 'config."user.attribute"=custom-id' -s 'config."access.token.claim"=true'
/opt/keycloak/bin/kcadm.sh create -x "client-scopes/3d68dadc-bd71-4dce-93fe-d486fb67b83d/protocol-mappers/models" --target-realm=flagd-ui --server http://localhost:8080 -s name=user-attribute-role-mapper -s protocol=openid-connect -s protocolMapper=oidc-usermodel-attribute-mapper -s id=b783ca7e-cc53-4d5e-9da4-2f5d5db8e35a -s 'config."introspection.token.claim"=false' -s 'config."multivalued"=true' -s 'config."userinfo.token.claim"=true' -s 'config."id.token.claim"=true' -s 'config."claim.name"=roles' -s 'config."jsonType.label"=String' -s 'config."user.attribute"=role' -s 'config."access.token.claim"=true'
/opt/keycloak/bin/kcadm.sh create -x "client-scopes/3d68dadc-bd71-4dce-93fe-d486fb67b83d/protocol-mappers/models" --target-realm=flagd-ui --server http://localhost:8080 -s name=user-attribute-groups-mapper -s protocol=openid-connect -s protocolMapper=oidc-usermodel-attribute-mapper -s id=014c35db-48e1-4a9d-b8fb-35ea17220bcf -s 'config."introspection.token.claim"=false' -s 'config."multivalued"=true' -s 'config."userinfo.token.claim"=true' -s 'config."id.token.claim"=true' -s 'config."claim.name"=groups' -s 'config."jsonType.label"=String' -s 'config."user.attribute"=group' -s 'config."access.token.claim"=true'
/opt/keycloak/bin/kcadm.sh create -x "client-scopes/3d68dadc-bd71-4dce-93fe-d486fb67b83d/protocol-mappers/models" --target-realm=flagd-ui --server http://localhost:8080 -s name=audience -s protocol=openid-connect -s protocolMapper=oidc-audience-mapper -s id=b8c9fa21-6cc6-4fef-a12f-fb6a7ef0a652 -s 'config."introspection.token.claim"=true' -s 'config."included.client.audience"=flagd-ui' -s 'config."included.custom.audience"=' -s 'config."id.token.claim"=false' -s 'config."access.token.claim"=true' -s 'config."lightweight.claim"=false'

# Create Client for the flagd-ui
/opt/keycloak/bin/kcadm.sh create clients --target-realm=flagd-ui --server http://localhost:8080 -s clientId=flagd-ui -s enabled=true -s secret=b1a44ee2-1699-4da8-8e83-874a983e33e7 -s id=206a5ca5-7230-4568-a1ca-5ebe0cba791c -s 'redirectUris=["*"]' -s 'webOrigins=["*"]' -s 'publicClient=true' -s 'attributes."post.logout.redirect.uris"=*' -s directAccessGrantsEnabled=true -s 'attributes."access.token.lifespan"=86400' -s implicitFlowEnabled=true
/opt/keycloak/bin/kcadm.sh update -x clients/206a5ca5-7230-4568-a1ca-5ebe0cba791c/optional-client-scopes/3d68dadc-bd71-4dce-93fe-d486fb67b83d --target-realm=flagd-ui

# Create users and set passwords
# User
/opt/keycloak/bin/kcadm.sh create users --target-realm=flagd-ui --server http://localhost:8080 -s username=user -s enabled=true -s email=user@test.de -s firstName=user -s lastName=User -s emailVerified=true -s attributes.custom-id=1fb1f765-5cb0-4b3c-9485-1c4358834d0b-any-format -s attributes.role=user -s 'attributes.group=["b0bf4cf1-8326-44d6-b60a-0db850052b70", "random_group", "user_group"]'
/opt/keycloak/bin/kcadm.sh set-password --target-realm=flagd-ui --server http://localhost:8080 --username user --new-password password

EOF

# Stop running server and make an image
docker stop generate-keycloak-setup
docker commit generate-keycloak-setup generate-keycloak-setup-stage

# Export to realm.json
docker run --mount type=bind,source=$(pwd),target=/tmp/export --name generate-keycloak-setup-stage generate-keycloak-setup-stage export --realm flagd-ui --dir /tmp/export

docker rm generate-keycloak-setup
docker rm generate-keycloak-setup-stage
docker image rm generate-keycloak-setup-stage


# Debugging
# /opt/keycloak/bin/kcadm.sh get clients -r flagd-ui --server http://localhost:8080
# /opt/keycloak/bin/kcadm.sh get -x "client-scopes" --target-realm=flagd-ui --server http://localhost:8080
# /opt/keycloak/bin/kcadm.sh get clients/206a5ca5-7230-4568-a1ca-5ebe0cba791c/protocol-mappers/models/6c5aa465-1352-4ad6-9ed8-8398377cd0fe --target-realm=flagd-ui --server http://localhost:8080



# Other
# /opt/keycloak/bin/kcadm.sh add-roles --realm=flagd-ui --server http://localhost:8080 --username admin --rolename admin-role
# /opt/keycloak/bin/kcadm.sh create roles --realm=flagd-ui --server http://localhost:8080 -s name=admin-role -s 'description=Role for Tool Admins.' -s 'attributes.test=sksid-sk-admin'
