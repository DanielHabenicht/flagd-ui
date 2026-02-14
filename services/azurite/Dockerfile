FROM mcr.microsoft.com/azure-storage/azurite

# Create certs directory
RUN mkdir -p /certs

# Create startup script that runs without SSL if certificates are not present
RUN echo '#!/bin/sh' > startup.sh && \
    echo 'if [ -f /certs/127.0.0.1.pem ] && [ -f /certs/127.0.0.1-key.pem ]; then' >> startup.sh && \
    echo '    echo "Starting Azurite with SSL certificates"' >> startup.sh && \
    echo '    azurite -l /data --blobHost 0.0.0.0 --queueHost 0.0.0.0 --tableHost 0.0.0.0 --oauth basic --cert /certs/127.0.0.1.pem --key /certs/127.0.0.1-key.pem' >> startup.sh && \
    echo 'else' >> startup.sh && \
    echo '    echo "Starting Azurite without SSL (certificates not found)"' >> startup.sh && \
    echo '    azurite -l /data --blobHost 0.0.0.0 --queueHost 0.0.0.0 --tableHost 0.0.0.0 --oauth basic' >> startup.sh && \
    echo 'fi' >> startup.sh && \
    chmod +x startup.sh

CMD ["./startup.sh"]