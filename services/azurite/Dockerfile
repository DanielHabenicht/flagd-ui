FROM mcr.microsoft.com/azure-storage/azurite:3.35.0

RUN mkdir -p /certs

COPY certs/server.pem /certs/server.pem
COPY certs/server-key.pem /certs/server-key.pem

RUN echo '#!/bin/sh' > startup.sh && \
    echo 'echo "Starting Azurite with local SSL certificates"' >> startup.sh && \
    echo 'azurite -l /data --blobHost 0.0.0.0 --queueHost 0.0.0.0 --tableHost 0.0.0.0 --oauth basic --cert /certs/server.pem --key /certs/server-key.pem' >> startup.sh && \
    chmod +x startup.sh

CMD ["./startup.sh"]