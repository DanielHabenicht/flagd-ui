FROM mcr.microsoft.com/azure-storage/azurite

COPY 127.0.0.1.pem /certs/127.0.0.1.pem
COPY 127.0.0.1-key.pem /certs/127.0.0.1-key.pem

RUN echo -e '#!/bin/sh\n\
    azurite -l /data --blobHost 0.0.0.0 --queueHost 0.0.0.0 --tableHost 0.0.0.0 --oauth basic --cert /certs/127.0.0.1.pem --key /certs/127.0.0.1-key.pem\n'\
    >> startup.sh

RUN chmod +x startup.sh

CMD "./startup.sh"