FROM alpine/mkcert AS mkcert

RUN mkcert -install && mkcert -cert-file /127.0.0.1.pem -key-file /127.0.0.1-key.pem 127.0.0.1 localhost azurite


FROM mcr.microsoft.com/azure-storage/azurite:3.35.0

RUN mkdir -p /certs

COPY --from=mkcert /127.0.0.1.pem /certs/127.0.0.1.pem
COPY --from=mkcert /127.0.0.1-key.pem /certs/127.0.0.1-key.pem

RUN echo '#!/bin/sh' > startup.sh && \
    echo 'echo "Starting Azurite with SSL certificates"' >> startup.sh && \
    echo 'azurite -l /data --blobHost 0.0.0.0 --queueHost 0.0.0.0 --tableHost 0.0.0.0 --oauth basic --cert /certs/127.0.0.1.pem --key /certs/127.0.0.1-key.pem' >> startup.sh && \
    chmod +x startup.sh

CMD ["./startup.sh"]